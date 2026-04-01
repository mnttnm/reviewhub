import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import {
  postReviewToSlack,
  generateMarkdownSummary,
} from "@/lib/slack";
import { ReviewSubmission, WebhookEvent } from "@/lib/types";

/**
 * POST /api/webhook/[projectId]
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
  const project = getProject(params.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.slackThreadTs) {
    return NextResponse.json(
      { error: "Project has no Slack thread configured" },
      { status: 400 }
    );
  }

  const body = await req.json();

  // Detect payload type
  if (isReviewSubmission(body)) {
    return handleReviewSubmission(project.slackThreadTs, project.name, body);
  } else if (isWebhookEvent(body)) {
    return handleWebhookEvent(project.slackThreadTs, project.name, body);
  }

  return NextResponse.json(
    { error: "Unrecognized payload format" },
    { status: 400 }
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

  return NextResponse.json({
    ok: true,
    message: `Posted ${submission.annotations.length} annotations to Slack`,
    markdown,
  });
}

async function handleWebhookEvent(
  threadTs: string,
  projectName: string,
  event: WebhookEvent
) {
  // Only handle submit events (batch of all annotations)
  if (event.event !== "submit" || !event.annotations) {
    return NextResponse.json({
      ok: true,
      message: `Event ${event.event} acknowledged (only submit events are posted to Slack)`,
    });
  }

  await postReviewToSlack(
    threadTs,
    projectName,
    event.url,
    event.annotations
  );

  return NextResponse.json({
    ok: true,
    message: `Posted ${event.annotations.length} annotations to Slack`,
  });
}
