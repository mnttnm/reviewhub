import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateMarkdownReport } from "@/lib/export-markdown";
import { Annotation, Project } from "@/lib/types";

// GET /api/projects/[id]/export/markdown — download markdown review report
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase();

  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: annotations, error: annError } = await supabase
    .from("annotations")
    .select("*")
    .eq("project_id", params.id)
    .order("annotation_timestamp", { ascending: true });

  if (annError) {
    return NextResponse.json({ error: annError.message }, { status: 500 });
  }

  const markdown = generateMarkdownReport(
    project as Project,
    (annotations ?? []) as Annotation[]
  );

  const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `review-${safeName}-${new Date().toISOString().slice(0, 10)}.md`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
