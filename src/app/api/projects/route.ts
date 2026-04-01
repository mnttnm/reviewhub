import { NextRequest, NextResponse } from "next/server";
import { encodeProjectToken } from "@/lib/store";
import { createProjectThread } from "@/lib/slack";

/**
 * POST /api/projects — create a new project + Slack thread.
 * Returns a stateless token (base64url-encoded) that encodes the Slack thread info.
 * The token is used in the webhook URL — no server-side storage needed.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, baseUrl } = body;

  if (!name || !baseUrl) {
    return NextResponse.json(
      { error: "name and baseUrl are required" },
      { status: 400 }
    );
  }

  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) {
    return NextResponse.json(
      {
        error: "Slack not configured",
        detail: "SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set",
      },
      { status: 500 }
    );
  }

  let slackThreadTs: string;
  try {
    slackThreadTs = await createProjectThread(name, baseUrl);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Failed to create Slack thread:", errMsg);
    return NextResponse.json(
      {
        error: "Failed to create Slack thread",
        detail: errMsg,
        hint: "Make sure the Slack bot is invited to the channel (type /invite @YourBotName in the channel)",
      },
      { status: 500 }
    );
  }

  const token = encodeProjectToken(slackThreadTs, name);

  return NextResponse.json(
    {
      token,
      name,
      baseUrl,
      slackThreadTs,
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  );
}
