"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { dataClient, queryKeys } from "@/lib/data";
import { Button } from "@/components/ui/button";

export function NotificationBell({ userId }: { userId: string }) {
  const unread = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => dataClient.notifications.unreadCount(userId),
    // Уведомления порождаются задачами в фоне, поэтому счётчик опрашивается
    // сам, а не ждёт перехода на страницу.
    refetchInterval: 10_000,
  });

  const count = unread.data ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      nativeButton={false} render={<Link href="/notifications" />}
      aria-label={count > 0 ? `Уведомления, непрочитанных: ${count}` : "Уведомления"}
      className="relative"
    >
      <Bell className="size-4" />
      {count > 0 ? (
        <span className="bg-gradient-accent absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[11px] font-semibold text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Button>
  );
}
