import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "История генераций" };

export default function HistoryPage() {
  return (
    <PagePlaceholder
      title="История генераций"
      description="Все задачи синтеза речи, генерации видео и экспорта с их стоимостью."
      planned={[
        "Статус, этап и позиция в очереди",
        "Списанные и возвращённые кредиты по каждой задаче",
        "Повтор упавшей задачи без повторной оплаты",
        "Фильтр по проекту, типу задачи и периоду",
      ]}
    />
  );
}
