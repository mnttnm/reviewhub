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
  const slackLine = input.slackUrl
    ? `<p>Slack: ${linkHtml(input.slackUrl)}</p>`
    : "";

  return [
    `<p><strong>${submittedAt}</strong></p>`,
    slackLine,
    input.annotations.map((ann) => renderAnnotation(ann, input.pageUrl)).join(""),
    `<hr />`,
  ].join("");
}

function renderAnnotation(
  ann: AgentationAnnotation,
  fallbackPageUrl: string
): string {
  const labels = [ann.severity, ann.intent].filter(Boolean).join(" / ");
  const element = formatElement(ann);
  const details = [
    ann.nearbyText
      ? `<p><strong>nearby:</strong> ${escapeHtml(ann.nearbyText)}</p>`
      : "",
    ann.elementPath
      ? `<p><strong>selector:</strong> ${escapeHtml(ann.elementPath)}</p>`
      : "",
    ann.reactComponents
      ? `<p><strong>component:</strong> ${escapeHtml(ann.reactComponents)}</p>`
      : "",
    element ? `<p><strong>element:</strong> ${escapeHtml(element)}</p>` : "",
  ].join("");

  return [
    labels ? `<h3>${escapeHtml(labels)}</h3>` : "",
    `<p>Page: ${linkHtml(ann.url || fallbackPageUrl)}</p>`,
    paragraphize(ann.comment),
    details,
  ].join("");
}

function formatElement(ann: AgentationAnnotation): string {
  if (ann.element) {
    return ann.cssClasses
      ? `<${ann.element} class="${ann.cssClasses.slice(0, 120)}">`
      : `<${ann.element}>`;
  }

  return "";
}

function paragraphize(value: string): string {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs.map((part) => `<p>${escapeHtml(part)}</p>`).join("");
}

export function normalizeConfluencePageUrl(url?: string): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith(".atlassian.net") &&
      parsed.pathname.startsWith("/spaces/")
    ) {
      parsed.pathname = `/wiki${parsed.pathname}`;
      return parsed.toString();
    }
  } catch {
    return url;
  }

  return url;
}

function getPageUrl(page: ConfluencePage): string | undefined {
  const baseUrl = process.env.CONFLUENCE_BASE_URL?.replace(/\/$/, "");
  const webui = page._links?.webui;
  return normalizeConfluencePageUrl(baseUrl && webui ? `${baseUrl}${webui}` : undefined);
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
