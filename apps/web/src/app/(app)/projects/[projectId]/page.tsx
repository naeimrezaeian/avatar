import type { Metadata } from "next";
import { WorkspaceClient } from "./workspace-client";

export const metadata: Metadata = { title: "Рабочее пространство" };

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  // В Next 16 params асинхронные.
  const { projectId } = await params;
  return <WorkspaceClient projectId={projectId} />;
}
