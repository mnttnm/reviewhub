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
    `<p><small>ReviewHub feedback log. New comments are appended below in a compact, copy-friendly format.</small></p>`,
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

  return [
    `<p><small><strong>${submittedAt}</strong> | Page: ${linkHtml(input.pageUrl)}${input.slackUrl ? ` | Slack: ${linkHtml(input.slackUrl)}` : ""}</small></p>`,
    input.annotations
      .map((ann, index) =>
        renderAnnotation(index + 1, ann, input.pageUrl, input.slackUrl)
      )
      .join(""),
    `<hr />`,
  ].join("");
}

function renderAnnotation(
  index: number,
  ann: AgentationAnnotation,
  fallbackPageUrl: string,
  slackUrl?: string
): string {
  const labels = [ann.severity, ann.intent].filter(Boolean).join(" / ");
  const title = labels ? `#${index} - ${labels}` : `#${index}`;
  const element = formatElement(ann);
  const lines = [
    `${title}`,
    `comment: ${ann.comment}`,
    `page: ${ann.url || fallbackPageUrl}`,
    slackUrl ? `slack: ${slackUrl}` : "",
    ann.nearbyText ? `nearby: ${ann.nearbyText}` : "",
    ann.elementPath ? `selector: ${ann.elementPath}` : "",
    ann.reactComponents ? `component: ${ann.reactComponents}` : "",
    element ? `element: ${element}` : "",
  ].filter(Boolean);

  return `<pre><code>${escapeHtml(lines.join("\n"))}</code></pre>`;
}

function formatElement(ann: AgentationAnnotation): string {
  if (ann.element) {
    return ann.cssClasses
      ? `<${ann.element} class="${ann.cssClasses.slice(0, 120)}">`
      : `<${ann.element}>`;
  }

  return "";
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
