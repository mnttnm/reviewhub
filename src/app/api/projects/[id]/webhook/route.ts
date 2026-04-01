import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { validateWebhookToken } from "@/lib/auth";
import { AgentationAnnotation, WebhookEvent } from "@/lib/types";

/**
 * Map an agentation Annotation object to our DB column format.
 */
function mapAnnotationToRow(projectId: string, ann: AgentationAnnotation) {
  return {
    id: ann.id,
    project_id: projectId,
    comment: ann.comment,
    element_path: ann.elementPath,
    element: ann.element,
    page_url: ann.url ?? null,
    x: ann.x,
    y: ann.y,
    bounding_box: ann.boundingBox ?? null,
    react_components: ann.reactComponents ?? null,
    css_classes: ann.cssClasses ?? null,
    computed_styles: ann.computedStyles ?? null,
    accessibility: ann.accessibility ?? null,
    nearby_text: ann.nearbyText ?? null,
    selected_text: ann.selectedText ?? null,
    intent: ann.intent ?? null,
    severity: ann.severity ?? null,
    kind: ann.kind ?? "feedback",
    status: ann.status ?? "pending",
    placement: ann.placement ?? null,
    rearrange: ann.rearrange ?? null,
    annotation_timestamp: ann.timestamp,
    updated_at: new Date().toISOString(),
  };
}

// POST /api/projects/[id]/webhook — receive agentation webhook events
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const project = await validateWebhookToken(req, params.id);
  if (!project) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: WebhookEvent = await req.json();
  const supabase = getSupabase();

  switch (body.event) {
    case "annotation.add": {
      if (!body.annotation) {
        return NextResponse.json(
          { error: "Missing annotation" },
          { status: 400 }
        );
      }
      const row = mapAnnotationToRow(params.id, body.annotation);
      const { error } = await supabase.from("annotations").upsert(row);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: "created" });
    }

    case "annotation.update": {
      if (!body.annotation) {
        return NextResponse.json(
          { error: "Missing annotation" },
          { status: 400 }
        );
      }
      const row = mapAnnotationToRow(params.id, body.annotation);
      const { error } = await supabase.from("annotations").upsert(row);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: "updated" });
    }

    case "annotation.delete": {
      if (!body.annotation) {
        return NextResponse.json(
          { error: "Missing annotation" },
          { status: 400 }
        );
      }
      const { error } = await supabase
        .from("annotations")
        .delete()
        .eq("id", body.annotation.id)
        .eq("project_id", params.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: "deleted" });
    }

    case "annotations.clear": {
      // Delete all annotations for this project on the given page URL
      let query = supabase
        .from("annotations")
        .delete()
        .eq("project_id", params.id);

      if (body.url) {
        query = query.eq("page_url", body.url);
      }

      const { error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: "cleared" });
    }

    case "submit": {
      // Bulk upsert all annotations from the submit event
      if (!body.annotations || body.annotations.length === 0) {
        return NextResponse.json({ ok: true, action: "noop" });
      }
      const rows = body.annotations.map((ann) =>
        mapAnnotationToRow(params.id, ann)
      );
      const { error } = await supabase.from("annotations").upsert(rows);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        action: "submitted",
        count: rows.length,
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown event type: ${body.event}` },
        { status: 400 }
      );
  }
}
