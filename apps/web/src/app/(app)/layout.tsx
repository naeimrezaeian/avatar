import { AppShell } from "@/components/app-shell/app-shell";
import { SessionProvider } from "@/lib/auth/session-context";
import { DataProvider } from "@/lib/data/data-provider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  // Порядок обёрток задан зависимостями: сессия читается из локального
  // хранилища, поэтому провайдер данных должен открыть базу первым.
  return (
    <DataProvider>
      <SessionProvider>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </DataProvider>
  );
}
