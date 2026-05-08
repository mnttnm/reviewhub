import { NextRequest, NextResponse } from "next/server";
import { annotateScreenshot } from "@/lib/annotate";
import { publishReview } from "@/lib/publish";
import { decodeProjectToken, getProject, recordProjectReview } from "@/lib/store";
import { generateMarkdownSummary } from "@/lib/slack";
import {
  AgentationAnnotation,
  ProjectConfig,
  ReviewSubmission,
  WebhookEvent,
  WebhookEventType,
} from "@/lib/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEDUP_TTL_MS = 5 * 60 * 1000;
const recentAnnotations = new Map<string, { expiresAt: number }>();
let cleanupCounter = 0;

const VALID_EVENTS: WebhookEventType[] = [
  "annotation.add",
  "annotation.delete",
  "annotation.update",
  "annotations.clear",
  "submit",
];

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const project = await resolveProject(params.projectId);
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Invalid project" },
      { status: 400, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      project: project.name,
      projectId: project.id,
      grouping: project.grouping,
      destinations: project.destinations,
      acceptedEvents: VALID_EVENTS,
    },
    { headers: corsHeaders }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  maybeCleanup();

  const project = await resolveProject(params.projectId);
  if (!project) {
    return NextResponse.json(
      { error: "Invalid project" },
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
    return handleReviewSubmission(project, body);
  }

  if (isWebhookEvent(body)) {
    return handleWebhookEvent(project, body);
  }

  return NextResponse.json(
    { error: "Unrecognized payload format" },
    { status: 400, headers: corsHeaders }
  );
}

async function handleReviewSubmission(
  project: ProjectConfig,
  submission: ReviewSubmission
) {
  const validation = validateAnnotations(submission.annotations);
  if (validation) {
    return NextResponse.json(
      { error: `Validation failed: ${validation}` },
      { status: 400, headers: corsHeaders }
    );
  }

  const screenshotBuffer = await decodeScreenshot(
    submission.screenshot,
    submission.annotations,
    submission.viewport
  );
  const newAnnotations = submission.annotations.filter(
    (ann) => !isDuplicate(project.id, ann.id)
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

  newAnnotations.forEach((ann) => markPosted(project.id, ann.id));

  const result = await publishReview({
    project,
    pageUrl: submission.url || project.defaultUrl || "Unknown page",
    annotations: newAnnotations,
    screenshotBuffer,
    sessionId: submission.projectId,
  });

  rollbackFailedDedup(project.id, newAnnotations, result);
  if (hasSuccessfulDestination(result)) {
    await recordProjectReview(project.id, newAnnotations.length);
  }

  const markdown = generateMarkdownSummary(
    project.name,
    submission.url || project.defaultUrl || "Unknown page",
    newAnnotations
  );
  const skipped = submission.annotations.length - newAnnotations.length;

  return NextResponse.json(
    {
      ok: hasSuccessfulDestination(result),
      message: `Processed ${newAnnotations.length} annotations${skipped > 0 ? ` (${skipped} deduplicated)` : ""}`,
      posted: newAnnotations.length,
      skipped,
      group: result.group,
      destinations: result.destinations,
      markdown,
    },
    { status: hasSuccessfulDestination(result) ? 200 : 502, headers: corsHeaders }
  );
}

async function handleWebhookEvent(project: ProjectConfig, event: WebhookEvent) {
  if (!VALID_EVENTS.includes(event.event)) {
    return NextResponse.json(
      { ok: true, message: `Unknown event '${event.event}' acknowledged` },
      { headers: corsHeaders }
    );
  }

  if (event.event === "annotation.delete" || event.event === "annotations.clear") {
    return NextResponse.json(
      { ok: true, message: `${event.event} acknowledged` },
      { headers: corsHeaders }
    );
  }

  const annotations = event.annotations ?? (event.annotation ? [event.annotation] : []);
  const validation = validateAnnotations(annotations);
  if (validation) {
    return NextResponse.json(
      { error: `Validation failed: ${validation}` },
      { status: 400, headers: corsHeaders }
    );
  }

  if (annotations.length === 0) {
    return NextResponse.json(
      { ok: true, message: `Event ${event.event} acknowledged` },
      { headers: corsHeaders }
    );
  }

  const screenshotBuffer = await decodeScreenshot(event.screenshot, annotations);
  const newAnnotations =
    event.event === "annotation.update"
      ? annotations
      : annotations.filter((ann) => !isDuplicate(project.id, ann.id));

  if (newAnnotations.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        message: `All ${annotations.length} annotations already posted (deduplicated)`,
        skipped: annotations.length,
      },
      { headers: corsHeaders }
    );
  }

  newAnnotations.forEach((ann) => markPosted(project.id, ann.id));

  const result = await publishReview({
    project,
    pageUrl: event.url || project.defaultUrl || "Unknown page",
    annotations: newAnnotations,
    screenshotBuffer,
  });

  rollbackFailedDedup(project.id, newAnnotations, result);
  if (hasSuccessfulDestination(result)) {
    await recordProjectReview(project.id, newAnnotations.length);
  }

  const skipped = annotations.length - newAnnotations.length;
  return NextResponse.json(
    {
      ok: hasSuccessfulDestination(result),
      message: `Processed ${newAnnotations.length} annotations${skipped > 0 ? ` (${skipped} deduplicated)` : ""}`,
      posted: newAnnotations.length,
      skipped,
      group: result.group,
      destinations: result.destinations,
    },
    { status: hasSuccessfulDestination(result) ? 200 : 502, headers: corsHeaders }
  );
}

