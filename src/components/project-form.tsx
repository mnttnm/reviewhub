"use client";

import { useState } from "react";

interface ProjectFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

export default function ProjectForm({ onCreated, onCancel }: ProjectFormProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, base_url: baseUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create project");
        return;
      }

      onCreated();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-8 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-4">Create New Project</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium mb-1"
          >
            Project Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Prototype"
            required
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
          />
        </div>
        <div>
          <label
            htmlFor="baseUrl"
            className="block text-sm font-medium mb-1"
          >
            Base URL
          </label>
          <input
            id="baseUrl"
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://my-app.vercel.app"
            required
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
