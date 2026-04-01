import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabase";

// GET /api/projects — list all projects
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/projects — create a new project
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, base_url } = body;

  if (!name || !base_url) {
    return NextResponse.json(
      { error: "name and base_url are required" },
      { status: 400 }
    );
  }

  const webhook_token = randomUUID();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("projects")
    .insert({ name, base_url, webhook_token })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