async function resolveProject(projectId: string): Promise<ProjectConfig | null> {
  const project = await getProject(projectId);
  if (project) return project;

  const legacy = decodeProjectToken(projectId);
  if (!legacy) return null;

  return {
    id: projectId,
    name: legacy.n,
    grouping: "daily",
    destinations: {
      slack: {
        enabled: true,
        channelId: process.env.SLACK_CHANNEL_ID,
      },
      confluence: {
        enabled: false,
      },
    },
    legacySlackThreadTs: legacy.t,
    reviewCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
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

function validateAnnotations(annotations: AgentationAnnotation[]): string | null {
  for (let i = 0; i < annotations.length; i++) {
    const ann = annotations[i] as unknown as Record<string, unknown>;
    if (typeof ann !== "object" || ann === null) {
      return `annotations[${i}]: must be an object`;
    }
    if (typeof ann.id !== "string" || !ann.id) {
      return `annotations[${i}].id: required string`;
    }
    if (typeof ann.comment !== "string") {
      return `annotations[${i}].comment: required string`;
    }
  }
  return null;
}

async function decodeScreenshot(
  screenshot: string | undefined,
  annotations: AgentationAnnotation[],
  viewport?: ReviewSubmission["viewport"]
): Promise<Buffer | undefined> {
  if (!screenshot) return undefined;

  try {
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
    const rawBuffer = Buffer.from(base64Data, "base64");
    return annotateScreenshot(rawBuffer, annotations, viewport);
  } catch (err) {
    console.error("Failed to decode screenshot:", err);
    return undefined;
  }
}

function isDuplicate(projectId: string, annotationId: string): boolean {
  const entry = recentAnnotations.get(dedupKey(projectId, annotationId));
  return Boolean(entry && entry.expiresAt > Date.now());
}

function markPosted(projectId: string, annotationId: string): void {
  recentAnnotations.set(dedupKey(projectId, annotationId), {
    expiresAt: Date.now() + DEDUP_TTL_MS,
  });
}

function removePosted(projectId: string, annotationId: string): void {
  recentAnnotations.delete(dedupKey(projectId, annotationId));
}

function dedupKey(projectId: string, annotationId: string): string {
  return `${projectId}:${annotationId}`;
}

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

function hasSuccessfulDestination(result: {
  destinations: {
    slack?: { ok: boolean };
    confluence?: { ok: boolean };
  };
}): boolean {
  const destinations = Object.values(result.destinations);
  return destinations.length === 0 || destinations.some((destination) => destination.ok);
}

function rollbackFailedDedup(
  projectId: string,
  annotations: AgentationAnnotation[],
  result: {
    destinations: {
      slack?: { ok: boolean };
      confluence?: { ok: boolean };
    };
  }
): void {
  if (hasSuccessfulDestination(result)) return;
  annotations.forEach((ann) => removePosted(projectId, ann.id));
}
