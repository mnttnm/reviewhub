import { NextRequest, NextResponse } from "next/server";
import { decodeProjectToken } from "@/lib/store";
import {
  postReviewToSlack,
  generateMarkdownSummary,
} from "@/lib/slack";
import { ReviewSubmission, WebhookEvent } from "@/lib/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// OPTIONS /api/webhook/[projectId] — CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * POST /api/webhook/[projectId]
 *
 * The projectId is a base64url-encoded token containing the Slack thread info.
 * This is fully stateless — no server-side storage needed.
 *
 * Accepts two payload formats:
 * 1. ReviewSubmission — from the ReviewCapture client component (includes screenshot)
 * 2. WebhookEvent — from Agentation's native webhook (submit event with annotations)
 *
 * Both result in a Slack message posted to the project's thread.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const token = decodeProjectToken(params.projectId);
  if (!token) {
    return NextResponse.json(
      { error: "Invalid project token" },
      { status: 400, headers: corsHeaders }
    );
  }

  const body = await req.json();

  // Detect payload type
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
    Array.isArray((body as ReviewSubmission).annotations)
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
  // Decode base64 screenshot if provided
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

  await postReviewToSlack(
    threadTs,
    projectName,
    submission.url,
    submission.annotations,
    screenshotBuffer
  );

  // Generate markdown summary
  const markdown = generateMarkdownSummary(
    projectName,
    submission.url,
    submission.annotations
  );

  return NextResponse.json(
    {
      ok: true,
      message: `Posted ${submission.annotations.length} annotations to Slack`,
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
  // Only handle submit events (batch of all annotations)
  if (event.event !== "submit" || !event.annotations) {
    return NextResponse.json(
      {
        ok: true,
        message: `Event ${event.event} acknowledged (only submit events are posted to Slack)`,
      },
      { headers: corsHeaders }
    );
  }

  await postReviewToSlack(
    threadTs,
    projectName,
    event.url,
    event.annotations
  );

  return NextResponse.json(
    {
      ok: true,
      message: `Posted ${event.annotations.length} annotations to Slack`,
    },
    { headers: corsHeaders }
  );
}
