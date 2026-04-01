import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/projects/[id] — get a single project with annotation counts
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get annotation counts by status
  const { data: annotations } = await supabase
    .from("annotations")
    .select("status")
    .eq("project_id", params.id);

  const counts = {
    total: annotations?.length ?? 0,
    pending: annotations?.filter((a) => a.status === "pending").length ?? 0,
    acknowledged:
      annotations?.filter((a) => a.status === "acknowledged").length ?? 0,
    resolved: annotations?.filter((a) => a.status === "resolved").length ?? 0,
    dismissed: annotations?.filter((a) => a.status === "dismissed").length ?? 0,
  };

  return NextResponse.json({ ...project, annotation_counts: counts });
}

// PATCH /api/projects/[id] — update project name or base_url
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const updates: Record<string, string> = {};
  if (body.name) updates.name = body.name;
  if (body.base_url) updates.base_url = body.base_url;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/projects/[id] — delete a project (cascades to annotations)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
