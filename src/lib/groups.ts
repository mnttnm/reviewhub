import { ProjectConfig } from "./types";

export function getReviewGroupId(
  project: ProjectConfig,
  submittedAt = new Date(),
  sessionId?: string
): string {
  if (project.grouping === "submission") {
    return `submission-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }

  if (project.grouping === "session") {
    return sessionId?.trim() || toDateKey(submittedAt);
  }

  return toDateKey(submittedAt);
}

export function getReviewGroupLabel(
  project: ProjectConfig,
  groupId: string
): string {
  if (project.grouping === "submission") {
    return `${project.name} - Review submission`;
  }

  if (project.grouping === "session" && !isDateKey(groupId)) {
    return `${project.name} - Session ${groupId}`;
  }

  return `${project.name} - ${groupId}`;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
