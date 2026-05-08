import {
  ProjectConfig,
  ProjectToken,
  ReviewGroupState,
} from "./types";

const PROJECT_INDEX_KEY = "reviewhub:projects";
const memoryStore = new Map<string, unknown>();

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvCommand<T>(command: unknown[]): Promise<T> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Vercel KV REST environment variables are not configured");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    throw new Error(`KV command failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { result: T };
  return body.result;
}

async function getJson<T>(key: string): Promise<T | null> {
  if (!kvConfigured()) {
    return (memoryStore.get(key) as T | undefined) ?? null;
  }

  const raw = await kvCommand<string | null>(["GET", key]);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function setJson(key: string, value: unknown): Promise<void> {
  if (!kvConfigured()) {
    memoryStore.set(key, value);
    return;
  }

  await kvCommand(["SET", key, JSON.stringify(value)]);
}

async function sadd(key: string, value: string): Promise<void> {
  if (!kvConfigured()) {
    const existing = (memoryStore.get(key) as Set<string> | undefined) ?? new Set();
    existing.add(value);
    memoryStore.set(key, existing);
    return;
  }

  await kvCommand(["SADD", key, value]);
}

async function smembers(key: string): Promise<string[]> {
  if (!kvConfigured()) {
    return Array.from((memoryStore.get(key) as Set<string> | undefined) ?? []);
  }

  return kvCommand<string[]>(["SMEMBERS", key]);
}

export function createProjectId(): string {
  return `proj_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function saveProject(project: ProjectConfig): Promise<void> {
  await setJson(projectKey(project.id), project);
  await sadd(PROJECT_INDEX_KEY, project.id);
}

export async function getProject(projectId: string): Promise<ProjectConfig | null> {
  return getJson<ProjectConfig>(projectKey(projectId));
}

export async function listProjects(): Promise<ProjectConfig[]> {
  const ids = await smembers(PROJECT_INDEX_KEY);
  const projects = await Promise.all(ids.map((id) => getProject(id)));
  return projects
    .filter((project): project is ProjectConfig => Boolean(project))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReviewGroup(
  projectId: string,
  groupId: string
): Promise<ReviewGroupState | null> {
  return getJson<ReviewGroupState>(groupKey(projectId, groupId));
}

export async function saveReviewGroup(group: ReviewGroupState): Promise<void> {
  await setJson(groupKey(group.projectId, group.id), group);
}

export async function getLatestReviewGroup(
  projectId: string
): Promise<ReviewGroupState | null> {
  return getJson<ReviewGroupState>(latestGroupKey(projectId));
}

export async function saveLatestReviewGroup(group: ReviewGroupState): Promise<void> {
  await setJson(latestGroupKey(group.projectId), group);
}

export function projectKey(projectId: string): string {
  return `reviewhub:project:${projectId}`;
}

export function groupKey(projectId: string, groupId: string): string {
  return `reviewhub:project:${projectId}:group:${groupId}`;
}

function latestGroupKey(projectId: string): string {
  return `reviewhub:project:${projectId}:latest-group`;
}

/**
 * Legacy token support. Existing webhook URLs encoded Slack thread metadata
 * directly. New URLs use opaque project IDs backed by KV.
 */
export function encodeProjectToken(threadTs: string, projectName: string): string {
  const token: ProjectToken = { t: threadTs, n: projectName };
  return Buffer.from(JSON.stringify(token)).toString("base64url");
}

export function decodeProjectToken(tokenStr: string): ProjectToken | null {
  try {
    const json = Buffer.from(tokenStr, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as ProjectToken;
    if (!parsed.t || !parsed.n) return null;
    return parsed;
  } catch {
    return null;
  }
}
