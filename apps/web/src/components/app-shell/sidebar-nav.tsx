"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { can, type UserRole } from "@avatar/contracts";
import { NAV_GROUPS, isNavItemActive } from "@/config/navigation";
import { useSession } from "@/lib/auth/session-context";
import { dataClient, queryKeys } from "@/lib/data";
import { cn } from "@/lib/utils";

export function SidebarNav({
  role,
  onNavigate,
  /**
   * Сворачиваемый вариант для боковой панели: подписи скрыты, пока на панель не
   * навели указатель. В мобильной панели он не нужен — там места достаточно.
   */
  collapsible = false,
}: {
  role: UserRole;
  onNavigate?: () => void;
  collapsible?: boolean;
}) {
  const pathname = usePathname();
  const { user } = useSession();

  // Счётчик непрочитанного переехал сюда из колокольчика в шапке: шапку убрали,
  // а знать о новых уведомлениях по-прежнему нужно. Опрос — потому что
  // уведомления порождаются фоновыми задачами, а не переходами по страницам.
  const unread = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => dataClient.notifications.unreadCount(user!.id),
    enabled: user !== null,
    refetchInterval: 10_000,
  });
  const unreadCount = unread.data ?? 0;

  // Раскрытие идёт и по фокусу: при обходе с клавиатуры подписи обязаны
  // появляться, иначе по панели невозможно ориентироваться без мыши.
  const revealed = "group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100";

  return (
    <nav className="flex flex-col gap-6">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter(
          (item) => item.permission === undefined || can(role, item.permission),
        );
        if (items.length === 0) return null;

        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p
              className={cn(
                "text-sidebar-foreground/50 px-3 pb-1 text-xs font-medium tracking-wide whitespace-nowrap uppercase",
                collapsible && `opacity-0 transition-opacity duration-200 ${revealed}`,
              )}
            >
              {group.label}
            </p>

            {items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const badge = item.href === "/notifications" ? unreadCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={badge > 0 ? `${item.label}, непрочитанных: ${badge}` : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {active ? (
                    <span className="bg-gradient-accent absolute top-1.5 bottom-1.5 -left-2 w-1 rounded-full" />
                  ) : null}
                  {/* Точка на значке видна и в свёрнутой панели, где подписей
                      нет: иначе о непрочитанном узнать было бы неоткуда. */}
                  <span className="relative shrink-0">
                    <item.icon className="size-4" />
                    {badge > 0 ? (
                      <span className="bg-gradient-accent absolute -top-0.5 -right-0.5 size-2 rounded-full" />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "truncate whitespace-nowrap",
                      collapsible && `opacity-0 transition-opacity duration-200 ${revealed}`,
                    )}
                  >
                    {item.label}
                  </span>
                  {badge > 0 ? (
                    <span
                      className={cn(
                        "bg-gradient-accent ml-auto rounded-full px-1.5 text-[11px] font-semibold text-white tabular-nums",
                        collapsible && `opacity-0 transition-opacity duration-200 ${revealed}`,
                      )}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
