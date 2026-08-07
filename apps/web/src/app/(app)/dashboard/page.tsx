import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Обзор" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Обзор"
        description="Проекты, аватары, остаток кредитов и готовые видео."
      />
      {/* Данные первого этапа лежат в IndexedDB, поэтому читаются на клиенте.
          Когда появится HTTP-бэкенд, списки переедут в серверные компоненты. */}
      <DashboardClient />
    </>
  );
}
