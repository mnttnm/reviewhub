import { createReviewPage, appendReviewToPage } from "./confluence";
import { getReviewGroupId, getReviewGroupLabel } from "./groups";
import {
  getReviewGroup,
  saveLatestReviewGroup,
  saveReviewGroup,
} from "./store";
import { createProjectThread, postReviewToSlack } from "./slack";
import {
  AgentationAnnotation,
  ProjectConfig,
  ReviewGroupState,
} from "./types";

export interface PublishResult {
  group: ReviewGroupState;
  destinations: {
    slack?: { ok: boolean; url?: string; error?: string };
    confluence?: { ok: boolean; url?: string; error?: string };
  };
}

export async function publishReview(input: {
  project: ProjectConfig;
  pageUrl: string;
  annotations: AgentationAnnotation[];
  screenshotBuffer?: Buffer;
  sessionId?: string;
}): Promise<PublishResult> {
  const groupId = getReviewGroupId(input.project, new Date(), input.sessionId);
  const label = getReviewGroupLabel(input.project, groupId);
  const existing = await getReviewGroup(input.project.id, groupId);
  const now = new Date().toISOString();
  const group: ReviewGroupState =
    existing ?? {
      id: groupId,
      projectId: input.project.id,
      label,
      createdAt: now,
      updatedAt: now,
    };

  const destinations: PublishResult["destinations"] = {};

  if (input.project.destinations.slack.enabled) {
    destinations.slack = await publishToSlack(input, group);
  }

  if (input.project.destinations.confluence.enabled) {
    destinations.confluence = await publishToConfluence(input, group);
  }

  group.updatedAt = new Date().toISOString();
  await saveReviewGroup(group);
  await saveLatestReviewGroup(group);

  return { group, destinations };
}

async function publishToSlack(
  input: {
    project: ProjectConfig;
    pageUrl: string;
    annotations: AgentationAnnotation[];
    screenshotBuffer?: Buffer;
  },
  group: ReviewGroupState
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const channelId = input.project.destinations.slack.channelId;
    if (!group.slack) {
      if (input.project.legacySlackThreadTs) {
        group.slack = {
          channelId: channelId || process.env.SLACK_CHANNEL_ID || "",
          threadTs: input.project.legacySlackThreadTs,
        };
      } else {
        const thread = await createProjectThread(
          input.project.name,
          group.label,
          channelId
        );
        group.slack = {
          channelId: channelId || process.env.SLACK_CHANNEL_ID || "",
          threadTs: thread.threadTs,
          url: thread.url,
        };
      }
    }

    await postReviewToSlack(
      group.slack.channelId,
      group.slack.threadTs,
      input.project.name,
      input.pageUrl,
      input.annotations,
      input.screenshotBuffer
    );

    return { ok: true, url: group.slack.url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Publish] Slack failed:", error);
    return { ok: false, url: group.slack?.url, error };
  }
}

async function publishToConfluence(
  input: {
    project: ProjectConfig;
    pageUrl: string;
    annotations: AgentationAnnotation[];
  },
  group: ReviewGroupState
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    if (!group.confluence) {
      const page = await createReviewPage(input.project, group.label);
      group.confluence = {
        pageId: page.pageId,
        url: page.url,
      };
    }

    const updated = await appendReviewToPage({
      pageId: group.confluence.pageId,
      projectName: input.project.name,
      pageUrl: input.pageUrl,
      annotations: input.annotations,
      slackUrl: group.slack?.url,
    });

    if (updated.url) {
      group.confluence.url = updated.url;
    }

    return { ok: true, url: group.confluence.url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Publish] Confluence failed:", error);
    return { ok: false, url: group.confluence?.url, error };
  }
}
