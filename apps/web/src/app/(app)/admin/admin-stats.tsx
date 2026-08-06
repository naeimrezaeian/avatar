"use client";

import { useQuery } from "@tanstack/react-query";
import { secondsToMinutesLabel } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AdminStats() {
  const stats = useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: () => dataClient.admin.stats(),
    // Очередь и балансы меняются постоянно, а сводка — это то, ради чего
    // страницу и открывают.
    refetchInterval: 5000,
  });

  if (stats.isPending || !stats.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const data = stats.data;

  const groups: Array<{ title: string; tiles: Array<{ label: string; value: string; tone?: "warning" | "destructive" }> }> = [
    {
      title: "Пользователи",
      tiles: [
        { label: "Всего", value: String(data.usersTotal) },
        { label: "Активных", value: String(data.usersActive) },
        {
          label: "Заблокированных",
          value: String(data.usersBlocked),
          tone: data.usersBlocked > 0 ? "warning" : undefined,
        },
      ],
    },
    {
      title: "Содержимое",
      tiles: [
        { label: "Аватаров готово", value: `${data.avatarsReady} из ${data.avatarsTotal}` },
        { label: "Проектов", value: String(data.projectsTotal) },
        { label: "Готовых видео", value: String(data.rendersTotal) },
      ],
    },
    {
      title: "Генерация",
      tiles: [
        { label: "В очереди и в работе", value: String(data.jobsActive) },
        {
          label: "Задач с ошибкой",
          value: String(data.jobsFailed),
          tone: data.jobsFailed > 0 ? "destructive" : undefined,
        },
        { label: "Произведено видео", value: `${secondsToMinutesLabel(data.generatedSeconds)} мин` },
      ],
    },
    {
      title: "Кредиты",
      tiles: [
        { label: "Начислено", value: `${secondsToMinutesLabel(data.grantedSeconds)} мин` },
        { label: "Списано", value: `${secondsToMinutesLabel(data.spentSeconds)} мин` },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            {group.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile) => (
              <Card key={tile.label}>
                <CardContent className="pt-5">
                  <p className="text-muted-foreground text-xs">{tile.label}</p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-semibold tabular-nums",
                      tile.tone === "warning" && "text-warning",
                      tile.tone === "destructive" && "text-destructive",
                    )}
                  >
                    {tile.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
