import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Готовые видео" };

export default function VideosPage() {
  return (
    <PagePlaceholder
      title="Готовые видео"
      description="Экспортированные версии роликов по всем проектам."
      planned={[
        "Просмотр и скачивание версий",
        "Ссылка для доступа с ограниченным сроком",
        "Создание новой версии из проекта",
        "Удаление версии с освобождением хранилища",
      ]}
    />
  );
}
