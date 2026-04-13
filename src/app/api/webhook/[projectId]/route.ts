import { NextRequest, NextResponse } from "next/server";
import { decodeProjectToken } from "@/lib/store";
import {
  postReviewToSlack,
  uploadScreenshotToSlack,
  generateMarkdownSummary,
} from "@/lib/slack";
import { annotateScreenshot } from "@/lib/annotate";
import {
  ReviewSubmission,
  WebhookEvent,
  AgentationAnnotation,
  WebhookEventType,
} from "@/lib/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---------------------------------------------------------------------------
// Annotation deduplication
// ---------------------------------------------------------------------------
// NOTE: This is an in-memory, best-effort dedup. On serverless platforms like
// Vercel each instance has its own Map, so dedup only works for concurrent
// requests that happen to land on the same warm instance.  For guaranteed
// exactly-once delivery, an external store (e.g. Vercel KV / Redis) would be
// needed — but for the common case (rapid resubmission, Agentation real-time
// events racing with ReviewCapture submit) same-instance dedup is sufficient.
// ---------------------------------------------------------------------------

const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface DedupEntry {
  expiresAt: number;
}

const recentAnnotations = new Map<string, DedupEntry>();

function dedupKey(threadTs: string, annotationId: string): string {
  return `${threadTs}:${annotationId}`;
}

function isDuplicate(threadTs: string, annotationId: string): boolean {
  const key = dedupKey(threadTs, annotationId);
  const entry = recentAnnotations.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return true;
  }
  return false;
}

function markPosted(threadTs: string, annotationId: string): void {
  const key = dedupKey(threadTs, annotationId);
  recentAnnotations.set(key, { expiresAt: Date.now() + DEDUP_TTL_MS });
}

function removePosted(threadTs: string, annotationId: string): void {
  recentAnnotations.delete(dedupKey(threadTs, annotationId));
}

let cleanupCounter = 0;
function maybeCleanup(): void {
  cleanupCounter++;
  if (cleanupCounter < 100) return;
  cleanupCounter = 0;
  const now = Date.now();
  recentAnnotations.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      recentAnnotations.delete(key);
    }
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_EVENTS: WebhookEventType[] = [
  "annotation.add",
  "annotation.delete",
  "annotation.update",
  "annotations.clear",
  "submit",
];

function validateAnnotation(
  ann: unknown,
  index: number
): string | null {
  if (typeof ann !== "object" || ann === null) {
    return `annotations[${index}]: must be an object`;
  }
  const a = ann as Record<string, unknown>;
  if (typeof a.id !== "string" || !a.id) {
    return `annotations[${index}].id: required string`;
  }
  if (typeof a.comment !== "string") {
    return `annotations[${index}].comment: required string`;
  }
  return null;
}

// OPTIONS /api/webhook/[projectId]
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET /api/webhook/[projectId] - Health check
export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const token = decodeProjectToken(params.projectId);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Invalid project token" },
      { status: 400, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      project: token.n,
      threadTs: token.t,
      status: "ready",
      acceptedEvents: VALID_EVENTS,
    },
    { headers: corsHeaders }
  );
}

