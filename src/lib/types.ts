// Database row types matching Supabase schema

export interface Project {
  id: string;
  name: string;
  base_url: string;
  webhook_token: string;
  created_at: string;
  updated_at: string;
}

export interface Annotation {
  id: string;
  project_id: string;
  comment: string;
  element_path: string;
  element: string;
  page_url: string | null;
  x: number;
  y: number;
  bounding_box: { x: number; y: number; width: number; height: number } | null;
  react_components: string | null;
  css_classes: string | null;
  computed_styles: string | null;
  accessibility: string | null;
  nearby_text: string | null;
  selected_text: string | null;
  intent: "fix" | "change" | "question" | "approve" | null;
  severity: "blocking" | "important" | "suggestion" | null;
  kind: "feedback" | "placement" | "rearrange";
  status: "pending" | "acknowledged" | "resolved" | "dismissed";
  placement: Record<string, unknown> | null;
  rearrange: Record<string, unknown> | null;
  author: string | null;
  annotation_timestamp: number;
  created_at: string;
  updated_at: string;
}

export interface Screenshot {
  id: string;
  project_id: string;
  annotation_id: string | null;
  page_url: string;
  image_url: string;
  viewport: { width: number; height: number; devicePixelRatio?: number; scrollY?: number } | null;
  created_at: string;
}

// Agentation webhook event types

export interface AgentationAnnotation {
  id: string;
  comment: string;
  elementPath: string;
  timestamp: number;
  x: number;
  y: number;
  element: string;
  url?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  reactComponents?: string;
  cssClasses?: string;
  computedStyles?: string;
  accessibility?: string;
  nearbyText?: string;
  selectedText?: string;
  intent?: "fix" | "change" | "question" | "approve";
  severity?: "blocking" | "important" | "suggestion";
  kind?: "feedback" | "placement" | "rearrange";
  status?: "pending" | "acknowledged" | "resolved" | "dismissed";
  placement?: Record<string, unknown>;
  rearrange?: Record<string, unknown>;
  isFixed?: boolean;
  isMultiSelect?: boolean;
}

export type WebhookEventType =
  | "annotation.add"
  | "annotation.delete"
  | "annotation.update"
  | "annotations.clear"
  | "submit";

export interface WebhookEvent {
  event: WebhookEventType;
  timestamp: number;
  url: string;
  annotation?: AgentationAnnotation;
  annotations?: AgentationAnnotation[];
  output?: string;
}
