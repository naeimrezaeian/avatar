import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PodcastForm } from "./podcast-form";

export const metadata: Metadata = { title: "Видеоподкаст" };

export default function PodcastPage() {
  return (
    <>
      <PageHeader
        title="Видеоподкаст"
        description="Разговор двух аватаров: ведущий и гость. Реплики становятся сценами обычного проекта."
      />
      <PodcastForm />
    </>
  );
}
