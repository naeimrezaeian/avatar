import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Уведомления" };

export default function NotificationsPage() {
  return (
    <PagePlaceholder
      title="Уведомления"
      description="Завершение генераций, ошибки и системные сообщения."
      planned={[
        "Единый поток событий задач через SSE",
        "Отметка о прочтении и групповая очистка",
        "Настройка каналов доставки",
        "Системные объявления от администратора",
      ]}
    />
  );
}
