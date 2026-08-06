"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info, Trash2 } from "lucide-react";
import type { LogLevel, SystemLogEntry } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const LEVEL_META: Record<LogLevel, { icon: typeof Info; className: string; label: string }> = {
  info: { icon: Info, className: "text-muted-foreground", label: "Сведения" },
  warning: { icon: AlertTriangle, className: "text-warning", label: "Предупреждения" },
  error: { icon: AlertCircle, className: "text-destructive", label: "Ошибки" },
};

export function LogsClient() {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<LogLevel | "all">("all");

  const logs = useQuery({
    queryKey: [...queryKeys.logs, level],
    queryFn: () => dataClient.logs.list(level === "all" ? undefined : { level }),
    refetchInterval: 5000,
  });

  const clear = useMutation({
    mutationFn: () => dataClient.logs.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.logs }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={level} onValueChange={(value) => setLevel(value as LogLevel | "all")}>
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="info">Сведения</TabsTrigger>
            <TabsTrigger value="warning">Предупреждения</TabsTrigger>
            <TabsTrigger value="error">Ошибки</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => clear.mutate()}>
          <Trash2 className="size-3.5" />
          Очистить журнал
        </Button>
      </div>

      {logs.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (logs.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground text-sm">Записей нет.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {(logs.data ?? []).map((entry) => (
                <LogRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-muted-foreground text-xs">
        Журнал хранит последние 500 записей: локальное хранилище не безразмерно, а старые
        события для разбора инцидентов уже бесполезны.
      </p>
    </div>
  );
}

function LogRow({ entry }: { entry: SystemLogEntry }) {
  const meta = LEVEL_META[entry.level];
  const Icon = meta.icon;

  return (
    <li className="flex items-start gap-3 p-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{entry.message}</p>
        <p className="text-muted-foreground text-xs">
          {entry.scope}
          {entry.targetId ? ` · ${entry.targetId}` : ""}
        </p>
      </div>
      <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
        {new Date(entry.createdAt).toLocaleTimeString("ru")}
      </span>
    </li>
  );
}
