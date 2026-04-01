import { WebClient } from "@slack/web-api";
import { AgentationAnnotation } from "./types";

let client: WebClient | null = null;

function getSlackClient(): WebClient {
  if (client) return client;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing SLACK_BOT_TOKEN environment variable");
  }
  client = new WebClient(token);
  return client;
}

function getChannelId(): string {
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!channelId) {
    throw new Error("Missing SLACK_CHANNEL_ID environment variable");
  }
  return channelId;
}

const SEVERITY_EMOJI: Record<string, string> = {
  blocking: "\ud83d\udd34",
  important: "\ud83d\udfe1",
  suggestion: "\ud83d\udfe2",
};

const INTENT_LABEL: Record<string, string> = {
  fix: "Fix",
  change: "Change",
  question: "Question",
  approve: "Approve",
};

/**
 * Create a new Slack thread for a project. Returns the thread timestamp.
 */
export async function createProjectThread(
  projectName: string,
  baseUrl: string
): Promise<string> {
  const slack = getSlackClient();
  const channelId = getChannelId();

  const result = await slack.chat.postMessage({
    channel: channelId,
    text: `New review project: ${projectName}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `\ud83d\udccb ${projectName}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*URL:* <${baseUrl}|${baseUrl}>\n*Created:* ${new Date().toISOString().slice(0, 10)}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Review submissions from Agentation will appear in this thread.",
          },
        ],
      },
    ],
  });

  if (!result.ts) {
    throw new Error("Failed to create Slack thread — no timestamp returned");
  }

  return result.ts;
}

/**
 * Format a single annotation into a readable Slack text line.
 */
function formatAnnotationLine(index: number, ann: AgentationAnnotation): string {
  const severity = ann.severity
    ? SEVERITY_EMOJI[ann.severity] || ""
    : "\u2b1c";
  const intent = ann.intent ? INTENT_LABEL[ann.intent] || ann.intent : "";
  const intentStr = intent ? ` *${intent}*` : "";

  const comment = ann.comment.replace(/\n/g, " ").slice(0, 200);

  const parts: string[] = [`*#${index}* ${severity}${intentStr} \u2014 \u201c${comment}\u201d`];

  // Element identification — multiple fallback strategies
  if (ann.selectedText) {
    parts.push(`    \ud83d\udcdd Text: \`${ann.selectedText.slice(0, 100)}\``);
  }
  if (ann.elementPath) {
    parts.push(`    \ud83c\udfaf Selector: \`${ann.elementPath}\``);
  }
  if (ann.reactComponents) {
    parts.push(`    \u269b\ufe0f Component: \`${ann.reactComponents}\``);
  }

  return parts.join("\n");
}

/**
 * Post a review submission (screenshot + annotations) to a Slack thread.
 */
export async function postReviewToSlack(
  threadTs: string,
  projectName: string,
  pageUrl: string,
  annotations: AgentationAnnotation[],
  screenshotBuffer?: Buffer
): Promise<void> {
  const slack = getSlackClient();
  const channelId = getChannelId();

  // Upload screenshot if provided
  if (screenshotBuffer && screenshotBuffer.length > 0) {
    try {
      await slack.filesUploadV2({
        channel_id: channelId,
        thread_ts: threadTs,
        file: screenshotBuffer,
        filename: `review-${Date.now()}.png`,
        title: `Screenshot — ${pageUrl}`,
        initial_comment: `\ud83d\uddbc\ufe0f *Review submission* for <${pageUrl}|${pageUrl}>\n${annotations.length} annotation${annotations.length === 1 ? "" : "s"}`,
      });
    } catch (err) {
      console.error("Failed to upload screenshot to Slack:", err);
      // Continue posting annotations even if screenshot upload fails
    }
  }

  // Build annotation summary message
  if (annotations.length === 0) return;

  const annotationLines = annotations.map((ann, i) =>
    formatAnnotationLine(i + 1, ann)
  );

  const summaryBlocks = [
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: screenshotBuffer
          ? `*Annotations:*`
          : `\ud83d\uddbc\ufe0f *Review submission* for <${pageUrl}|${pageUrl}>\n${annotations.length} annotation${annotations.length === 1 ? "" : "s"}\n\n*Annotations:*`,
      },
    },
    {
      type: "divider" as const,
    },
    ...annotationLines.map((line) => ({
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: line,
      },
    })),
    {
      type: "context" as const,
      elements: [
        {
          type: "mrkdwn" as const,
          text: `\ud83d\udd52 ${new Date().toISOString()} \u2022 ${annotations.length} item${annotations.length === 1 ? "" : "s"}`,
        },
      ],
    },
  ];

  // Slack blocks limit is 50; chunk if needed
  const BLOCK_LIMIT = 50;
  for (let i = 0; i < summaryBlocks.length; i += BLOCK_LIMIT) {
    const chunk = summaryBlocks.slice(i, i + BLOCK_LIMIT);
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `Review: ${annotations.length} annotations on ${pageUrl}`,
      blocks: chunk,
    });
  }
}

/**
 * Generate a markdown summary from annotations (for file attachment).
 */
export function generateMarkdownSummary(
  projectName: string,
  pageUrl: string,
  annotations: AgentationAnnotation[]
): string {
  const lines: string[] = [
    `# Review: ${projectName}`,
    ``,
    `**URL:** ${pageUrl}`,
    `**Date:** ${new Date().toISOString()}`,
    `**Total annotations:** ${annotations.length}`,
    ``,
    `---`,
    ``,
  ];

  annotations.forEach((ann, i) => {
    const severityBadge = ann.severity ? ` [${ann.severity}]` : "";
    const intentBadge = ann.intent ? ` — ${ann.intent}` : "";

    lines.push(`## #${i + 1}${severityBadge}${intentBadge}`);
    lines.push(``);

    if (ann.selectedText) {
      lines.push(`**Selected Text:** "${ann.selectedText}"`);
    }
    if (ann.elementPath) {
      lines.push(`**Element:** \`${ann.elementPath}\``);
    }
    if (ann.reactComponents) {
      lines.push(`**Component:** ${ann.reactComponents}`);
    }
    if (ann.cssClasses) {
      lines.push(`**CSS Classes:** \`${ann.cssClasses}\``);
    }
    if (ann.computedStyles) {
      lines.push(`**Computed Styles:** ${ann.computedStyles}`);
    }
    lines.push(`**Position:** (${ann.x}, ${ann.y})`);
    lines.push(``);
    lines.push(`> ${ann.comment.replace(/\n/g, "\n> ")}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  });

  return lines.join("\n");
}
