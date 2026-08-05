import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Проекты" };

export default function ProjectsPage() {
  return (
    <PagePlaceholder
      title="Проекты"
      description="Рабочие пространства: в каждом свой аватар, сцены, материалы и версии видео."
      planned={[
        "Список проектов с поиском и фильтрами",
        "Создание, переименование и копирование",
        "Архивирование, удаление и восстановление",
        "Сохранение проекта как шаблона",
      ]}
    />
  );
}
