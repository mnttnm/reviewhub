/**
 * Agentation Annotation Format Schema (AFS) v1.1
 * See: https://www.agentation.com/schema
 */
export interface AgentationAnnotation {
  // Required
  id: string;
  comment: string;
  elementPath: string;
  timestamp: number;
  x: number; // % of viewport width (0-100)
  y: number; // px from document top (or viewport if isFixed)
  element: string; // Tag name ("button", "div", "input")

  // Recommended
  url?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };

  // Optional context
  reactComponents?: string; // Component tree ("App > Dashboard > Button")
  cssClasses?: string; // Class list ("btn btn-primary disabled")
  computedStyles?: string; // Key CSS properties
  accessibility?: string; // ARIA attributes, role
  nearbyText?: string; // Visible text in/around element
  selectedText?: string; // Text highlighted by user

  // Browser component fields
  isFixed?: boolean;
  isMultiSelect?: boolean;
  fullPath?: string;
  nearbyElements?: string;

  // Feedback classification
  intent?: "fix" | "change" | "question" | "approve";
  severity?: "blocking" | "important" | "suggestion";

  // Annotation kind (defaults to "feedback")
  kind?: "feedback" | "placement" | "rearrange";

  // Layout mode data
  placement?: {
    componentType: string;
    width: number;
    height: number;
    scrollY: number;
    text?: string;
  };
  rearrange?: {
    selector: string;
    label: string;
    tagName: string;
    originalRect: { x: number; y: number; width: number; height: number };
    currentRect: { x: number; y: number; width: number; height: number };
  };

  // Lifecycle
  status?: "pending" | "acknowledged" | "resolved" | "dismissed";
  resolvedAt?: string;
  resolvedBy?: "human" | "agent";
  thread?: ThreadMessage[];
}

export interface ThreadMessage {
  id: string;
  role: "human" | "agent";
  content: string;
  timestamp: number;
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
  screenshot?: string; // base64 data URL (attached by ReviewCapture)
}

/**
 * Payload sent by ReviewCapture client component.
 * Includes annotations + base64 screenshot.
 */
export interface ReviewSubmission {
  projectId?: string;
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
 * Encoded project token — embedded in webhook URL so no server-side storage needed.
 * Base64url-encoded JSON: { t: threadTs, n: projectName }
 * Channel ID comes from env var.
 */
export interface ProjectToken {
  t: string; // Slack thread timestamp
  n: string; // Project name
}

/**
 * Project info returned to the frontend after creation.
 */
export interface Project {
  token: string; // base64url-encoded ProjectToken
  name: string;
  baseUrl: string;
  slackThreadTs: string;
  createdAt: string;
}
