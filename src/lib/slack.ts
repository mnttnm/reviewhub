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
          text: `*Prototype URL:* <${baseUrl}|${baseUrl}>\n*Created:* ${new Date().toISOString().slice(0, 10)}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Review submissions from Agentation will appear as replies in this thread.",
          },
        ],
      },
    ],
  });

  if (!result.ts) {
    throw new Error("Failed to create Slack thread \u2014 no timestamp returned");
  }

  return result.ts;
}

/**
 * Post the webhook URL as a reply in the project thread for easy reference.
 */
export async function postWebhookInfo(
  threadTs: string,
  webhookUrl: string
): Promise<void> {
  const slack = getSlackClient();
  const channelId = getChannelId();

  await slack.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: `Webhook URL: ${webhookUrl}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Webhook URL (save this):*\n\`${webhookUrl}\``,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Add to your prototype:*\n\`\`\`import { Agentation } from "agentation";\n\n<Agentation webhookUrl="${webhookUrl}" />\`\`\``,
        },
      },
    ],
  });
}

const KIND_EMOJI: Record<string, string> = {
  feedback: "\ud83d\udcac",
  placement: "\ud83d\udcd0",
  rearrange: "\ud83d\udd00",
};

/**
 * Format a single annotation into a rich, readable Slack text block.
 * Designed to be useful for both humans (visual context) and AI agents (structured selectors).
 */
function formatAnnotationLine(index: number, ann: AgentationAnnotation): string {
  const severity = ann.severity
    ? SEVERITY_EMOJI[ann.severity] || ""
    : "\u2b1c";
  const intent = ann.intent ? INTENT_LABEL[ann.intent] || ann.intent : "";
  const intentStr = intent ? ` *${intent}*` : "";
  const kindEmoji = ann.kind ? KIND_EMOJI[ann.kind] || "" : "";
  const kindStr = kindEmoji ? ` ${kindEmoji}` : "";

  const comment = ann.comment.replace(/\n/g, " ").slice(0, 300);

  const parts: string[] = [`*#${index}* ${severity}${intentStr}${kindStr} \u2014 \u201c${comment}\u201d`];

  // What the user was looking at (human-friendly)
  if (ann.selectedText) {
    parts.push(`\ud83d\udcdd *Selected text:* \u201c${ann.selectedText.slice(0, 120)}\u201d`);
  }
  if (ann.nearbyText) {
    parts.push(`\ud83d\udc41\ufe0f *Nearby text:* \u201c${ann.nearbyText.slice(0, 120)}\u201d`);
  }

  // Where in the UI (for developers and agents)
  if (ann.elementPath) {
    parts.push(`\ud83c\udfaf *Selector:* \`${ann.elementPath}\``);
  }
  if (ann.reactComponents) {
    parts.push(`\u269b\ufe0f *Component:* \`${ann.reactComponents}\``);
  }
  if (ann.element) {
    const tag = ann.cssClasses
      ? `<${ann.element} class="${ann.cssClasses.slice(0, 80)}">`
      : `<${ann.element}>`;
    parts.push(`\ud83c\udff7\ufe0f *Element:* \`${tag}\``);
  }

  // Visual properties (helps agents locate and fix)
  if (ann.computedStyles) {
    parts.push(`\ud83c\udfa8 *Styles:* \`${ann.computedStyles.slice(0, 150)}\``);
  }
  if (ann.accessibility) {
    parts.push(`\u267f *Accessibility:* \`${ann.accessibility.slice(0, 100)}\``);
  }

  // Position info
  const positionParts: string[] = [];
  if (ann.x !== undefined) positionParts.push(`x: ${ann.x.toFixed(1)}%`);
  if (ann.y !== undefined) positionParts.push(`y: ${ann.y}px`);
  if (ann.boundingBox) {
    const bb = ann.boundingBox;
    positionParts.push(`box: ${bb.width}\u00d7${bb.height} at (${bb.x},${bb.y})`);
  }
  if (positionParts.length > 0) {
    parts.push(`\ud83d\udccf *Position:* ${positionParts.join(" \u2022 ")}`);
  }

  // Layout mode specifics
  if (ann.kind === "placement" && ann.placement) {
    parts.push(`\ud83d\udcd0 *Place:* \`${ann.placement.componentType}\` (${ann.placement.width}\u00d7${ann.placement.height}px)`);
    if (ann.placement.text) {
      parts.push(`    Label: \u201c${ann.placement.text}\u201d`);
    }
  }
  if (ann.kind === "rearrange" && ann.rearrange) {
    parts.push(`\ud83d\udd00 *Rearrange:* \`${ann.rearrange.selector}\` (\u201c${ann.rearrange.label}\u201d)`);
  }

  // Page URL if present on annotation
  if (ann.url) {
    parts.push(`\ud83d\udcc4 *Page:* <${ann.url}|${ann.url}>`);
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
    const kindBadge = ann.kind && ann.kind !== "feedback" ? ` (${ann.kind})` : "";

    lines.push(`## #${i + 1}${severityBadge}${intentBadge}${kindBadge}`);
    lines.push(``);

    // Human-readable context
    if (ann.selectedText) {
      lines.push(`**Selected Text:** "${ann.selectedText}"`);
    }
    if (ann.nearbyText) {
      lines.push(`**Nearby Text:** "${ann.nearbyText}"`);
    }

    // Technical identifiers
    if (ann.elementPath) {
      lines.push(`**Element:** \`${ann.elementPath}\``);
    }
    if (ann.reactComponents) {
      lines.push(`**Component:** \`${ann.reactComponents}\``);
    }
    if (ann.element) {
      const tag = ann.cssClasses ? `<${ann.element} class="${ann.cssClasses}">` : `<${ann.element}>`;
      lines.push(`**Tag:** \`${tag}\``);
    }

    // Visual properties
    if (ann.computedStyles) {
      lines.push(`**Styles:** \`${ann.computedStyles}\``);
    }
    if (ann.accessibility) {
      lines.push(`**Accessibility:** \`${ann.accessibility}\``);
    }

    // Position
    const posParts: string[] = [];
    if (ann.x !== undefined) posParts.push(`x: ${ann.x.toFixed(1)}%`);
    if (ann.y !== undefined) posParts.push(`y: ${ann.y}px`);
    if (ann.boundingBox) {
      const bb = ann.boundingBox;
      posParts.push(`box: ${bb.width}x${bb.height} at (${bb.x},${bb.y})`);
    }
    if (posParts.length > 0) {
      lines.push(`**Position:** ${posParts.join(" | ")}`);
    }

    // Layout mode
    if (ann.kind === "placement" && ann.placement) {
      lines.push(`**Place:** \`${ann.placement.componentType}\` (${ann.placement.width}x${ann.placement.height}px)`);
    }
    if (ann.kind === "rearrange" && ann.rearrange) {
      lines.push(`**Rearrange:** \`${ann.rearrange.selector}\` ("${ann.rearrange.label}")`);
    }

    if (ann.url) {
      lines.push(`**Page:** ${ann.url}`);
    }

    lines.push(``);
    lines.push(`> ${ann.comment.replace(/\n/g, "\n> ")}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  });

  return lines.join("\n");
}
