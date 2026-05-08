"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { Project } from "@/lib/types";

const STORAGE_KEY = "reviewhub-projects";

function loadLocalProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalProjects(projects: Project[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Local cache is only a convenience when KV is unavailable.
  }
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [defaultUrl, setDefaultUrl] = useState("");
  const [grouping, setGrouping] = useState("daily");
  const [slackEnabled, setSlackEnabled] = useState(true);
  const [slackChannelId, setSlackChannelId] = useState("");
  const [confluenceEnabled, setConfluenceEnabled] = useState(false);
  const [confluenceSpaceId, setConfluenceSpaceId] = useState("");
  const [confluenceParentPageId, setConfluenceParentPageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjects(loadLocalProjects());
    void refreshProjects();
  }, []);

  async function refreshProjects() {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects);
      saveLocalProjects(data.projects);
    } catch {
      // The local cache remains useful when running without KV.
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          defaultUrl: defaultUrl.trim() || undefined,
          grouping,
          destinations: {
            slack: {
              enabled: slackEnabled,
              channelId: slackChannelId.trim() || undefined,
            },
            confluence: {
              enabled: confluenceEnabled,
              spaceId: confluenceSpaceId.trim() || undefined,
              parentPageId: confluenceParentPageId.trim() || undefined,
            },
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create project");
        return;
      }

      const project: Project = await res.json();
      const nextProjects = [project, ...projects];
      setProjects(nextProjects);
      saveLocalProjects(nextProjects);
      setName("");
      setDefaultUrl("");
      setSlackChannelId("");
      setConfluenceSpaceId("");
      setConfluenceParentPageId("");
    } catch {
      setError("Network error while creating project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 sm:p-16 font-[family-name:var(--font-geist-sans)]">
      <header className="max-w-5xl mx-auto mb-12">
        <h1 className="text-3xl font-bold mb-2">ReviewHub</h1>
        <p className="text-neutral-500">
          Route Agentation review comments to Slack, Confluence, both, or
          neither from one stable project webhook.
        </p>
      </header>

      <main className="max-w-5xl mx-auto space-y-10">
        <section className="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Create Project</h2>
            <button
              type="button"
              onClick={refreshProjects}
              className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Refresh
            </button>
          </div>

          <form onSubmit={handleCreate} className="grid gap-4">
            <input
              type="text"
              placeholder="Project label, e.g. Client A Dashboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              required
            />
            <input
              type="url"
              placeholder="Optional default/prototype URL"
              value={defaultUrl}
              onChange={(e) => setDefaultUrl(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />

            <label className="text-sm">
              <span className="block mb-1 text-neutral-500">Grouping</span>
              <select
                value={grouping}
                onChange={(e) => setGrouping(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm"
              >
                <option value="daily">Daily thread/page</option>
                <option value="session">Session thread/page</option>
                <option value="submission">New thread/page per submission</option>
              </select>
            </label>

            <div className="grid md:grid-cols-2 gap-4">
              <DestinationCard
                title="Slack"
                enabled={slackEnabled}
                onEnabledChange={setSlackEnabled}
              >
                <input
                  type="text"
                  placeholder="Slack channel ID, e.g. C0123456789"
                  value={slackChannelId}
                  onChange={(e) => setSlackChannelId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm"
                />
                <p className="text-xs text-neutral-500">
                  Leave blank to use SLACK_CHANNEL_ID.
                </p>
              </DestinationCard>

              <DestinationCard
                title="Confluence"
                enabled={confluenceEnabled}
                onEnabledChange={setConfluenceEnabled}
              >
                <input
                  type="text"
                  placeholder="Space ID"
                  value={confluenceSpaceId}
                  onChange={(e) => setConfluenceSpaceId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm"
                />
                <input
                  type="text"
                  placeholder="Optional parent page ID"
                  value={confluenceParentPageId}
                  onChange={(e) => setConfluenceParentPageId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-transparent text-sm"
                />
              </DestinationCard>
            </div>

            {error && (
              <p className="text-red-500 text-sm whitespace-pre-line">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-fit px-5 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </form>
        </section>

        <section>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold">Active Projects</h2>
              <p className="text-sm text-neutral-500">
                These are loaded from ReviewHub project storage, with local
                cache as fallback.
              </p>
            </div>
            <span className="text-sm text-neutral-500">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-6 text-sm text-neutral-500">
              No active projects yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => (
                <ProjectCard key={project.id || project.token} project={project} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function DestinationCard({
  title,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        {title}
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
      </label>
      <div className={enabled ? "space-y-2" : "space-y-2 opacity-40"}>
        {children}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [copied, setCopied] = useState(false);
  const webhookUrl =
    project.webhookUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/${project.id || project.token}`
      : `/api/webhook/${project.id || project.token}`);

  const snippet = `// ${project.name}
import { Agentation } from "agentation";

<Agentation webhookUrl="${webhookUrl}" />`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold">{project.name}</h3>
          <p className="text-sm text-neutral-500">
            Grouping: {project.grouping || "legacy"}{" "}
            {project.defaultUrl || project.baseUrl
              ? `• Default URL: ${project.defaultUrl || project.baseUrl}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusPill active={Boolean(project.destinations?.slack?.enabled)}>
            Slack
          </StatusPill>
          <StatusPill active={Boolean(project.destinations?.confluence?.enabled)}>
            Confluence
          </StatusPill>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-neutral-500 font-medium">
              Setup Snippet
            </span>
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3 text-xs overflow-x-auto font-[family-name:var(--font-geist-mono)]">
            {snippet}
          </pre>
        </div>

        <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 p-3 text-sm space-y-2">
          <div>
            <span className="text-neutral-500">Webhook:</span>{" "}
            <code className="text-xs break-all">{webhookUrl}</code>
          </div>
          <DirectLink label="Latest Slack thread" href={project.latestGroup?.slack?.url} />
          <DirectLink
            label="Latest Confluence page"
            href={project.latestGroup?.confluence?.url}
          />
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        active
          ? "px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
          : "px-2 py-1 rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
      }
    >
      {children}: {active ? "on" : "off"}
    </span>
  );
}

function DirectLink({ label, href }: { label: string; href?: string }) {
  if (!href) {
    return (
      <div>
        <span className="text-neutral-500">{label}:</span>{" "}
        <span className="text-neutral-400">available after first review</span>
      </div>
    );
  }

  return (
    <div>
      <span className="text-neutral-500">{label}:</span>{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        Open
      </a>
    </div>
  );
}
