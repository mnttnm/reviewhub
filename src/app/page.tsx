"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
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
    // Local cache is only a convenience when project storage is unavailable.
  }
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
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

  const totals = useMemo(
    () => ({
      projects: projects.length,
      reviews: projects.reduce((sum, project) => sum + (project.reviewCount || 0), 0),
      comments: projects.reduce((sum, project) => sum + (project.commentCount || 0), 0),
    }),
    [projects]
  );

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
      // Keep showing the local cache.
    }
  }

  function resetForm() {
    setName("");
    setDefaultUrl("");
    setGrouping("daily");
    setSlackEnabled(true);
    setSlackChannelId("");
    setConfluenceEnabled(false);
    setConfluenceSpaceId("");
    setConfluenceParentPageId("");
    setError(null);
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
      resetForm();
      setModalOpen(false);
    } catch {
      setError("Network error while creating project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f3ea] text-[#1f241f] font-[family-name:var(--font-geist-sans)]">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-10 flex flex-col gap-6 border-b border-[#d9d0c1] pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#77705f]">
              Review operations
            </p>
            <h1 className="text-4xl font-black tracking-[-0.04em] sm:text-6xl">
              ReviewHub
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-6 text-right sm:min-w-[420px]">
            <Metric label="projects" value={totals.projects} />
            <Metric label="reviews" value={totals.reviews} />
            <Metric label="comments" value={totals.comments} />
          </div>
        </header>

        <section className="flex-1">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.03em]">
                Active projects
              </h2>
              <p className="text-sm text-[#756d5c]">
                Copy a webhook, check routing, or jump to the latest destination.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={refreshProjects}
                className="rounded-full border border-[#c9beaa] px-4 py-2 text-sm font-medium text-[#4c473c] transition hover:bg-[#eee7da]"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-full bg-[#20251d] px-5 py-2 text-sm font-semibold text-[#fffaf0] transition hover:bg-[#3d452f]"
              >
                New project
              </button>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="border-t border-[#d9d0c1] py-14 text-[#756d5c]">
              No projects yet. Create one to generate a webhook.
            </div>
          ) : (
            <div className="border-t border-[#d9d0c1]">
              {projects.map((project) => (
                <ProjectRow key={project.id || project.token} project={project} />
              ))}
            </div>
          )}
        </section>
      </main>

      {modalOpen && (
        <CreateProjectModal
          confluenceEnabled={confluenceEnabled}
          confluenceParentPageId={confluenceParentPageId}
          confluenceSpaceId={confluenceSpaceId}
          defaultUrl={defaultUrl}
          error={error}
          grouping={grouping}
          loading={loading}
          name={name}
          slackChannelId={slackChannelId}
          slackEnabled={slackEnabled}
          onClose={() => {
            if (!loading) {
              setModalOpen(false);
              setError(null);
            }
          }}
          onConfluenceEnabledChange={setConfluenceEnabled}
          onConfluenceParentPageIdChange={setConfluenceParentPageId}
          onConfluenceSpaceIdChange={setConfluenceSpaceId}
          onDefaultUrlChange={setDefaultUrl}
          onGroupingChange={setGrouping}
          onNameChange={setName}
          onSlackChannelIdChange={setSlackChannelId}
          onSlackEnabledChange={setSlackEnabled}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-3xl font-black tracking-[-0.05em]">{value}</div>
      <div className="text-xs uppercase tracking-[0.18em] text-[#77705f]">
        {label}
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const [copied, setCopied] = useState(false);
  const webhookUrl =
    project.webhookUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/${project.id || project.token}`
      : `/api/webhook/${project.id || project.token}`);

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="grid gap-5 border-b border-[#d9d0c1] py-6 lg:grid-cols-[1.2fr_1.4fr_0.8fr] lg:items-center">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="truncate text-xl font-bold tracking-[-0.03em]">
            {project.name}
          </h3>
          <DestinationDot active={Boolean(project.destinations?.slack?.enabled)}>
            Slack
          </DestinationDot>
          <DestinationDot
            active={Boolean(project.destinations?.confluence?.enabled)}
          >
            Confluence
          </DestinationDot>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#756d5c]">
          <span>{project.grouping || "legacy"} grouping</span>
          <span>{project.reviewCount || 0} reviews</span>
          <span>{project.commentCount || 0} comments</span>
          {project.lastReviewAt && <span>last {formatDate(project.lastReviewAt)}</span>}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#8b826f]">
          Webhook
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-[#eee7da] px-3 py-2 text-xs text-[#2e3328]">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={copyWebhook}
            className="shrink-0 rounded-full bg-[#20251d] px-4 py-2 text-sm font-semibold text-[#fffaf0] transition hover:bg-[#3d452f]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <DirectLink label="Slack" href={project.latestGroup?.slack?.url} />
        <DirectLink label="Confluence" href={project.latestGroup?.confluence?.url} />
      </div>
    </article>
  );
}

function DestinationDot({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-xs text-[#5f5849]">
      <span
        className={
          active
            ? "h-2 w-2 rounded-full bg-[#34884f]"
            : "h-2 w-2 rounded-full bg-[#b7ad9b]"
        }
      />
      {children}
    </span>
  );
}

function DirectLink({ label, href }: { label: string; href?: string }) {
  if (!href) {
    return (
      <span className="rounded-full border border-[#d9d0c1] px-3 py-1.5 text-sm text-[#9a907c]">
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full border border-[#b6aa96] px-3 py-1.5 text-sm font-medium text-[#3d432f] transition hover:bg-[#eee7da]"
    >
      {label}
    </a>
  );
}

function CreateProjectModal({
  confluenceEnabled,
  confluenceParentPageId,
  confluenceSpaceId,
  defaultUrl,
  error,
  grouping,
  loading,
  name,
  slackChannelId,
  slackEnabled,
  onClose,
  onConfluenceEnabledChange,
  onConfluenceParentPageIdChange,
  onConfluenceSpaceIdChange,
  onDefaultUrlChange,
  onGroupingChange,
  onNameChange,
  onSlackChannelIdChange,
  onSlackEnabledChange,
  onSubmit,
}: {
  confluenceEnabled: boolean;
  confluenceParentPageId: string;
  confluenceSpaceId: string;
  defaultUrl: string;
  error: string | null;
  grouping: string;
  loading: boolean;
  name: string;
  slackChannelId: string;
  slackEnabled: boolean;
  onClose: () => void;
  onConfluenceEnabledChange: (enabled: boolean) => void;
  onConfluenceParentPageIdChange: (value: string) => void;
  onConfluenceSpaceIdChange: (value: string) => void;
  onDefaultUrlChange: (value: string) => void;
  onGroupingChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSlackChannelIdChange: (value: string) => void;
  onSlackEnabledChange: (enabled: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1f241f]/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl bg-[#fffaf0] p-6 text-[#1f241f] shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.04em]">
              New project
            </h2>
            <p className="text-sm text-[#756d5c]">
              Create a webhook and choose where reviews should land.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-[#756d5c] transition hover:bg-[#eee7da]"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Project label"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full rounded-xl border border-[#d3c8b5] bg-transparent px-4 py-3 text-sm outline-none focus:border-[#20251d]"
            required
          />
          <input
            type="url"
            placeholder="Default/prototype URL (optional)"
            value={defaultUrl}
            onChange={(e) => onDefaultUrlChange(e.target.value)}
            className="w-full rounded-xl border border-[#d3c8b5] bg-transparent px-4 py-3 text-sm outline-none focus:border-[#20251d]"
          />
          <select
            value={grouping}
            onChange={(e) => onGroupingChange(e.target.value)}
            className="w-full rounded-xl border border-[#d3c8b5] bg-transparent px-4 py-3 text-sm outline-none focus:border-[#20251d]"
          >
            <option value="daily">Daily thread/page</option>
            <option value="session">Session thread/page</option>
            <option value="submission">New thread/page per submission</option>
          </select>

          <div className="grid gap-3 sm:grid-cols-2">
            <DestinationPanel
              enabled={slackEnabled}
              title="Slack"
              onEnabledChange={onSlackEnabledChange}
            >
              <input
                type="text"
                placeholder="Channel ID (optional)"
                value={slackChannelId}
                onChange={(e) => onSlackChannelIdChange(e.target.value)}
                className="w-full rounded-lg border border-[#d3c8b5] bg-transparent px-3 py-2 text-sm outline-none focus:border-[#20251d]"
              />
            </DestinationPanel>
            <DestinationPanel
              enabled={confluenceEnabled}
              title="Confluence"
              onEnabledChange={onConfluenceEnabledChange}
            >
              <input
                type="text"
                placeholder="Space ID (optional)"
                value={confluenceSpaceId}
                onChange={(e) => onConfluenceSpaceIdChange(e.target.value)}
                className="w-full rounded-lg border border-[#d3c8b5] bg-transparent px-3 py-2 text-sm outline-none focus:border-[#20251d]"
              />
              <input
                type="text"
                placeholder="Parent page ID (optional)"
                value={confluenceParentPageId}
                onChange={(e) => onConfluenceParentPageIdChange(e.target.value)}
                className="w-full rounded-lg border border-[#d3c8b5] bg-transparent px-3 py-2 text-sm outline-none focus:border-[#20251d]"
              />
            </DestinationPanel>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#756d5c] transition hover:bg-[#eee7da] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[#20251d] px-5 py-2 text-sm font-semibold text-[#fffaf0] transition hover:bg-[#3d452f] disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DestinationPanel({
  children,
  enabled,
  onEnabledChange,
  title,
}: {
  children: React.ReactNode;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-[#d3c8b5] p-4">
      <label className="mb-3 flex items-center justify-between text-sm font-semibold">
        {title}
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
      </label>
      <div className={enabled ? "space-y-2" : "pointer-events-none space-y-2 opacity-40"}>
        {children}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
