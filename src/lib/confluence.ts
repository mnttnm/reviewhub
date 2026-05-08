import { AgentationAnnotation, ProjectConfig } from "./types";

interface ConfluencePage {
  id: string;
  title: string;
  _links?: {
    webui?: string;
  };
}

function getConfluenceConfig() {
  const baseUrl = process.env.CONFLUENCE_BASE_URL?.replace(/\/$/, "");
  const email = process.env.CONFLUENCE_EMAIL;
  const apiToken = process.env.CONFLUENCE_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      "Missing CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, or CONFLUENCE_API_TOKEN"
    );
  }

  return { baseUrl, email, apiToken };
}

function authHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

async function confluenceFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { baseUrl, email, apiToken } = getConfluenceConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(email, apiToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Confluence request failed: ${res.status} ${await res.text()}`
    );
  }

  return (await res.json()) as T;
}

export function isConfluenceConfigured(): boolean {
  return Boolean(
    process.env.CONFLUENCE_BASE_URL &&
      process.env.CONFLUENCE_EMAIL &&
      process.env.CONFLUENCE_API_TOKEN
  );
}

export async function createReviewPage(
  project: ProjectConfig,
  title: string
): Promise<{ pageId: string; url?: string }> {
  const spaceId = project.destinations.confluence.spaceId;
  const parentPageId = project.destinations.confluence.parentPageId;

  if (!spaceId) {
    throw new Error("Confluence destination is missing spaceId");
  }

  const body = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>Review comments captured by ReviewHub for <strong>${escapeHtml(project.name)}</strong>.</p>`,
    `<p><strong>Status:</strong> Active</p>`,
    `<p>Each submission below is grouped by time. Every comment has a stable annotation ID so it can be referenced from Slack, tickets, or implementation notes.</p>`,
    `<hr />`,
  ].join("");

  const page = await confluenceFetch<ConfluencePage>("/wiki/api/v2/pages", {
    method: "POST",
    body: JSON.stringify({
      spaceId,
      status: "current",
      title,
      parentId: parentPageId || undefined,
      body: {
        representation: "storage",
        value: body,
      },
    }),
  });

  return { pageId: page.id, url: getPageUrl(page) };
}

