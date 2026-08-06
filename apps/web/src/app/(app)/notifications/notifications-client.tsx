"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bell, CheckCheck, CheckCircle2, Megaphone, Trash2, Wallet } from "lucide-react";
import type { Notification, NotificationKind } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useSession } from "@/lib/auth/session-context";
import { formatUpdatedAt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<NotificationKind, typeof Bell> = {
  job_succeeded: CheckCircle2,
  job_failed: AlertCircle,
  credits_granted: Wallet,
  credits_low: Wallet,
  avatar_ready: CheckCircle2,
  system_announcement: Megaphone,
};

export function NotificationsClient() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => dataClient.notifications.list(user!.id),
    enabled: user !== null,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    await queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
  };

  const markAll = useMutation({
    mutationFn: () => dataClient.notifications.markAllRead(user!.id),
    onSuccess: invalidate,
  });
  const clear = useMutation({
    mutationFn: () => dataClient.notifications.clear(user!.id),
    onSuccess: invalidate,
  });
  const markOne = useMutation({
    mutationFn: (id: string) => dataClient.notifications.markRead(id),
    onSuccess: invalidate,
  });

  if (notifications.isPending) return <Skeleton className="h-64 rounded-2xl" />;

  const items = notifications.data ?? [];
  const unread = items.filter((item) => item.readAt === null).length;

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Bell className="text-muted-foreground mx-auto mb-3 size-8" />
          <p className="text-muted-foreground text-sm">
            Уведомлений нет. Здесь появятся сообщения о завершённых генерациях, ошибках и
            начислениях.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {unread > 0 ? `Непрочитанных: ${unread}` : "Все прочитаны"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={unread === 0 || markAll.isPending}
          >
            <CheckCheck className="size-3.5" />
            Отметить все прочитанными
          </Button>
          <Button variant="ghost" size="sm" onClick={() => clear.mutate()}>
            <Trash2 className="size-3.5" />
            Очистить
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <NotificationRow key={item.id} item={item} onRead={() => markOne.mutate(item.id)} />
        ))}
      </ul>
    </div>
  );
}

function NotificationRow({ item, onRead }: { item: Notification; onRead: () => void }) {
  const Icon = KIND_ICONS[item.kind];
  const unread = item.readAt === null;

  const content = (
    <div
      className={cn(
        "border-border flex items-start gap-3 rounded-xl border p-3 transition-colors",
        unread ? "bg-accent/40" : "bg-card",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          item.kind === "job_failed" ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", unread && "font-medium")}>{item.title}</p>
        {item.body ? <p className="text-muted-foreground text-xs">{item.body}</p> : null}
        <p className="text-muted-foreground mt-1 text-xs">{formatUpdatedAt(item.createdAt)}</p>
      </div>
      {unread ? <span className="bg-gradient-accent mt-1.5 size-2 shrink-0 rounded-full" /> : null}
    </div>
  );

  return (
    <li>
      {item.href ? (
        <Link href={item.href as Route} onClick={onRead} className="block">
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onRead} className="block w-full text-left">
          {content}
        </button>
      )}
    </li>
  );
}
