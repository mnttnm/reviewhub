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
    <div className="min-h-screen overflow-hidden bg-[#11100e] text-[#eee9dd] font-[family-name:var(--font-geist-sans)]">
      <div className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:48px_48px]" />
      <main className="relative mx-auto grid min-h-screen w-full max-w-[1520px] grid-rows-[auto_1fr] border-x border-[#2b2924] bg-[#141310]/88">
        <header className="grid border-b border-[#2b2924] lg:grid-cols-[1.18fr_0.82fr]">
          <section className="min-w-0 p-6 sm:p-10">
            <div className="mb-8 flex items-center gap-3 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.24em] text-[#9f998a]">
              <span>Review operations</span>
              <span className="h-px flex-1 bg-[#343129]" />
              <span>Routing console</span>
            </div>
            <h1 className="max-w-4xl text-[clamp(3.5rem,8vw,9rem)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
              Review
              <br />
              Hub
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[#aaa291]">
              Project webhooks, delivery destinations, and review activity in
              one operational view.
            </p>
          </section>
          <aside className="grid border-t border-[#2b2924] bg-[#171611] lg:border-l lg:border-t-0">
            <Metric label="active projects" value={totals.projects} />
            <Metric label="reviews posted" value={totals.reviews} />
            <Metric label="comments routed" value={totals.comments} accent />
          </aside>
        </header>

        <section className="grid min-h-0 lg:grid-cols-[260px_1fr]">
          <nav className="border-b border-[#2b2924] p-5 lg:border-b-0 lg:border-r">
            <div className="sticky top-5 space-y-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.12em]">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="w-full border border-[#d5a33b] bg-[#d5a33b] px-4 py-3 text-left font-bold text-[#15120d] transition hover:bg-[#efc15b]"
              >
                + New project
              </button>
              <button
                type="button"
                onClick={refreshProjects}
                className="w-full border border-[#494438] px-4 py-3 text-left text-[#d7d0bf] transition hover:border-[#b7ad96] hover:text-[#f1eadc]"
              >
                Refresh index
              </button>
              <div className="border border-[#2b2924] bg-[#171611] p-4 text-[10px] leading-5 text-[#8f8776]">
                <div>Mode: project router</div>
                <div>Destinations: Slack + Confluence</div>
                <div>State: live</div>
              </div>
            </div>
          </nav>

          <section className="min-w-0">
            <div className="grid grid-cols-[1fr_auto] border-b border-[#2b2924] px-5 py-4 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#9f998a]">
              <span>Active projects</span>
              <span>{projects.length} units</span>
            </div>

            {projects.length === 0 ? (
              <div className="grid min-h-[320px] place-items-center p-8 text-center">
                <div>
                  <p className="mb-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.2em] text-[#d5a33b]">
                    No routing units found
                  </p>
                  <p className="max-w-md text-sm text-[#aaa291]">
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
    <div className="grid grid-cols-[1fr_auto] items-end border-b border-[#2b2924] p-5 last:border-b-0">
      <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#8f8776]">
        {label}
      </span>
      <data
        value={value}
        className={
          accent
            ? "text-5xl font-black tracking-[-0.07em] text-[#d5a33b]"
            : "text-5xl font-black tracking-[-0.07em] text-[#eee9dd]"
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
    <article className="grid border-b border-[#2b2924] transition hover:bg-[#18160f] xl:grid-cols-[minmax(220px,0.85fr)_minmax(360px,1.35fr)_minmax(240px,0.65fr)]">
      <section className="min-w-0 border-b border-[#2b2924] p-5 xl:border-b-0 xl:border-r">
        <div className="mb-2 flex items-center gap-2 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.16em] text-[#8f8776]">
          <span>{project.grouping || "legacy"}</span>
          <span className="text-[#4f493c]">/</span>
          <span>{project.id || "legacy"}</span>
        </div>
        <h3 className="truncate text-2xl font-extrabold leading-none tracking-[-0.04em]">
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

      <section className="min-w-0 border-b border-[#2b2924] p-5 xl:border-b-0 xl:border-r">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#8f8776]">
            Webhook endpoint
          </span>
          <button
            type="button"
            onClick={copyWebhook}
            className="border border-[#7c6e50] px-3 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] font-bold uppercase tracking-[0.12em] text-[#d5a33b] transition hover:border-[#d5a33b] hover:bg-[#d5a33b] hover:text-[#15120d]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <code className="block truncate border border-[#2d2a22] bg-[#0f0e0b] px-3 py-3 font-[family-name:var(--font-geist-mono)] text-xs text-[#d7d0bf]">
          {webhookUrl}
        </code>
      </section>

      <section className="grid grid-cols-2 xl:grid-cols-1">
        <div className="grid grid-cols-2 border-r border-[#2b2924] xl:border-b xl:border-r-0">
          <Telemetry label="reviews" value={project.reviewCount || 0} />
          <Telemetry label="comments" value={project.commentCount || 0} />
        </div>
        <div className="grid content-between gap-3 p-5">
          <div className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.14em] text-[#8f8776]">
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
      <data value={value} className="block text-3xl font-black tracking-[-0.05em] text-[#eee9dd]">
        {value}
      </data>
      <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.16em] text-[#8f8776]">
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
          ? "border border-[#6f603f] bg-[#2a2418] px-2 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] font-bold uppercase tracking-[0.12em] text-[#efc15b]"
          : "border border-[#3c382f] px-2 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.12em] text-[#706957]"
      }
    >
      {children}
    </span>
  );
}

function DirectLink({ label, href }: { label: string; href?: string }) {
  if (!href) {
    return (
      <span className="border border-[#2b2924] px-3 py-1.5 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.12em] text-[#706957]">
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border border-[#6f6655] px-3 py-1.5 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.12em] text-[#d7d0bf] transition hover:border-[#d5a33b] hover:text-[#efc15b]"
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
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-[#11100e]/82 p-4 backdrop-blur-sm sm:p-8">
      <div className="mx-auto w-full max-w-3xl border border-[#4a4436] bg-[#141310] text-[#eee9dd] shadow-2xl shadow-black/30">
        <header className="grid grid-cols-[1fr_auto] border-b border-[#2b2924]">
          <div className="p-5">
            <p className="mb-2 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#d5a33b]">
              Create project route
            </p>
            <h2 className="text-4xl font-black leading-none tracking-[-0.055em]">
              New project
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-l border-[#2b2924] px-5 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.16em] text-[#aaa291] transition hover:bg-[#242116] hover:text-[#efc15b]"
          >
            Close
          </button>
        </header>

        <form onSubmit={onSubmit} className="grid gap-px bg-[#2b2924]">
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
            <GroupingControl
              value={grouping}
              onChange={onGroupingChange}
            />
          </Field>

          <div className="grid gap-px bg-[#2b2924] sm:grid-cols-2">
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
            <div className="bg-[#141310] p-5 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.12em] text-[#efc15b]">
              {error}
            </div>
          )}

          <footer className="flex justify-end gap-px bg-[#2b2924]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="bg-[#141310] px-5 py-4 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.16em] text-[#aaa291] transition hover:text-[#eee9dd] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#d5a33b] px-5 py-4 font-[family-name:var(--font-geist-mono)] text-xs font-bold uppercase tracking-[0.16em] text-[#15120d] transition hover:bg-[#efc15b] disabled:opacity-50"
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
  return <div className="bg-[#141310] p-5">{children}</div>;
}

function GroupingControl({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const options = [
    { label: "Daily", value: "daily", detail: "One thread/page per day" },
    { label: "Session", value: "session", detail: "One thread/page per session" },
    { label: "Submission", value: "submission", detail: "One thread/page per submit" },
  ];

  return (
    <div>
      <div className="mb-3 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-[#8f8776]">
        Grouping protocol
      </div>
      <div className="grid gap-px bg-[#2b2924] sm:grid-cols-3">
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={
                selected
                  ? "bg-[#d5a33b] p-4 text-left text-[#15120d]"
                  : "bg-[#141310] p-4 text-left text-[#eee9dd] transition hover:bg-[#1d1a12]"
              }
            >
              <span className="block font-[family-name:var(--font-geist-mono)] text-xs font-bold uppercase tracking-[0.16em]">
                {option.label}
              </span>
              <span
                className={
                  selected
                    ? "mt-2 block text-xs text-[#4a3210]"
                    : "mt-2 block text-xs text-[#8f8776]"
                }
              >
                {option.detail}
              </span>
            </button>
          );
        })}
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
    <section className="bg-[#141310] p-5">
      <label className="mb-4 flex items-center justify-between font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.16em] text-[#d7d0bf]">
        {title}
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="destination-toggle"
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
