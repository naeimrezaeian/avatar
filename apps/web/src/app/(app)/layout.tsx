import Link from "next/link";
import { Bell, Plus } from "lucide-react";
import { Brand } from "@/components/app-shell/brand";
import { CreditMeter } from "@/components/app-shell/credit-meter";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { DataProvider } from "@/lib/data/data-provider";
import {
  getCreditAccount,
  getCurrentUser,
  userFullName,
  userInitials,
} from "@/lib/mock-session";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const user = getCurrentUser();
  const account = getCreditAccount();

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Навигация тёмно-синяя и на светлой теме — п.14 ТЗ. Прилипает к верху и
          прокручивается сама: при длинном списке проектов она иначе уезжала бы
          вместе со страницей. */}
      <aside className="bg-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 p-4 lg:flex">
        <Brand className="px-1 pt-1" />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={user.role} />
        </div>
        <CreditMeter account={account} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/70 bg-background/85 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-md sm:px-6">
          <MobileNav role={user.role} />
          <div className="lg:hidden">
            <Brand />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button
              render={<Link href="/projects/new" />}
              className="bg-gradient-accent hidden text-white shadow-soft hover:opacity-90 sm:inline-flex"
            >
              <Plus className="size-4" />
              Новый проект
            </Button>
            <Button
              variant="ghost"
              size="icon"
              render={<Link href="/notifications" />}
              aria-label="Уведомления"
            >
              <Bell className="size-4" />
            </Button>
            <ThemeToggle />
            <UserMenu
              user={user}
              initials={userInitials(user)}
              fullName={userFullName(user)}
            />
          </div>
        </header>

        {/* Провайдер обёрнут вокруг содержимого, а не всей оболочки: пока
            открывается локальное хранилище, навигация должна оставаться на
            экране. */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <DataProvider>{children}</DataProvider>
        </main>
      </div>
    </div>
  );
}
