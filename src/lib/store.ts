import { ProjectToken } from "./types";

/**
 * Stateless project token encoding.
 *
 * Instead of storing projects in a file (which is ephemeral on Vercel),
 * we encode the Slack thread info directly in the webhook URL as a
 * base64url-encoded JSON token. This means:
 * - No server-side storage needed
 * - Webhook URLs survive redeployments
 * - Slack is the only source of truth
 */

export function encodeProjectToken(threadTs: string, projectName: string): string {
  const token: ProjectToken = { t: threadTs, n: projectName };
  const json = JSON.stringify(token);
  return Buffer.from(json).toString("base64url");
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
