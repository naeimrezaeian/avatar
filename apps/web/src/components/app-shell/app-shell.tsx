"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CreditAccount } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useSession } from "@/lib/auth/session-context";
import { Brand } from "./brand";
import { NotificationBell } from "./notification-bell";
import { CreditMeter } from "./credit-meter";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/**
 * Оболочка кабинета вместе с проверкой доступа.
 *
 * Проверка выполняется на клиенте, потому что сессия на первом этапе живёт в
 * браузере. Это удобство навигации, а не защита: разметку страницы всё равно
 * можно получить, отключив скрипты. Настоящая проверка обязана переехать в
 * proxy.ts, как только бэкенд начнёт выдавать куку сессии.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const account = useQuery({
    queryKey: queryKeys.creditAccount,
    queryFn: () => dataClient.credits.getAccount(user!.id),
    enabled: user !== null,
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-3">
          <div className="bg-muted h-8 animate-pulse rounded-lg" />
          <div className="bg-muted h-32 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Панель свёрнута до иконок и раскрывается при наведении. В потоке
          страницы остаётся только узкая колонка, а раскрытая панель ложится
          поверх содержимого: иначе страница дёргалась бы при каждом наведении.
          Раскрытие идёт и по фокусу — с клавиатуры панель тоже должна
          открываться. */}
      <aside className="group/sidebar sticky top-0 hidden h-dvh w-16 shrink-0 lg:block">
        <div className="bg-sidebar absolute inset-y-0 left-0 z-40 flex w-16 flex-col gap-6 overflow-x-hidden p-2 transition-all duration-200 ease-out group-hover/sidebar:w-64 group-hover/sidebar:p-4 group-hover/sidebar:shadow-soft-lg group-focus-within/sidebar:w-64 group-focus-within/sidebar:p-4 group-focus-within/sidebar:shadow-soft-lg">
          <Brand className="px-1 pt-1" collapsible />
          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            <SidebarNav role={user.role} collapsible />
          </div>
          <CreditMeter account={account.data ?? emptyAccount(user.id)} collapsible />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/70 bg-background/85 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-md sm:px-6">
          <MobileNav role={user.role} />
          <div className="lg:hidden">
            <Brand />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell userId={user.id} />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Пока счёт грузится, счётчик рисуется по нулям, а не мигает пустотой. */
function emptyAccount(userId: string): CreditAccount {
  const timestamp = new Date().toISOString();
  return CreditAccount.parse({
    userId,
    balanceSeconds: 0,
    reservedSeconds: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
