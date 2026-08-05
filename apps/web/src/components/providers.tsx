"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Отключаем анимации на момент переключения: иначе каждый элемент с
      // transition проигрывает свой переход и смена темы выглядит рваной.
      disableTransitionOnChange
    >
      <TooltipProvider delay={300}>{children}</TooltipProvider>
    </NextThemesProvider>
  );
}
