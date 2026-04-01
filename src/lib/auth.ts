import { NextRequest } from "next/server";
import { getSupabase } from "./supabase";
import { Project } from "./types";

/**
 * Extract the webhook token from an incoming request.
 * Checks: Authorization Bearer header, then ?token= query param.
 */
function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.nextUrl.searchParams.get("token");
}

/**
 * Validate that a request carries a valid webhook token for the given project.
 * Returns the project row if valid, null otherwise.
 */
export async function validateWebhookToken(
  req: NextRequest,
  projectId: string
): Promise<Project | null> {
  const token = extractToken(req);
  if (!token) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("webhook_token", token)
    .single();

  if (error || !data) return null;
  return data as Project;
}
