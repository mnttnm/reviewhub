"use client";

import { useState } from "react";

interface Project {
  id: string;
  name: string;
  baseUrl: string;
  slackThreadTs: string | null;
  createdAt: string;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // ignore — projects list is optional
    }
    setFetched(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), baseUrl: baseUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create project");
        return;
      }

      const project = await res.json();
      setProjects((prev) => [project, ...prev]);
      setName("");
      setBaseUrl("");
    } catch {
      setError("Network error — is Slack configured?");
    } finally {
      setLoading(false);
    }
  };

  // Fetch projects on first render
  if (!fetched) {
    fetchProjects();
  }

  return (
    <div className="min-h-screen p-8 sm:p-16 font-[family-name:var(--font-geist-sans)]">
      <header className="max-w-3xl mx-auto mb-12">
        <h1 className="text-3xl font-bold mb-2">ReviewHub</h1>
        <p className="text-neutral-500">
          Capture UI review annotations from{" "}
          <a
            href="https://www.agentation.com/"
            className="underline hover:text-neutral-800 dark:hover:text-neutral-200"
            target="_blank"
            rel="noopener noreferrer"
          >
            Agentation
          </a>{" "}
          and post them to Slack with screenshots.
        </p>
      </header>

      <main className="max-w-3xl mx-auto space-y-10">
        {/* Create Project */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Create a Project</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              required
            />
            <input
              type="url"
              placeholder="https://my-app.vercel.app"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              required
            />
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </form>
        </section>

        {/* Projects List */}
        {projects.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Projects</h2>
            <div className="space-y-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>
        )}

        {/* How It Works */}
        <section className="border-t border-neutral-200 dark:border-neutral-800 pt-10">
          <h2 className="text-xl font-semibold mb-4">How It Works</h2>
          <ol className="list-decimal list-inside space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
            <li>
              Create a project above — this creates a Slack thread in your
              configured channel.
            </li>
            <li>
              Install{" "}
              <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-xs">
                agentation
              </code>{" "}
              in your prototype and configure the webhook URL to point to
              ReviewHub.
            </li>
            <li>
              Share the prototype URL with your client. They annotate the live
              UI using Agentation.
            </li>
            <li>
              When they submit, ReviewHub captures a screenshot and posts
              everything to the Slack thread — screenshot + numbered annotation
              list.
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [copied, setCopied] = useState(false);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/${project.id}`
      : `/api/webhook/${project.id}`;

  const snippet = `// Option A: Use Agentation's built-in webhookUrl
import { Agentation } from "agentation";

<Agentation webhookUrl="${webhookUrl}" />

// Option B: Use ReviewCapture for screenshot support
// (requires html2canvas: npm install html2canvas)
// See ReviewCapture component in the repo for details.`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold">{project.name}</h3>
          <p className="text-sm text-neutral-500">{project.baseUrl}</p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            project.slackThreadTs
              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
          }`}
        >
          {project.slackThreadTs ? "Slack connected" : "No Slack thread"}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500 font-medium">
            Setup Snippet
          </span>
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3 text-xs overflow-x-auto font-[family-name:var(--font-geist-mono)]">
          {snippet}
        </pre>
      </div>

      <div className="mt-3 text-xs text-neutral-400">
        Webhook: <code className="text-neutral-500">{webhookUrl}</code>
      </div>
    </div>
  );
}
