import type { Metadata } from "next";
import { PodcastDetail } from "./podcast-detail";

export const metadata: Metadata = { title: "Выпуск подкаста" };

export default async function PodcastDetailPage({ params }: PageProps<"/podcast/[projectId]">) {
  const { projectId } = await params;
  return <PodcastDetail projectId={projectId} />;
}
