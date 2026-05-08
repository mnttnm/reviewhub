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
    <div className="min-h-screen overflow-hidden bg-[#0b0b0b] text-[#e8e4da] font-[family-name:var(--font-geist-sans)]">
      <div className="pointer-events-none fixed inset-0 opacity-[0.06] [background-image:repeating-linear-gradient(0deg,transparent,transparent_2px,#fff_2px,#fff_3px)]" />
      <main className="relative mx-auto grid min-h-screen w-full max-w-[1600px] grid-rows-[auto_1fr] border-x border-[#353535]">
        <header className="grid border-b border-[#353535] lg:grid-cols-[1.25fr_0.75fr]">
          <section className="min-w-0 p-5 sm:p-8">
            <div className="mb-6 flex items-center gap-3 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.22em] text-[#a6a197]">
              <span>[ REVIEW OPS ]</span>
              <span className="h-px flex-1 bg-[#353535]" />
              <span>REV / 04</span>
            </div>
            <h1 className="max-w-5xl text-[clamp(4.5rem,13vw,13rem)] font-black uppercase leading-[0.78] tracking-[-0.075em]">
              Review
              <br />
              Hub
            </h1>
          </section>
          <aside className="grid border-t border-[#353535] lg:border-l lg:border-t-0">
            <Metric label="active projects" value={totals.projects} />
            <Metric label="reviews posted" value={totals.reviews} />
            <Metric label="comments routed" value={totals.comments} accent />
          </aside>
        </header>

        <section className="grid min-h-0 lg:grid-cols-[260px_1fr]">
          <nav className="border-b border-[#353535] p-5 lg:border-b-0 lg:border-r">
            <div className="sticky top-5 space-y-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.12em]">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="w-full border border-[#e61919] bg-[#e61919] px-4 py-3 text-left font-bold text-[#0b0b0b] transition hover:bg-[#ff2a2a]"
              >
                + New project
              </button>
              <button
                type="button"
                onClick={refreshProjects}
                className="w-full border border-[#525252] px-4 py-3 text-left text-[#e8e4da] transition hover:border-[#e8e4da]"
              >
                Refresh index
              </button>
              <div className="border border-[#353535] p-4 text-[10px] leading-5 text-[#8d887d]">
                <div>MODE / PROJECT ROUTER</div>
                <div>DEST / SLACK + CONF</div>
                <div>STATE / LIVE</div>
              </div>
            </div>
          </nav>

          <section className="min-w-0">
            <div className="grid grid-cols-[1fr_auto] border-b border-[#353535] px-5 py-4 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#a6a197]">
              <span>Active projects</span>
              <span>{projects.length} units</span>
            </div>

            {projects.length === 0 ? (
              <div className="grid min-h-[320px] place-items-center p-8 text-center">
                <div>
                  <p className="mb-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.2em] text-[#e61919]">
                    No routing units found
                  </p>
                  <p className="max-w-md text-sm text-[#a6a197]">
                    Create a project to generate the webhook endpoint Agentation
                    should call.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                {projects.map((project) => (
                  <ProjectRow key={project.id || project.token} project={project} />
                ))}
              </div>
            )}
          </section>
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

