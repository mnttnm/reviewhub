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
    `<p>Status: active</p>`,
    `<h2>Comments</h2>`,
    `<table><tbody><tr><th>ID</th><th>Status</th><th>Severity</th><th>Comment</th><th>Page</th><th>Selector</th><th>Created</th></tr></tbody></table>`,
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
  const rows = input.annotations
    .map((ann) => {
      return [
        "<tr>",
        `<td>${escapeHtml(ann.id)}</td>`,
        `<td>${escapeHtml(ann.status || "pending")}</td>`,
        `<td>${escapeHtml(ann.severity || "")}</td>`,
        `<td>${escapeHtml(ann.comment)}</td>`,
        `<td>${linkHtml(ann.url || input.pageUrl)}</td>`,
        `<td><code>${escapeHtml(ann.elementPath || "")}</code></td>`,
        `<td>${new Date(ann.timestamp || Date.now()).toISOString()}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  const slack = input.slackUrl
    ? `<p>Slack thread: ${linkHtml(input.slackUrl)}</p>`
    : "";

  return [
    `<h2>Submission - ${new Date().toISOString()}</h2>`,
    `<p>Project: <strong>${escapeHtml(input.projectName)}</strong></p>`,
    `<p>Reviewed page: ${linkHtml(input.pageUrl)}</p>`,
    slack,
    `<table><tbody><tr><th>ID</th><th>Status</th><th>Severity</th><th>Comment</th><th>Page</th><th>Selector</th><th>Created</th></tr>${rows}</tbody></table>`,
  ].join("");
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
