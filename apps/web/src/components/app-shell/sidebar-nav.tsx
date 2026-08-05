"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type UserRole } from "@avatar/contracts";
import { NAV_GROUPS, isNavItemActive } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function SidebarNav({
  role,
  onNavigate,
}: {
  role: UserRole;
  /** Мобильная панель закрывается после перехода. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter(
          (item) => item.permission === undefined || can(role, item.permission),
        );
        if (items.length === 0) return null;

        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="text-sidebar-foreground/50 px-3 pb-1 text-xs font-medium tracking-wide uppercase">
              {group.label}
            </p>
            {items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
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
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
