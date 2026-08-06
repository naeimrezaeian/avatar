import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AvatarsClient } from "./avatars-client";

export const metadata: Metadata = { title: "Аватары" };

export default function AvatarsPage() {
  return (
    <>
      <PageHeader
        title="Аватары"
        description="Цифровые аватары для генерации видео. Обработка начинается только после согласия на использование изображения."
      />
      <AvatarsClient />
    </>
  );
}
