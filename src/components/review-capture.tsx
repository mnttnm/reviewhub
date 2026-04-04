"use client";

/**
 * ReviewCapture — Client-side wrapper for Agentation with screenshot capture.
 *
 * This component is meant to be copied into the prototype app.
 * It captures a full-page screenshot via modern-screenshot when the user
 * submits their review, then POSTs the screenshot + annotations
 * to the ReviewHub webhook endpoint.
 *
 * Usage in prototype:
 *   npm install modern-screenshot
 *
 *   import ReviewCapture from "./review-capture";
 *   import { Agentation } from "agentation";
 *
 *   function App() {
 *     const captureRef = useRef<{ submit: (annotations: any[]) => void }>(null);
 *     return (
 *       <>
 *         <ReviewCapture
 *           ref={captureRef}
 *           webhookUrl="https://reviewhub-weld.vercel.app/api/webhook/YOUR_TOKEN"
 *         />
 *         <Agentation onSubmit={(output, annotations) => captureRef.current?.submit(annotations)} />
 *       </>
 *     );
 *   }
 */

import { useCallback, useImperativeHandle, forwardRef } from "react";

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
  webhookUrl: string;
}

export interface ReviewCaptureHandle {
  submit: (annotations: AgentationAnnotation[]) => Promise<void>;
}

/**
 * Captures a full-page screenshot using modern-screenshot.
 * modern-screenshot must be installed in the prototype: npm install modern-screenshot
 *
 * modern-screenshot is the same library Agentation uses internally for its
 * drawing/region capture. It provides better CSS rendering fidelity than
 * html2canvas (handles CSS Grid, backdrop-filter, modern properties).
 */
async function captureScreenshot(): Promise<string | null> {
  try {
    const { domToCanvas } = await import(
      /* webpackIgnore: true */ "modern-screenshot" as string
    );

    // Hide Agentation UI so it doesn't appear in the screenshot
    const agentationRoot = document.querySelector(
      "[data-agentation-root]"
    ) as HTMLElement | null;
    const prevVisibility = agentationRoot?.style.visibility;
    if (agentationRoot) agentationRoot.style.visibility = "hidden";

    try {
      const canvas = await domToCanvas(document.documentElement, {
        backgroundColor: "#ffffff",
        timeout: 10000,
      });

      // Compress as JPEG for smaller payload (typically 3-5x smaller than PNG)
      return canvas.toDataURL("image/jpeg", 0.85);
    } finally {
      if (agentationRoot)
        agentationRoot.style.visibility = prevVisibility ?? "";
    }
  } catch (err) {
    console.warn(
      "ReviewCapture: modern-screenshot not available or failed:",
      err
    );
    return null;
  }
}

const ReviewCapture = forwardRef<ReviewCaptureHandle, ReviewCaptureProps>(
  function ReviewCapture({ webhookUrl }, ref) {
    const handleSubmit = useCallback(
      async (annotations: AgentationAnnotation[]) => {
        // Capture screenshot before submitting
        const screenshot = await captureScreenshot();

        const payload = {
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
      [webhookUrl]
    );

    // Expose submit method via ref
    useImperativeHandle(ref, () => ({ submit: handleSubmit }), [handleSubmit]);

    // Renders nothing — wire up via ref:
    //   <Agentation onSubmit={(output, annotations) => captureRef.current?.submit(annotations)} />
    return null;
  }
);

export default ReviewCapture;

// Export types for use in prototype apps
export type { AgentationAnnotation, ReviewCaptureProps };
