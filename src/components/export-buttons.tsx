"use client";

interface ExportButtonsProps {
  projectId: string;
}

export default function ExportButtons({ projectId }: ExportButtonsProps) {
  const handleDownloadMarkdown = () => {
    window.open(`/api/projects/${projectId}/export/markdown`, "_blank");
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleDownloadMarkdown}
        className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        Export Markdown
      </button>
    </div>
  );
}
