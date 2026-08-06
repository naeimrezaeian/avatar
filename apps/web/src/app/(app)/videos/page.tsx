import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { VideosClient } from "./videos-client";

export const metadata: Metadata = { title: "Готовые видео" };

export default function VideosPage() {
  return (
    <>
      <PageHeader
        title="Готовые видео"
        description="Экспортированные версии по всем проектам. Каждая помнит ревизию проекта, из которой собрана."
      />
      <VideosClient />
    </>
  );
}
