"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import type { UserRole } from "@avatar/contracts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

export function MobileNav({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Навигация">
            <Menu className="size-5" />
          </Button>
        }
      />
      <SheetContent side="left" className="bg-sidebar w-72 border-r-0 p-0">
        <SheetTitle className="sr-only">Навигация</SheetTitle>
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
          <Brand />
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
