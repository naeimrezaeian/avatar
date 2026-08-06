"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

/**
 * У платформы одна тема, поэтому провайдера оформления нет: выбор темы был бы
 * настройкой без вариантов.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider delay={300}>{children}</TooltipProvider>;
}
