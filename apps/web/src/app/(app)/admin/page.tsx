import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AdminStats } from "./admin-stats";

export const metadata: Metadata = { title: "Панель администратора" };

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Панель администратора"
        description="Состояние платформы: пользователи, содержимое, очередь генерации и расход кредитов."
      />
      <AdminStats />
    </>
  );
}
