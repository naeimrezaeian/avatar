"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can } from "@avatar/contracts";
import { useSession } from "@/lib/auth/session-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { Route } from "next";

const TABS: Array<{ href: Route; label: string }> = [
  { href: "/admin", label: "Сводка" },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/queue", label: "Очередь генерации" },
];

/**
 * Разделы администрирования закрыты правом, а не сравнением роли: набор ролей
 * будет меняться, а право stats.read останется точкой, по которой проверяется
 * доступ. Проверка на клиенте — удобство навигации; настоящая обязана быть на
 * сервере вместе с бэкендом.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const pathname = usePathname();

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  if (!user || !can(user.role, "stats.read")) {
    return (
      <Alert>
        <AlertDescription>
          У вашей роли нет доступа к разделам администрирования.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="border-border flex flex-wrap gap-1 border-b pb-2">
        {TABS.map((tab) => {
          const active =
            tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
