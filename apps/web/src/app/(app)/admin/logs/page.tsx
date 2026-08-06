import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { LogsClient } from "./logs-client";

export const metadata: Metadata = { title: "Журнал системы" };

export default function AdminLogsPage() {
  return (
    <>
      <PageHeader
        title="Журнал системы"
        description="Действия администраторов и события генерации для разбора инцидентов."
      />
      <LogsClient />
    </>
  );
}
