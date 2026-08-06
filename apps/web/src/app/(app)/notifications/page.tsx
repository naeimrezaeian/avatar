import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = { title: "Уведомления" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Уведомления"
        description="Завершение генераций, ошибки, начисления и системные сообщения."
      />
      <NotificationsClient />
    </>
  );
}