export async function appendReviewToPage(input: {
  pageId: string;
  projectName: string;
  pageUrl: string;
  annotations: AgentationAnnotation[];
  slackUrl?: string;
}): Promise<{ url?: string }> {
  const page = await confluenceFetch<
    ConfluencePage & {
      version: { number: number };
      body: { storage: { value: string } };
    }
  >(`/wiki/api/v2/pages/${input.pageId}?body-format=storage`);

  const appended = `${page.body.storage.value}${renderSubmission(input)}`;

  const updated = await confluenceFetch<ConfluencePage>(
    `/wiki/api/v2/pages/${input.pageId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        id: input.pageId,
        status: "current",
        title: page.title,
        body: {
          representation: "storage",
          value: appended,
        },
        version: {
          number: page.version.number + 1,
        },
      }),
    }
  );

  return { url: getPageUrl(updated) || getPageUrl(page) };
}

function renderSubmission(input: {
  projectName: string;
  pageUrl: string;
  annotations: AgentationAnnotation[];
  slackUrl?: string;
}): string {
  const submittedAt = new Date().toISOString();
  const slack = input.slackUrl
    ? `<li><strong>Slack thread:</strong> ${linkHtml(input.slackUrl)}</li>`
    : "";

  return [
    `<h2>Submission - ${submittedAt}</h2>`,
    `<ul>`,
    `<li><strong>Project:</strong> ${escapeHtml(input.projectName)}</li>`,
    `<li><strong>Reviewed page:</strong> ${linkHtml(input.pageUrl)}</li>`,
    `<li><strong>Comments:</strong> ${input.annotations.length}</li>`,
    slack,
    `</ul>`,
    input.annotations
      .map((ann, index) => renderAnnotation(index + 1, ann, input.pageUrl))
      .join(""),
    `<hr />`,
  ].join("");
}

function renderAnnotation(
  index: number,
  ann: AgentationAnnotation,
  fallbackPageUrl: string
): string {
  const titleParts = [
    `#${index}`,
    ann.severity ? ann.severity : "unprioritized",
    ann.intent ? ann.intent : "feedback",
    ann.kind && ann.kind !== "feedback" ? ann.kind : "",
  ].filter(Boolean);

  const details = [
    `<li><strong>Annotation ID:</strong> <code>${escapeHtml(ann.id)}</code></li>`,
    `<li><strong>Status:</strong> ${escapeHtml(ann.status || "pending")}</li>`,
    `<li><strong>Created:</strong> ${new Date(ann.timestamp || Date.now()).toISOString()}</li>`,
    `<li><strong>Page:</strong> ${linkHtml(ann.url || fallbackPageUrl)}</li>`,
  ];

  if (ann.selectedText) {
    details.push(
      `<li><strong>Selected text:</strong> ${quoteHtml(ann.selectedText)}</li>`
    );
  }
  if (ann.nearbyText) {
    details.push(
      `<li><strong>Nearby text:</strong> ${quoteHtml(ann.nearbyText)}</li>`
    );
  }
  if (ann.elementPath) {
    details.push(
      `<li><strong>Selector:</strong> <code>${escapeHtml(ann.elementPath)}</code></li>`
    );
  }
  if (ann.reactComponents) {
    details.push(
      `<li><strong>Component:</strong> <code>${escapeHtml(ann.reactComponents)}</code></li>`
    );
  }
  if (ann.element) {
    const element = ann.cssClasses
      ? `<${ann.element} class="${ann.cssClasses.slice(0, 120)}">`
      : `<${ann.element}>`;
    details.push(
      `<li><strong>Element:</strong> <code>${escapeHtml(element)}</code></li>`
    );
  }
  if (ann.accessibility) {
    details.push(
      `<li><strong>Accessibility:</strong> <code>${escapeHtml(ann.accessibility.slice(0, 200))}</code></li>`
    );
  }
  if (ann.computedStyles) {
    details.push(
      `<li><strong>Styles:</strong> <code>${escapeHtml(ann.computedStyles.slice(0, 260))}</code></li>`
    );
  }
  if (ann.x !== undefined || ann.y !== undefined || ann.boundingBox) {
    details.push(`<li><strong>Position:</strong> ${escapeHtml(formatPosition(ann))}</li>`);
  }
  if (ann.kind === "placement" && ann.placement) {
    details.push(
      `<li><strong>Placement:</strong> <code>${escapeHtml(ann.placement.componentType)}</code> (${ann.placement.width}x${ann.placement.height}px)${ann.placement.text ? ` - ${quoteHtml(ann.placement.text)}` : ""}</li>`
    );
  }
  if (ann.kind === "rearrange" && ann.rearrange) {
    details.push(
      `<li><strong>Rearrange:</strong> <code>${escapeHtml(ann.rearrange.selector)}</code> - ${quoteHtml(ann.rearrange.label)}</li>`
    );
  }

  return [
    `<h3>${escapeHtml(titleParts.join(" - "))}</h3>`,
    `<blockquote>${paragraphize(ann.comment)}</blockquote>`,
    `<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Details for ${escapeHtml(ann.id)}</ac:parameter><ac:rich-text-body>`,
    `<ul>${details.join("")}</ul>`,
    `</ac:rich-text-body></ac:structured-macro>`,
  ].join("");
}

function formatPosition(ann: AgentationAnnotation): string {
  const parts: string[] = [];
  if (ann.x !== undefined) parts.push(`x: ${ann.x.toFixed(1)}%`);
  if (ann.y !== undefined) parts.push(`y: ${ann.y}px`);
  if (ann.boundingBox) {
    parts.push(
      `box: ${ann.boundingBox.width}x${ann.boundingBox.height} at (${ann.boundingBox.x}, ${ann.boundingBox.y})`
    );
  }
  return parts.join(" | ");
}

function paragraphize(value: string): string {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs.map((part) => `<p>${escapeHtml(part)}</p>`).join("");
}

function quoteHtml(value: string): string {
  return `&ldquo;${escapeHtml(value)}&rdquo;`;
}

function getPageUrl(page: ConfluencePage): string | undefined {
  const baseUrl = process.env.CONFLUENCE_BASE_URL?.replace(/\/$/, "");
  const webui = page._links?.webui;
  return baseUrl && webui ? `${baseUrl}${webui}` : undefined;
}

function linkHtml(url: string): string {
  const safe = escapeHtml(url);
  return url ? `<a href="${safe}">${safe}</a>` : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
