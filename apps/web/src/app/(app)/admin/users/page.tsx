import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Пользователи" };

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader
        title="Пользователи"
        description="Роли, статус учётной записи и ручная корректировка кредитов."
      />
      <UsersClient />
    </>
  );
}
