import { NextRequest, NextResponse } from "next/server";
import { getAllProjects, createProject } from "@/lib/store";
import { createProjectThread } from "@/lib/slack";

// GET /api/projects — list all projects
export async function GET() {
  const projects = getAllProjects();
  return NextResponse.json(projects);
}

// POST /api/projects — create a new project + Slack thread
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, baseUrl } = body;

  if (!name || !baseUrl) {
    return NextResponse.json(
      { error: "name and baseUrl are required" },
      { status: 400 }
    );
  }

  let slackThreadTs: string | null = null;

  // Create Slack thread if Slack is configured
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
    try {
      slackThreadTs = await createProjectThread(name, baseUrl);
    } catch (err) {
      console.error("Failed to create Slack thread:", err);
      // Continue without Slack — project still gets created
    }
  }

  const project = createProject(name, baseUrl, slackThreadTs);
  return NextResponse.json(project, { status: 201 });
}
