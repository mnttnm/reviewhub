import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// PATCH /api/projects/[id]/annotations/[annotationId] — update status or comment
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; annotationId: string } }
) {
  const body = await req.json();
  const allowedFields = ["status", "comment", "severity", "intent", "author"];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("annotations")
    .update(updates)
    .eq("id", params.annotationId)
    .eq("project_id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/projects/[id]/annotations/[annotationId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; annotationId: string } }
) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("annotations")
    .delete()
    .eq("id", params.annotationId)
    .eq("project_id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
