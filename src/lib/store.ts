import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { Project } from "./types";

/**
 * Lightweight JSON file-based project store.
 * No database required — stores projects in a local JSON file.
 * In production on Vercel, this acts as ephemeral storage (reset on redeploy).
 * For persistence, use Vercel KV or similar — but for MVP this is sufficient
 * since Slack is the source of truth for all review data.
 */

const STORE_PATH = process.env.STORE_PATH || "/tmp/reviewhub-projects.json";

function readProjects(): Project[] {
  if (!existsSync(STORE_PATH)) return [];
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as Project[];
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]): void {
  writeFileSync(STORE_PATH, JSON.stringify(projects, null, 2), "utf-8");
}

export function getAllProjects(): Project[] {
  return readProjects();
}

export function getProject(id: string): Project | undefined {
  return readProjects().find((p) => p.id === id);
}

export function createProject(
  name: string,
  baseUrl: string,
  slackThreadTs: string | null
): Project {
  const projects = readProjects();
  const project: Project = {
    id: randomUUID(),
    name,
    baseUrl,
    slackThreadTs,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);
  writeProjects(projects);
  return project;
}

export function updateProject(
  id: string,
  updates: Partial<Pick<Project, "name" | "baseUrl" | "slackThreadTs">>
): Project | null {
  const projects = readProjects();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;
  projects[index] = { ...projects[index], ...updates };
  writeProjects(projects);
  return projects[index];
}

export function deleteProject(id: string): boolean {
  const projects = readProjects();
  const filtered = projects.filter((p) => p.id !== id);
  if (filtered.length === projects.length) return false;
  writeProjects(filtered);
  return true;
}
