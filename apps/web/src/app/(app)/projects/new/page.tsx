import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = { title: "Новый проект" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="Новый проект"
        description="Проект — это отдельное рабочее пространство со своими сценами, материалами и версиями видео."
      />
      <NewProjectForm />
    </>
  );
}
