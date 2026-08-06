import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PodcastList } from "./podcast-list";

export const metadata: Metadata = { title: "Видеоподкасты" };

export default function PodcastPage() {
  return (
    <>
      <PageHeader
        title="Видеоподкасты"
        description="Разговоры двух аватаров. Откройте выпуск, чтобы посмотреть готовое видео."
      />
      <PodcastList />
    </>
  );
}
