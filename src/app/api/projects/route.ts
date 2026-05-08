import { NextRequest, NextResponse } from "next/server";
import {
  createProjectId,
  getLatestReviewGroup,
  listProjects,
  saveProject,
} from "@/lib/store";
import { ProjectConfig, ReviewDestinations, ReviewGrouping } from "@/lib/types";

export async function GET(req: NextRequest) {
  const origin = getOrigin(req);
  const projects = await listProjects();
  const withLinks = await Promise.all(
    projects.map(async (project) => ({
      ...project,
      webhookUrl: `${origin}/api/webhook/${project.id}`,
      latestGroup: await getLatestReviewGroup(project.id),
    }))
  );

  return NextResponse.json({ projects: withLinks });
}

/**
 * POST /api/projects - create a KV-backed project config.
 * The webhook URL now contains an opaque project ID, not destination metadata.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const defaultUrl =
    typeof body.defaultUrl === "string"
      ? body.defaultUrl.trim()
      : typeof body.baseUrl === "string"
        ? body.baseUrl.trim()
        : undefined;
  const grouping = parseGrouping(body.grouping);
  const destinations = parseDestinations(body.destinations);

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const destinationError = validateDestinations(destinations);
  if (destinationError) {
    return NextResponse.json({ error: destinationError }, { status: 400 });
  }

  const now = new Date().toISOString();
  const project: ProjectConfig = {
    id: createProjectId(),
    name,
    defaultUrl,
    grouping,
    destinations,
    createdAt: now,
    updatedAt: now,
  };

  await saveProject(project);

  return NextResponse.json(
    {
      ...project,
      webhookUrl: `${getOrigin(req)}/api/webhook/${project.id}`,
    },
    { status: 201 }
  );
}

function parseGrouping(value: unknown): ReviewGrouping {
  return value === "session" || value === "submission" ? value : "daily";
}

function parseDestinations(value: unknown): ReviewDestinations {
  const destinations = value as Partial<ReviewDestinations> | undefined;
  const slack = destinations?.slack;
  const confluence = destinations?.confluence;

  return {
    slack: {
      enabled: Boolean(slack?.enabled),
      channelId:
        typeof slack?.channelId === "string" && slack.channelId.trim()
          ? slack.channelId.trim()
          : process.env.SLACK_CHANNEL_ID,
    },
    confluence: {
      enabled: Boolean(confluence?.enabled),
      spaceId:
        typeof confluence?.spaceId === "string" && confluence.spaceId.trim()
          ? confluence.spaceId.trim()
          : process.env.CONFLUENCE_SPACE_ID,
      parentPageId:
        typeof confluence?.parentPageId === "string" &&
        confluence.parentPageId.trim()
          ? confluence.parentPageId.trim()
          : process.env.CONFLUENCE_PARENT_PAGE_ID,
    },
  };
}

function validateDestinations(destinations: ReviewDestinations): string | null {
  if (destinations.slack.enabled) {
    if (!process.env.SLACK_BOT_TOKEN) {
      return "Slack is enabled but SLACK_BOT_TOKEN is not configured";
    }
    if (!destinations.slack.channelId) {
      return "Slack is enabled but no Slack channel ID was provided";
    }
  }

  if (destinations.confluence.enabled) {
    if (
      !process.env.CONFLUENCE_BASE_URL ||
      !process.env.CONFLUENCE_EMAIL ||
      !process.env.CONFLUENCE_API_TOKEN
    ) {
      return "Confluence is enabled but Confluence credentials are not configured";
    }
    if (!destinations.confluence.spaceId) {
      return "Confluence is enabled but no Confluence space ID was provided";
    }
  }

  return null;
}

function getOrigin(req: NextRequest): string {
  const host = req.headers.get("host") || "reviewhub-weld.vercel.app";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
