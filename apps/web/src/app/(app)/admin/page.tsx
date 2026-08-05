import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Панель администратора" };

export default function AdminPage() {
  return (
    <PagePlaceholder
      title="Панель администратора"
      description="Пользователи, роли, тарифы, очередь генерации и системные журналы."
      planned={[
        "Статистика: пользователи, аватары, проекты, время генерации",
        "Управление пользователями, ролями и правами",
        "Начисление и списание кредитов, тарифные планы",
        "Очередь задач с остановкой и перезапуском",
      ]}
    />
  );
}
