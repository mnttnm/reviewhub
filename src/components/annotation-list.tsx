"use client";

import { Annotation } from "@/lib/types";
import AnnotationCard from "./annotation-card";

interface AnnotationListProps {
  annotations: Annotation[];
  onStatusChange: (annotationId: string, newStatus: string) => void;
}

export default function AnnotationList({
  annotations,
  onStatusChange,
}: AnnotationListProps) {
  if (annotations.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <p className="mb-2">No annotations yet</p>
        <p className="text-sm">
          Add the Agentation widget to your prototype to start collecting
          feedback
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {annotations.map((annotation) => (
        <AnnotationCard
          key={annotation.id}
          annotation={annotation}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}
