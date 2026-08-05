import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Обзор" };

export default function DashboardPage() {
  return (
    <PagePlaceholder
      title="Обзор"
      description="Личный кабинет: последние проекты, состояние аватаров и остаток кредитов."
      planned={[
        "Карточки последних проектов с датой изменения",
        "Статусы подготовки аватаров и голосов",
        "Остаток и резерв кредитов",
        "Активные задачи генерации с позицией в очереди",
      ]}
    />
  );
}
