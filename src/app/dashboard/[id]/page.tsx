"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Annotation, Project } from "@/lib/types";
import AnnotationList from "@/components/annotation-list";
import SetupSnippet from "@/components/setup-snippet";
import ExportButtons from "@/components/export-buttons";

interface ProjectWithCounts extends Project {
  annotation_counts: {
    total: number;
    pending: number;
    acknowledged: number;
    resolved: number;
    dismissed: number;
  };
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectWithCounts | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        setProject(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch project:", err);
    }
  }, [projectId]);

  const fetchAnnotations = useCallback(async () => {
    try {
      const searchParams = new URLSearchParams();
      if (statusFilter) searchParams.set("status", statusFilter);
      if (severityFilter) searchParams.set("severity", severityFilter);

      const url = `/api/projects/${projectId}/annotations?${searchParams}`;
      const res = await fetch(url);
      if (res.ok) {
        setAnnotations(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch annotations:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, severityFilter]);

  useEffect(() => {
    fetchProject();
    fetchAnnotations();
  }, [fetchProject, fetchAnnotations]);

  const handleStatusChange = async (
    annotationId: string,
    newStatus: string
  ) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/annotations/${annotationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (res.ok) {
        fetchAnnotations();
        fetchProject();
      }
    } catch (err) {
      console.error("Failed to update annotation:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500 font-[family-name:var(--font-geist-sans)]">
        Loading...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500 font-[family-name:var(--font-geist-sans)]">
        Project not found
      </div>
    );
  }

  return (
    <div className="min-h-screen font-[family-name:var(--font-geist-sans)]">
      <header className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/dashboard"
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-2 inline-block"
          >
            &larr; All Projects
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">{project.name}</h1>
              <a
                href={project.base_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-neutral-500 hover:underline"
              >
                {project.base_url}
              </a>
            </div>
            <ExportButtons projectId={projectId} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {(
            [
              ["Total", project.annotation_counts.total],
              ["Pending", project.annotation_counts.pending],
              ["Resolved", project.annotation_counts.resolved],
              ["Dismissed", project.annotation_counts.dismissed],
            ] as const
          ).map(([label, count]) => (
            <div
              key={label}
              className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 text-center"
            >
              <div className="text-2xl font-semibold">{count}</div>
              <div className="text-xs text-neutral-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Setup Snippet */}
        <SetupSnippet project={project} />

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-transparent"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-transparent"
          >
            <option value="">All severities</option>
            <option value="blocking">Blocking</option>
            <option value="important">Important</option>
            <option value="suggestion">Suggestion</option>
          </select>
        </div>

        {/* Annotation List */}
        <AnnotationList
          annotations={annotations}
          onStatusChange={handleStatusChange}
        />
      </main>
    </div>
  );
}
