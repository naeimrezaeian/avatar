import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Медиатека" };

export default function LibraryPage() {
  return (
    <PagePlaceholder
      title="Медиатека"
      description="Изображения, аудиофайлы и собственные видео, доступные во всех проектах."
      planned={[
        "Загрузка файлов с докачкой при обрыве",
        "Встроенная библиотека фонов и музыки",
        "Фильтры по типу, проекту и дате",
        "Квоты хранилища и правила автоочистки черновиков",
      ]}
    />
  );
}
