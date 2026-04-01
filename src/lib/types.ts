/**
 * Agentation annotation object as received from webhooks/callbacks.
 */
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
}

/**
 * Webhook event payload from Agentation.
 */
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
}

/**
 * Payload sent by ReviewCapture client component.
 * Includes annotations + base64 screenshot.
 */
export interface ReviewSubmission {
  projectId: string;
  url: string;
  annotations: AgentationAnnotation[];
  screenshot?: string; // base64 data URL
  viewport?: {
    width: number;
    height: number;
    devicePixelRatio: number;
    scrollY: number;
  };
}

/**
 * Project configuration stored in memory (lightweight, no DB).
 */
export interface Project {
  id: string;
  name: string;
  baseUrl: string;
  slackThreadTs: string | null;
  createdAt: string;
}
