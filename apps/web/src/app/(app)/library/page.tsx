import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { LibraryClient } from "./library-client";

export const metadata: Metadata = { title: "Медиатека" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader
        title="Медиатека"
        description="Изображения, аудио и видео, доступные во всех проектах."
      />
      <LibraryClient />
    </>
  );
}
