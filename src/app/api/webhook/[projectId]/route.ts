import { NextRequest, NextResponse } from "next/server";
import { decodeProjectToken } from "@/lib/store";
import {
  postReviewToSlack,
  generateMarkdownSummary,
} from "@/lib/slack";
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

  const newAnnotations = submission.annotations.filter(
    (ann) => !isDuplicate(threadTs, ann.id)
  );

  if (newAnnotations.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        message: `All ${submission.annotations.length} annotations already posted (deduplicated)`,
        skipped: submission.annotations.length,
      },
      { headers: corsHeaders }
    );
  }

  let screenshotBuffer: Buffer | undefined;
  if (submission.screenshot) {
    try {
      const base64Data = submission.screenshot.replace(
        /^data:image\/\w+;base64,/,
        ""
      );
      screenshotBuffer = Buffer.from(base64Data, "base64");
    } catch (err) {
      console.error("Failed to decode screenshot:", err);
    }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Webhook] Slack post failed:", errMsg);
    return NextResponse.json(
      { ok: false, error: "Failed to post to Slack", detail: errMsg },
      { status: 502, headers: corsHeaders }
    );
  }

  for (const ann of newAnnotations) {
    markPosted(threadTs, ann.id);
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

  if (event.event === "submit" && event.annotations) {
    const newAnnotations = event.annotations.filter(
      (ann: AgentationAnnotation) => !isDuplicate(threadTs, ann.id)
    );

    if (newAnnotations.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          message: `All ${event.annotations.length} annotations already posted (deduplicated)`,
          skipped: event.annotations.length,
        },
        { headers: corsHeaders }
      );
    }

    try {
      await postReviewToSlack(threadTs, projectName, event.url, newAnnotations);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Webhook] Slack post failed:", errMsg);
      return NextResponse.json(
        { ok: false, error: "Failed to post to Slack", detail: errMsg },
        { status: 502, headers: corsHeaders }
      );
    }

    for (const ann of newAnnotations) {
      markPosted(threadTs, ann.id);
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

    try {
      await postReviewToSlack(threadTs, projectName, event.url, [event.annotation]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Webhook] Slack post failed:", errMsg);
      return NextResponse.json(
        { ok: false, error: "Failed to post to Slack", detail: errMsg },
        { status: 502, headers: corsHeaders }
      );
    }

    markPosted(threadTs, event.annotation.id);

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
