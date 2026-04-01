"use client";

import { useEffect, useState, useCallback } from "react";
import { Project } from "@/lib/types";
import ProjectList from "@/components/project-list";
import ProjectForm from "@/components/project-form";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleProjectCreated = () => {
    setShowForm(false);
    fetchProjects();
  };

  return (
    <div className="min-h-screen font-[family-name:var(--font-geist-sans)]">
      <header className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">ReviewHub</h1>
            <p className="text-sm text-neutral-500">
              Agentation feedback dashboard
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            New Project
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {showForm && (
          <ProjectForm
            onCreated={handleProjectCreated}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <div className="text-center text-neutral-500 py-12">
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-500 mb-4">No projects yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <ProjectList projects={projects} />
        )}
      </main>
    </div>
  );
}