// POST /api/webhook/[projectId]
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  maybeCleanup();

  const token = decodeProjectToken(params.projectId);
  if (!token) {
    return NextResponse.json(
      { error: "Invalid project token" },
      { status: 400, headers: corsHeaders }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  if (isReviewSubmission(body)) {
    return handleReviewSubmission(token.t, token.n, body);
  } else if (isWebhookEvent(body)) {
    return handleWebhookEvent(token.t, token.n, body);
  }

  return NextResponse.json(
    { error: "Unrecognized payload format" },
    { status: 400, headers: corsHeaders }
  );
}

function isReviewSubmission(body: unknown): body is ReviewSubmission {
  return (
    typeof body === "object" &&
    body !== null &&
    "annotations" in body &&
    Array.isArray((body as ReviewSubmission).annotations) &&
    !("event" in body)
  );
}

function isWebhookEvent(body: unknown): body is WebhookEvent {
  return (
    typeof body === "object" &&
    body !== null &&
    "event" in body &&
    typeof (body as WebhookEvent).event === "string"
  );
}

async function handleReviewSubmission(
  threadTs: string,
  projectName: string,
  submission: ReviewSubmission
) {
  for (let i = 0; i < submission.annotations.length; i++) {
    const err = validateAnnotation(submission.annotations[i], i);
    if (err) {
      return NextResponse.json(
        { error: `Validation failed: ${err}` },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // Decode screenshot BEFORE dedup check so it is available regardless of
  // whether annotations are new or already posted.
  let screenshotBuffer: Buffer | undefined;
  if (submission.screenshot) {
    try {
      const base64Data = submission.screenshot.replace(
        /^data:image\/\w+;base64,/,
        ""
      );
      const rawBuffer = Buffer.from(base64Data, "base64");

      // Overlay numbered annotation markers on the screenshot so each
      // annotation is visually identifiable. We always annotate with ALL
      // annotations (not just non-deduped ones) so the screenshot is a
      // complete visual of the review.
      screenshotBuffer = await annotateScreenshot(
        rawBuffer,
        submission.annotations,
        submission.viewport
      );
    } catch (err) {
      console.error("Failed to decode screenshot:", err);
    }
  }

  const newAnnotations = submission.annotations.filter(
    (ann) => !isDuplicate(threadTs, ann.id)
  );

  if (newAnnotations.length === 0) {
    // All annotations already posted, but still upload the screenshot if one
    // was provided (the typical case when Agentation fires real-time
    // annotation.add events before ReviewCapture sends the final submission
    // with the screenshot attached).
    let screenshotUploaded = false;
    if (screenshotBuffer && screenshotBuffer.length > 0) {
      try {
        await uploadScreenshotToSlack(
          threadTs,
          submission.url,
          submission.annotations.length,
          screenshotBuffer
        );
        screenshotUploaded = true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[Webhook] Screenshot upload failed:", errMsg);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        message: `All ${submission.annotations.length} annotations already posted (deduplicated)${
          screenshotUploaded ? " — screenshot uploaded" : ""
        }`,
        skipped: submission.annotations.length,
      },
      { headers: corsHeaders }
    );
  }

  // Mark annotations as posted BEFORE the async Slack call so that concurrent
  // requests (e.g. Agentation real-time events racing with ReviewCapture
  // submit) see the dedup entry immediately rather than after the slow
  // network round-trip. If the Slack call fails, we remove the entries so
  // the client can retry.
  for (const ann of newAnnotations) {
    markPosted(threadTs, ann.id);
  }

  try {
    await postReviewToSlack(
      threadTs,
      projectName,
      submission.url,
      newAnnotations,
      screenshotBuffer
    );
  } catch (err) {
    for (const ann of newAnnotations) {
      removePosted(threadTs, ann.id);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Webhook] Slack post failed:", errMsg);
    return NextResponse.json(
      { ok: false, error: "Failed to post to Slack", detail: errMsg },
      { status: 502, headers: corsHeaders }
    );
  }

  const markdown = generateMarkdownSummary(
    projectName,
    submission.url,
    newAnnotations
  );

  const skipped = submission.annotations.length - newAnnotations.length;
  return NextResponse.json(
    {
      ok: true,
      message: `Posted ${newAnnotations.length} annotations to Slack${skipped > 0 ? ` (${skipped} deduplicated)` : ""}`,
      posted: newAnnotations.length,
      skipped,
      markdown,
    },
    { headers: corsHeaders }
  );
}

async function handleWebhookEvent(
  threadTs: string,
  projectName: string,
  event: WebhookEvent
) {
  if (!VALID_EVENTS.includes(event.event)) {
    return NextResponse.json(
      { ok: true, message: `Unknown event '${event.event}' acknowledged` },
      { headers: corsHeaders }
    );
  }

  // Decode screenshot if the event carries one (e.g. submit with screenshot
  // attached by ReviewCapture or a similar client).
  let screenshotBuffer: Buffer | undefined;
  if (event.screenshot) {
    try {
      const base64Data = event.screenshot.replace(
        /^data:image\/\w+;base64,/,
        ""
      );
      const rawBuffer = Buffer.from(base64Data, "base64");

      // Overlay annotation markers on the screenshot. Use all annotations
      // when available (submit event), or the single annotation for other
      // event types.
      const annotationsForMarkers =
        event.annotations ?? (event.annotation ? [event.annotation] : []);
      screenshotBuffer = await annotateScreenshot(rawBuffer, annotationsForMarkers);
    } catch (err) {
      console.error("Failed to decode event screenshot:", err);
    }
  }

  if (event.event === "submit" && event.annotations) {
    const newAnnotations = event.annotations.filter(
      (ann: AgentationAnnotation) => !isDuplicate(threadTs, ann.id)
    );

    if (newAnnotations.length === 0) {
      // Still upload screenshot even when annotations are deduped
      let screenshotUploaded = false;
      if (screenshotBuffer && screenshotBuffer.length > 0) {
        try {
          await uploadScreenshotToSlack(
            threadTs,
            event.url,
            event.annotations.length,
            screenshotBuffer
          );
          screenshotUploaded = true;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[Webhook] Screenshot upload failed:", errMsg);
        }
      }

      return NextResponse.json(
        {
          ok: true,
          message: `All ${event.annotations.length} annotations already posted (deduplicated)${
            screenshotUploaded ? " — screenshot uploaded" : ""
          }`,
          skipped: event.annotations.length,
        },
        { headers: corsHeaders }
      );
    }

    for (const ann of newAnnotations) {
      markPosted(threadTs, ann.id);
    }

    try {
      await postReviewToSlack(
        threadTs,
        projectName,
        event.url,
        newAnnotations,
        screenshotBuffer
      );
    } catch (err) {
      for (const ann of newAnnotations) {
        removePosted(threadTs, ann.id);
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Webhook] Slack post failed:", errMsg);
      return NextResponse.json(
        { ok: false, error: "Failed to post to Slack", detail: errMsg },
        { status: 502, headers: corsHeaders }
      );
    }

    const skipped = event.annotations.length - newAnnotations.length;
    return NextResponse.json(
      {
        ok: true,
        message: `Posted ${newAnnotations.length} annotations to Slack${skipped > 0 ? ` (${skipped} deduplicated)` : ""}`,
        posted: newAnnotations.length,
        skipped,
      },
      { headers: corsHeaders }
    );
  }

  if (event.annotation) {
    const validationErr = validateAnnotation(event.annotation, 0);
    if (validationErr) {
      return NextResponse.json(
        { error: `Validation failed: ${validationErr}` },
        { status: 400, headers: corsHeaders }
      );
    }

    if (event.event === "annotation.delete") {
      return NextResponse.json(
        { ok: true, message: "Annotation deleted — acknowledged" },
        { headers: corsHeaders }
      );
    }

    if (event.event !== "annotation.update" && isDuplicate(threadTs, event.annotation.id)) {
      return NextResponse.json(
        { ok: true, message: `Annotation ${event.annotation.id} already posted (deduplicated)` },
        { headers: corsHeaders }
      );
    }

    markPosted(threadTs, event.annotation.id);

    try {
      await postReviewToSlack(
        threadTs,
        projectName,
        event.url,
        [event.annotation],
        screenshotBuffer
      );
    } catch (err) {
      removePosted(threadTs, event.annotation.id);
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Webhook] Slack post failed:", errMsg);
      return NextResponse.json(
        { ok: false, error: "Failed to post to Slack", detail: errMsg },
        { status: 502, headers: corsHeaders }
      );
    }

    const label = event.event === "annotation.update" ? "Updated" : "New";
    return NextResponse.json(
      { ok: true, message: `${label} annotation posted to Slack` },
      { headers: corsHeaders }
    );
  }

  if (event.event === "annotations.clear") {
    return NextResponse.json(
      { ok: true, message: "Annotations cleared — acknowledged" },
      { headers: corsHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, message: `Event ${event.event} acknowledged` },
    { headers: corsHeaders }
  );
}
