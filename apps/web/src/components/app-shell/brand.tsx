import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)}>
      <span className="bg-gradient-accent flex size-9 items-center justify-center rounded-xl shadow-soft">
        <Sparkles className="size-4.5 text-white" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sidebar-foreground text-sm font-semibold">Аватар</span>
        <span className="text-sidebar-foreground/50 text-xs">Студия видео</span>
      </span>
    </Link>
  );
}
