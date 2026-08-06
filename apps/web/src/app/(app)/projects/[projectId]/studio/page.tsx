import type { Metadata } from "next";
import { StudioClient } from "./studio-client";

export const metadata: Metadata = { title: "Студия" };

export default async function StudioPage({ params }: PageProps<"/projects/[projectId]/studio">) {
  const { projectId } = await params;
  return <StudioClient projectId={projectId} />;
}
