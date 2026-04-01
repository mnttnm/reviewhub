"use client";

import Link from "next/link";
import { Project } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
}

export default function ProjectList({ projects }: ProjectListProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/dashboard/${project.id}`}
          className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
        >
          <h3 className="font-semibold text-base mb-1">{project.name}</h3>
          <p className="text-sm text-neutral-500 truncate mb-3">
            {project.base_url}
          </p>
          <p className="text-xs text-neutral-400">
            Created {new Date(project.created_at).toLocaleDateString()}
          </p>
        </Link>
      ))}
    </div>
  );
}
