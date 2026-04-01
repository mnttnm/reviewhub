import { Annotation, Project } from "./types";

/**
 * Generate a structured markdown review report from project annotations.
 */
export function generateMarkdownReport(
  project: Project,
  annotations: Annotation[]
): string {
  const now = new Date().toISOString();
  const lines: string[] = [
    `# Review: ${project.name}`,
    ``,
    `**URL:** ${project.base_url}`,
    `**Date:** ${now}`,
    `**Total annotations:** ${annotations.length}`,
    ``,
    `---`,
    ``,
  ];

  const pages = new Map<string, Annotation[]>();
  for (const ann of annotations) {
    const pageKey = ann.page_url || project.base_url;
    if (!pages.has(pageKey)) {
      pages.set(pageKey, []);
    }
    pages.get(pageKey)!.push(ann);
  }

  let index = 1;
  pages.forEach((pageAnnotations, pageUrl) => {
    lines.push(`## Page: ${pageUrl}`);
    lines.push(``);

    for (const ann of pageAnnotations) {
      const severityBadge = ann.severity ? ` [${ann.severity}]` : "";
      const statusBadge = ann.status || "pending";

      lines.push(`### #${index} — ${statusBadge}${severityBadge}`);
      lines.push(``);

      if (ann.intent) {
        lines.push(`**Intent:** ${ann.intent}`);
      }
      lines.push(`**Element:** \`${ann.element_path}\``);
      lines.push(`**Position:** (${ann.x.toFixed(1)}%, ${ann.y.toFixed(0)}px)`);

      if (ann.css_classes) {
        lines.push(`**CSS Classes:** \`${ann.css_classes}\``);
      }
      if (ann.computed_styles) {
        lines.push(`**Computed Styles:** ${ann.computed_styles}`);
      }
      if (ann.react_components) {
        lines.push(`**React Components:** ${ann.react_components}`);
      }
      if (ann.selected_text) {
        lines.push(`**Selected Text:** "${ann.selected_text}"`);
      }

      lines.push(``);
      lines.push(`> ${ann.comment}`);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);

      index++;
    }
  });

  return lines.join("\n");
}