function Metric({
  accent,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-end border-b border-[#353535] p-5 last:border-b-0">
      <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#8d887d]">
        {label}
      </span>
      <data
        value={value}
        className={
          accent
            ? "text-5xl font-black tracking-[-0.08em] text-[#e61919]"
            : "text-5xl font-black tracking-[-0.08em]"
        }
      >
        {value}
      </data>
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
    <article className="grid border-b border-[#353535] transition hover:bg-[#111] xl:grid-cols-[minmax(220px,0.85fr)_minmax(360px,1.35fr)_minmax(240px,0.65fr)]">
      <section className="min-w-0 border-b border-[#353535] p-5 xl:border-b-0 xl:border-r">
        <div className="mb-2 flex items-center gap-2 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.16em] text-[#8d887d]">
          <span>{project.grouping || "legacy"}</span>
          <span>{"/ /"}</span>
          <span>{project.id || "legacy"}</span>
        </div>
        <h3 className="truncate text-2xl font-black uppercase leading-none tracking-[-0.055em]">
          {project.name}
        </h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <DestinationMarker active={Boolean(project.destinations?.slack?.enabled)}>
            Slack
          </DestinationMarker>
          <DestinationMarker
            active={Boolean(project.destinations?.confluence?.enabled)}
          >
            Confluence
          </DestinationMarker>
        </div>
      </section>

      <section className="min-w-0 border-b border-[#353535] p-5 xl:border-b-0 xl:border-r">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#8d887d]">
            Webhook endpoint
          </span>
          <button
            type="button"
            onClick={copyWebhook}
            className="border border-[#e61919] px-3 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] font-bold uppercase tracking-[0.12em] text-[#e61919] transition hover:bg-[#e61919] hover:text-[#0b0b0b]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <code className="block truncate border border-[#353535] bg-[#080808] px-3 py-3 font-[family-name:var(--font-geist-mono)] text-xs text-[#e8e4da]">
          {webhookUrl}
        </code>
      </section>

      <section className="grid grid-cols-2 xl:grid-cols-1">
        <div className="grid grid-cols-2 border-r border-[#353535] xl:border-b xl:border-r-0">
          <Telemetry label="reviews" value={project.reviewCount || 0} />
          <Telemetry label="comments" value={project.commentCount || 0} />
        </div>
        <div className="grid content-between gap-3 p-5">
          <div className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.14em] text-[#8d887d]">
            {project.lastReviewAt ? `Last ${formatDate(project.lastReviewAt)}` : "No reviews yet"}
          </div>
          <div className="flex flex-wrap gap-2">
            <DirectLink label="Slack" href={project.latestGroup?.slack?.url} />
            <DirectLink label="Confluence" href={project.latestGroup?.confluence?.url} />
          </div>
        </div>
      </section>
    </article>
  );
}

function Telemetry({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-5">
      <data value={value} className="block text-3xl font-black tracking-[-0.06em]">
        {value}
      </data>
      <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.16em] text-[#8d887d]">
        {label}
      </span>
    </div>
  );
}

function DestinationMarker({
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
          ? "border border-[#e61919] bg-[#e61919] px-2 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] font-bold uppercase tracking-[0.12em] text-[#0b0b0b]"
          : "border border-[#4a4a4a] px-2 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.12em] text-[#777]"
      }
    >
      [{children}]
    </span>
  );
}

function DirectLink({ label, href }: { label: string; href?: string }) {
  if (!href) {
    return (
      <span className="border border-[#353535] px-3 py-1.5 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.12em] text-[#666]">
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border border-[#8d887d] px-3 py-1.5 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.12em] text-[#e8e4da] transition hover:border-[#e61919] hover:text-[#e61919]"
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
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-[#0b0b0b]/80 p-4 backdrop-blur-sm sm:p-8">
      <div className="mx-auto w-full max-w-3xl border border-[#e8e4da] bg-[#0b0b0b] text-[#e8e4da]">
        <header className="grid grid-cols-[1fr_auto] border-b border-[#353535]">
          <div className="p-5">
            <p className="mb-2 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#e61919]">
              Create routing unit
            </p>
            <h2 className="text-4xl font-black uppercase leading-none tracking-[-0.06em]">
              New project
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-l border-[#353535] px-5 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.16em] text-[#a6a197] transition hover:bg-[#e61919] hover:text-[#0b0b0b]"
          >
            Close
          </button>
        </header>

        <form onSubmit={onSubmit} className="grid gap-px bg-[#353535]">
          <Field>
            <input
              type="text"
              placeholder="Project label"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="control"
              required
            />
          </Field>
          <Field>
            <input
              type="url"
              placeholder="Default/prototype URL (optional)"
              value={defaultUrl}
              onChange={(e) => onDefaultUrlChange(e.target.value)}
              className="control"
            />
          </Field>
          <Field>
            <select
              value={grouping}
              onChange={(e) => onGroupingChange(e.target.value)}
              className="control"
            >
              <option value="daily">Daily thread/page</option>
              <option value="session">Session thread/page</option>
              <option value="submission">New thread/page per submission</option>
            </select>
          </Field>

          <div className="grid gap-px bg-[#353535] sm:grid-cols-2">
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
                className="control"
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
                className="control"
              />
              <input
                type="text"
                placeholder="Parent page ID (optional)"
                value={confluenceParentPageId}
                onChange={(e) => onConfluenceParentPageIdChange(e.target.value)}
                className="control"
              />
            </DestinationPanel>
          </div>

          {error && (
            <div className="bg-[#0b0b0b] p-5 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.12em] text-[#ff2a2a]">
              {error}
            </div>
          )}

          <footer className="flex justify-end gap-px bg-[#353535]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="bg-[#0b0b0b] px-5 py-4 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.16em] text-[#a6a197] transition hover:text-[#e8e4da] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#e61919] px-5 py-4 font-[family-name:var(--font-geist-mono)] text-xs font-bold uppercase tracking-[0.16em] text-[#0b0b0b] transition hover:bg-[#ff2a2a] disabled:opacity-50"
            >
              {loading ? "Creating" : "Create"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#0b0b0b] p-5">{children}</div>;
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
    <section className="bg-[#0b0b0b] p-5">
      <label className="mb-4 flex items-center justify-between font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.16em]">
        [{title}]
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
      </label>
      <div className={enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-35"}>
        {children}
      </div>
    </section>
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
