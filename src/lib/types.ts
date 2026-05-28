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

export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollY: number;
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
  viewport?: ViewportInfo;
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
  viewport?: ViewportInfo;
}

export type ReviewGrouping = "daily" | "session" | "submission";

export interface SlackDestinationConfig {
  enabled: boolean;
  channelId?: string;
}

export interface ConfluenceDestinationConfig {
  enabled: boolean;
  spaceId?: string;
  parentPageId?: string;
}

export interface ReviewDestinations {
  slack: SlackDestinationConfig;
  confluence: ConfluenceDestinationConfig;
}

export interface ProjectConfig {
  id: string;
  name: string;
  defaultUrl?: string;
  grouping: ReviewGrouping;
  destinations: ReviewDestinations;
  legacySlackThreadTs?: string;
  reviewCount?: number;
  commentCount?: number;
  lastReviewAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewGroupState {
  id: string;
  projectId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  slack?: {
    channelId: string;
    threadTs: string;
    url?: string;
  };
  confluence?: {
    pageId: string;
    url?: string;
  };
}

export interface ProjectToken {
  t: string;
  n: string;
}

/**
 * Project info returned to the frontend after creation.
 */
export interface Project {
  id: string;
  token?: string; // legacy base64url-encoded ProjectToken
  name: string;
  defaultUrl?: string;
  baseUrl?: string;
  grouping: ReviewGrouping;
  destinations: ReviewDestinations;
  webhookUrl?: string;
  latestGroup?: ReviewGroupState;
  slackThreadTs?: string;
  reviewCount?: number;
  commentCount?: number;
  lastReviewAt?: string;
  createdAt: string;
  updatedAt?: string;
}
