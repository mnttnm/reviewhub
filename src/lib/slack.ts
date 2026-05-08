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

export function getDefaultChannelId(): string | undefined {
  return process.env.SLACK_CHANNEL_ID;
}

function resolveChannelId(channelId?: string): string {
  const resolved = channelId || getDefaultChannelId();
  if (!resolved) {
    throw new Error("Missing SLACK_CHANNEL_ID environment variable");
  }
  return resolved;
}

/**
 * Retry a function with exponential backoff.
 * Retries up to `maxAttempts` times with delays of 1s, 2s, 4s.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRateLimit =
        err instanceof Error && err.message.includes("rate_limited");
      const isTransient =
        err instanceof Error &&
        (err.message.includes("ETIMEDOUT") ||
          err.message.includes("ECONNRESET") ||
          err.message.includes("service_unavailable"));

      if (attempt < maxAttempts && (isRateLimit || isTransient)) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(
          `[Slack] Attempt ${attempt}/${maxAttempts} failed (${isRateLimit ? "rate_limited" : "transient"}), retrying in ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
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
  label: string,
  channelId?: string
): Promise<{ threadTs: string; url?: string }> {
  const slack = getSlackClient();
  const resolvedChannelId = resolveChannelId(channelId);

  const result = await withRetry(() =>
    slack.chat.postMessage({
      channel: resolvedChannelId,
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
            text: `*Review group:* ${label}\n*Created:* ${new Date().toISOString().slice(0, 10)}`,
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
    })
  );

  if (!result.ts) {
    throw new Error("Failed to create Slack thread \u2014 no timestamp returned");
  }

  return {
    threadTs: result.ts,
    url: await getSlackPermalink(resolvedChannelId, result.ts),
  };
}

/**
 * Post the webhook URL as a reply in the project thread for easy reference.
 */
export async function postWebhookInfo(
  threadTs: string,
  webhookUrl: string,
  channelId?: string
): Promise<void> {
  const slack = getSlackClient();
  const resolvedChannelId = resolveChannelId(channelId);

  await withRetry(() =>
    slack.chat.postMessage({
      channel: resolvedChannelId,
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
    })
  );
}

/**
 * Format a single annotation for scanning. Keep this intentionally compact:
 * comment, reviewed page, and enough element context to locate the issue.
 */
function formatAnnotationLine(
  index: number,
  ann: AgentationAnnotation,
  pageUrl: string
): string {
  const severity = ann.severity
    ? SEVERITY_EMOJI[ann.severity] || ""
    : "";
  const intent = ann.intent ? INTENT_LABEL[ann.intent] || ann.intent : "";
  const labels = [severity, intent].filter(Boolean).join(" ");
  const title = labels ? `*#${index}* ${labels}` : `*#${index}*`;

  const parts: string[] = [
    `${title}\n>${truncateForSlack(ann.comment.replace(/\n/g, "\n>"), 700)}`,
  ];

  const reviewedPage = ann.url || pageUrl;
  if (reviewedPage) {
    parts.push(`*Page:* <${reviewedPage}|${reviewedPage}>`);
  }
  if (ann.nearbyText) {
    parts.push(`*Nearby:* "${truncateForSlack(ann.nearbyText, 160)}"`);
  }
  if (ann.elementPath) {
    parts.push(`*Selector:* \`${truncateForSlack(ann.elementPath, 240)}\``);
  }
  if (ann.reactComponents) {
    parts.push(`*Component:* \`${truncateForSlack(ann.reactComponents, 180)}\``);
  }
  if (ann.element) {
    const tag = ann.cssClasses
      ? `<${ann.element} class="${ann.cssClasses.slice(0, 80)}">`
      : `<${ann.element}>`;
    parts.push(`*Element:* \`${tag}\``);
  }

  return parts.join("\n");
}

function truncateForSlack(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/**
 * Upload a screenshot to a Slack thread. Extracted so it can be called
 * independently of annotation posting (e.g. when all annotations are
 * deduplicated but a new screenshot is still attached).
 */
export async function uploadScreenshotToSlack(
  channelId: string | undefined,
  threadTs: string,
  pageUrl: string,
  annotationCount: number,
  screenshotBuffer: Buffer
): Promise<void> {
  const slack = getSlackClient();
  const resolvedChannelId = resolveChannelId(channelId);

  await withRetry(() =>
    slack.filesUploadV2({
      channel_id: resolvedChannelId,
      thread_ts: threadTs,
      file: screenshotBuffer,
      filename: `review-${Date.now()}.jpg`,
      title: `Screenshot — ${pageUrl}`,
      initial_comment: `\ud83d\uddbc\ufe0f *Review submission* for <${pageUrl}|${pageUrl}>\n${annotationCount} annotation${annotationCount === 1 ? "" : "s"}`,
    })
  );
}

/**
 * Post a review submission (screenshot + annotations) to a Slack thread.
 */
export async function postReviewToSlack(
  channelId: string | undefined,
  threadTs: string,
  projectName: string,
  pageUrl: string,
  annotations: AgentationAnnotation[],
  screenshotBuffer?: Buffer
): Promise<void> {
  const slack = getSlackClient();
  const resolvedChannelId = resolveChannelId(channelId);

  // Upload screenshot if provided
  if (screenshotBuffer && screenshotBuffer.length > 0) {
    try {
      await uploadScreenshotToSlack(
        resolvedChannelId,
        threadTs,
        pageUrl,
        annotations.length,
        screenshotBuffer
      );
    } catch (err) {
      console.error("Failed to upload screenshot to Slack:", err);
      // Continue posting annotations even if screenshot upload fails
    }
  }

  // Build annotation summary message
  if (annotations.length === 0) return;

  const annotationLines = annotations.map((ann, i) =>
    formatAnnotationLine(i + 1, ann, pageUrl)
  );

  const summaryBlocks = [
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `*Review feedback*\n*Page:* <${pageUrl}|${pageUrl}>`,
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
  ];

  // Slack blocks limit is 50; chunk if needed
  const BLOCK_LIMIT = 50;
  for (let i = 0; i < summaryBlocks.length; i += BLOCK_LIMIT) {
    const chunk = summaryBlocks.slice(i, i + BLOCK_LIMIT);
    await withRetry(() =>
      slack.chat.postMessage({
        channel: resolvedChannelId,
        thread_ts: threadTs,
        text: `Review: ${annotations.length} annotations on ${pageUrl}`,
        blocks: chunk,
      })
    );
  }
}

async function getSlackPermalink(
  channelId: string,
  messageTs: string
): Promise<string | undefined> {
  const slack = getSlackClient();
  try {
    const result = await withRetry(() =>
      slack.chat.getPermalink({
        channel: channelId,
        message_ts: messageTs,
      })
    );
    return result.permalink;
  } catch (err) {
    console.warn("[Slack] Failed to get permalink:", err);
    return undefined;
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
