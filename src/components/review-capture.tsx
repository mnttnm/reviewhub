"use client";

/**
 * ReviewCapture — Client-side wrapper for Agentation.
 *
 * This component is meant to be copied into the prototype app.
 * It captures a full-page screenshot via html2canvas when the user
 * submits their review, then POSTs the screenshot + annotations
 * to the ReviewHub webhook endpoint.
 *
 * Usage in prototype:
 *   import { ReviewCapture } from "./review-capture";
 *   <ReviewCapture
 *     projectId="your-project-id"
 *     webhookUrl="https://your-reviewhub.vercel.app/api/webhook/your-project-id"
 *   />
 *
 * Note: This file is provided as reference. In practice, users install
 * `agentation` in their prototype and configure its webhookUrl to point
 * to ReviewHub. This component shows how to add screenshot capture on top.
 */

import { useCallback } from "react";

interface AgentationAnnotation {
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
  intent?: string;
  severity?: string;
  kind?: string;
  status?: string;
}

interface ReviewCaptureProps {
  projectId: string;
  webhookUrl: string;
}

/**
 * Captures a full-page screenshot using html2canvas.
 * html2canvas must be installed in the prototype: npm install html2canvas
 */
async function captureScreenshot(): Promise<string | null> {
  try {
    // Dynamic import — html2canvas is a peer dependency in the prototype app
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import(/* webpackIgnore: true */ "html2canvas" as string);
    const html2canvas = mod.default;
    const canvas = await html2canvas(document.documentElement, {
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("ReviewCapture: html2canvas not available or failed:", err);
    return null;
  }
}

export default function ReviewCapture({
  projectId,
  webhookUrl,
}: ReviewCaptureProps) {
  const handleSubmit = useCallback(
    async (annotations: AgentationAnnotation[]) => {
      // Capture screenshot before submitting
      const screenshot = await captureScreenshot();

      const payload = {
        projectId,
        url: window.location.href,
        annotations,
        screenshot,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          scrollY: window.scrollY,
        },
      };

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          console.error("ReviewCapture: webhook failed:", res.status);
        }
      } catch (err) {
        console.error("ReviewCapture: webhook error:", err);
      }
    },
    [projectId, webhookUrl]
  );

  // This component renders nothing — it's a hook container.
  // In practice, integrate with Agentation's onSubmit callback:
  //
  //   <Agentation onSubmit={(annotations) => handleSubmit(annotations)} />
  //
  // The handleSubmit function is exposed for use with Agentation callbacks.
  // Since Agentation is installed separately in the prototype, this component
  // serves as documentation and a reference implementation.

  return (
    <div
      data-reviewhub-project={projectId}
      data-reviewhub-webhook={webhookUrl}
      style={{ display: "none" }}
      ref={(el) => {
        // Expose handleSubmit on the DOM element for external access
        if (el) {
          (el as HTMLDivElement & { __reviewhubSubmit?: typeof handleSubmit }).__reviewhubSubmit = handleSubmit;
        }
      }}
    />
  );
}

// Export the type for use in prototype apps
export type { AgentationAnnotation, ReviewCaptureProps };
