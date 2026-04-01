"use client";

import { useState } from "react";
import { Project } from "@/lib/types";

interface SetupSnippetProps {
  project: Project;
}

export default function SetupSnippet({ project }: SetupSnippetProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/projects/${project.id}/webhook?token=${project.webhook_token}`
      : `/api/projects/${project.id}/webhook?token=${project.webhook_token}`;

  const snippet = `import { Agentation } from "agentation";

// Add to your root layout or App component
<Agentation webhookUrl="${webhookUrl}" />`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-8 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        <span>Setup Instructions</span>
        <span className="text-neutral-400">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-neutral-200 dark:border-neutral-800">
          <div className="mt-4 space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              1. Install agentation in your prototype:{" "}
              <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-xs">
                npm install agentation -D
              </code>
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              2. Add this to your React app:
            </p>
            <div className="relative">
              <pre className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 text-xs overflow-x-auto font-[family-name:var(--font-geist-mono)]">
                {snippet}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              3. Annotations will automatically sync to this dashboard via
              webhooks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
