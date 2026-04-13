import sharp from "sharp";
import { AgentationAnnotation } from "./types";

interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollY: number;
}

/** Marker style constants */
const MARKER_RADIUS = 14;
const MARKER_FONT_SIZE = 13;
const MARKER_COLOR = "#E53935"; // Red
const MARKER_BORDER_COLOR = "#FFFFFF";
const MARKER_BORDER_WIDTH = 2;
const MARKER_TEXT_COLOR = "#FFFFFF";

const BBOX_STROKE_COLOR = "rgba(229, 57, 53, 0.7)";
const BBOX_FILL_COLOR = "rgba(229, 57, 53, 0.08)";
const BBOX_STROKE_WIDTH = 2;
const BBOX_CORNER_RADIUS = 4;

/**
 * Draw annotation markers on a screenshot image.
 *
 * Each annotation gets:
 *   1. A semi-transparent highlight rectangle around its boundingBox (if available)
 *   2. A numbered circle marker at its (x, y) position
 *
 * The marker numbers match the annotation indices (1-based) in the Slack text
 * summary, so a reviewer can look at marker #3 on the screenshot and read
 * annotation #3 in the thread.
 *
 * Coordinate mapping:
 *   - annotation.x  = % of viewport width (0–100)
 *   - annotation.y  = px from document top (or viewport top if isFixed)
 *   - boundingBox   = { x, y, width, height } in CSS pixels from document origin
 *   - The screenshot from domToCanvas(document.documentElement) is rendered at
 *     1:1 CSS-pixel dimensions, so y values map directly to the image Y axis.
 *
 * Returns a new JPEG buffer with the markers composited on top.
 * If anything goes wrong, returns the original buffer unchanged.
 */
export async function annotateScreenshot(
  screenshotBuffer: Buffer,
  annotations: AgentationAnnotation[],
  viewport?: ViewportInfo
): Promise<Buffer> {
  if (annotations.length === 0) return screenshotBuffer;

  try {
    const image = sharp(screenshotBuffer);
    const metadata = await image.metadata();
    const imgWidth = metadata.width ?? 0;
    const imgHeight = metadata.height ?? 0;

    if (imgWidth === 0 || imgHeight === 0) return screenshotBuffer;

    // Reference width for converting annotation.x (%) → px.
    // Prefer the reported viewport width; fall back to image width.
    const refWidth = viewport?.width ?? imgWidth;
    const scrollY = viewport?.scrollY ?? 0;

    // Compute a uniform scale factor in case the image pixel size differs
    // from the CSS-pixel reference (e.g. Retina captures).
    const scale = imgWidth / refWidth;

    const svgParts: string[] = [];

    for (let i = 0; i < annotations.length; i++) {
      const ann = annotations[i];
      const num = i + 1;

      // --- Compute marker centre in image-pixel coordinates ---
      let markerX = (ann.x / 100) * refWidth * scale;
      let markerY = ann.y * scale;

      // Fixed-position elements report y relative to the viewport, not the
      // document.  Shift by scrollY so the marker aligns with the full-page
      // screenshot.
      if (ann.isFixed && scrollY > 0) {
        markerY = (ann.y + scrollY) * scale;
      }

      // Clamp to image bounds (with some padding for the marker radius)
      markerX = clamp(markerX, MARKER_RADIUS, imgWidth - MARKER_RADIUS);
      markerY = clamp(markerY, MARKER_RADIUS, imgHeight - MARKER_RADIUS);

      // --- Optional bounding-box highlight ---
      if (ann.boundingBox) {
        const bb = ann.boundingBox;
        const bx = bb.x * scale;
        const by = bb.y * scale;
        const bw = bb.width * scale;
        const bh = bb.height * scale;

        // Only draw if the box is within the image
        if (bx + bw > 0 && by + bh > 0 && bx < imgWidth && by < imgHeight) {
          svgParts.push(
            `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" ` +
              `rx="${BBOX_CORNER_RADIUS}" ry="${BBOX_CORNER_RADIUS}" ` +
              `fill="${BBOX_FILL_COLOR}" stroke="${BBOX_STROKE_COLOR}" ` +
              `stroke-width="${BBOX_STROKE_WIDTH}" />`
          );
        }
      }

      // --- Numbered circle marker ---
      // Drop shadow for contrast on any background
      svgParts.push(
        `<circle cx="${markerX}" cy="${markerY}" r="${MARKER_RADIUS + 1}" ` +
          `fill="rgba(0,0,0,0.3)" />`
      );
      // White border circle
      svgParts.push(
        `<circle cx="${markerX}" cy="${markerY}" r="${MARKER_RADIUS}" ` +
          `fill="${MARKER_COLOR}" stroke="${MARKER_BORDER_COLOR}" ` +
          `stroke-width="${MARKER_BORDER_WIDTH}" />`
      );
      // Number label
      svgParts.push(
        `<text x="${markerX}" y="${markerY}" ` +
          `text-anchor="middle" dominant-baseline="central" ` +
          `fill="${MARKER_TEXT_COLOR}" font-family="Arial, Helvetica, sans-serif" ` +
          `font-size="${MARKER_FONT_SIZE}" font-weight="bold">` +
          `${num}</text>`
      );
    }

    const svgOverlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">` +
        svgParts.join("") +
        `</svg>`
    );

    const annotatedBuffer = await sharp(screenshotBuffer)
      .composite([{ input: svgOverlay, top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return annotatedBuffer;
  } catch (err) {
    console.error("[annotateScreenshot] Failed to annotate screenshot:", err);
    return screenshotBuffer;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
