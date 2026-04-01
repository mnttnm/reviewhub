"use client";

import { Annotation } from "@/lib/types";

interface AnnotationCardProps {
  annotation: Annotation;
  onStatusChange: (annotationId: string, newStatus: string) => void;
}

const severityColors: Record<string, string> = {
  blocking: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  important:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  suggestion:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const statusColors: Record<string, string> = {
  pending:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  acknowledged:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  resolved:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  dismissed:
    "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function AnnotationCard({
  annotation,
  onStatusChange,
}: AnnotationCardProps) {
  const statusClass = statusColors[annotation.status] ?? statusColors.pending;
  const severityClass = annotation.severity
    ? severityColors[annotation.severity]
    : null;

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
      {/* Header row: badges + status control */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex gap-2 flex-wrap">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}
          >
            {annotation.status}
          </span>
          {severityClass && (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${severityClass}`}
            >
              {annotation.severity}
            </span>
          )}
          {annotation.intent && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {annotation.intent}
            </span>
          )}
          {annotation.kind !== "feedback" && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
              {annotation.kind}
            </span>
          )}
        </div>

        <select
          value={annotation.status}
          onChange={(e) => onStatusChange(annotation.id, e.target.value)}
          className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded bg-transparent"
        >
          <option value="pending">Pending</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {/* Comment */}
      <p className="text-sm mb-3">{annotation.comment}</p>

      {/* Metadata */}
      <div className="text-xs text-neutral-500 space-y-1 font-[family-name:var(--font-geist-mono)]">
        <div>
          <span className="text-neutral-400">element:</span>{" "}
          <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {annotation.element_path}
          </code>
        </div>
        {annotation.react_components && (
          <div>
            <span className="text-neutral-400">components:</span>{" "}
            {annotation.react_components}
          </div>
        )}
        {annotation.css_classes && (
          <div>
            <span className="text-neutral-400">classes:</span>{" "}
            <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
              {annotation.css_classes}
            </code>
          </div>
        )}
        {annotation.selected_text && (
          <div>
            <span className="text-neutral-400">selected:</span>{" "}
            &quot;{annotation.selected_text}&quot;
          </div>
        )}
        {annotation.page_url && (
          <div>
            <span className="text-neutral-400">page:</span>{" "}
            <a
              href={annotation.page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {annotation.page_url}
            </a>
          </div>
        )}
        <div>
          <span className="text-neutral-400">position:</span>{" "}
          ({annotation.x.toFixed(1)}%, {annotation.y.toFixed(0)}px)
        </div>
        <div>
          <span className="text-neutral-400">time:</span>{" "}
          {new Date(annotation.annotation_timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
