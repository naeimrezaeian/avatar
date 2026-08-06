import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SessionProvider } from "@/lib/auth/session-context";
import { DataProvider } from "@/lib/data/data-provider";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <DataProvider>
      <SessionProvider>
        <div className="flex min-h-dvh flex-1 flex-col">
          {/* Градиентная полоса сверху — тот же акцент, что и в кабинете, чтобы
              вход не выглядел страницей из другого продукта. */}
          <div className="bg-gradient-accent h-1 w-full" />

          <div className="flex flex-1 items-center justify-center px-4 py-10">
            <div className="w-full max-w-md">
              <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
                <span className="bg-gradient-accent flex size-10 items-center justify-center rounded-xl shadow-soft">
                  <Sparkles className="size-5 text-white" />
                </span>
                <span className="text-lg font-semibold">Аватар · Студия видео</span>
              </Link>

              {children}
            </div>
          </div>
        </div>
      </SessionProvider>
    </DataProvider>
  );
}
