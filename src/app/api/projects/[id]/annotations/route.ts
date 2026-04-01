import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/projects/[id]/annotations — list annotations with optional filters
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase();
  const searchParams = req.nextUrl.searchParams;

  let query = supabase
    .from("annotations")
    .select("*")
    .eq("project_id", params.id)
    .order("annotation_timestamp", { ascending: false });

  // Optional filters
  const pageUrl = searchParams.get("page_url");
  if (pageUrl) {
    query = query.eq("page_url", pageUrl);
  }

  const status = searchParams.get("status");
  if (status) {
    query = query.eq("status", status);
  }

  const severity = searchParams.get("severity");
  if (severity) {
    query = query.eq("severity", severity);
  }

  const intent = searchParams.get("intent");
  if (intent) {
    query = query.eq("intent", intent);
  }

  const kind = searchParams.get("kind");
  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
