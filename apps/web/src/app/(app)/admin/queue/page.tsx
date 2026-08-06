import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = { title: "Очередь генерации" };

export default function AdminQueuePage() {
  return (
    <>
      <PageHeader
        title="Очередь генерации"
        description="Задачи всех пользователей: остановка активных и повтор упавших."
      />
      <QueueClient />
    </>
  );
}
