import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ProjectsClient } from "./projects-client";

export const metadata: Metadata = { title: "Проекты" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Проекты"
        description="Рабочие пространства со сценами, материалами и версиями видео."
      />
      <ProjectsClient />
    </>
  );
}
