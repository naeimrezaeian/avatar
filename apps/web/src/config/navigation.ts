import type { Route } from "next";
import type { Permission } from "@avatar/contracts";
import {
  AudioLines,
  Bell,
  Clapperboard,
  CreditCard,
  FolderKanban,
  History,
  Images,
  LayoutDashboard,
  Mic,
  Settings,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /**
   * Пункт показывается, только если у роли есть это право. Проверка идёт через
   * ROLE_PERMISSIONS из контрактов, а не по сравнению с ролью: иначе UI и
   * реальные права начнут расходиться при добавлении новой роли.
   */
  permission?: Permission;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Основное",
    items: [
      { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
      { href: "/projects", label: "Проекты", icon: FolderKanban },
      { href: "/podcast", label: "Подкасты", icon: Mic },
      { href: "/avatars", label: "Аватары", icon: UserRound },
      { href: "/voices", label: "Голоса", icon: AudioLines },
    ],
  },
  {
    label: "Материалы",
    items: [
      { href: "/videos", label: "Готовые видео", icon: Clapperboard },
      { href: "/library", label: "Медиатека", icon: Images },
      { href: "/history", label: "История генераций", icon: History },
    ],
  },
  {
    label: "Аккаунт",
    items: [
      { href: "/billing", label: "Тариф и кредиты", icon: CreditCard },
      { href: "/notifications", label: "Уведомления", icon: Bell },
      { href: "/settings", label: "Настройки", icon: Settings },
    ],
  },
  {
    label: "Администрирование",
    items: [
      {
        href: "/admin",
        label: "Панель",
        icon: ShieldCheck,
        permission: "stats.read",
      },
    ],
  },
];

/**
 * Активным считается пункт, чей путь совпадает или является префиксом текущего:
 * /projects остаётся подсвеченным на /projects/<id>.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
