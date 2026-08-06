"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, XCircle } from "lucide-react";
import {
  isJobActive,
  secondsToMinutesLabel,
  type GenerationJob,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { formatUpdatedAt } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const KIND_LABELS: Record<GenerationJob["kind"], string> = {
  tts: "Озвучивание",
  avatar_video: "Видео аватара",
  export: "Экспорт",
};

const STAGE_LABELS: Record<GenerationJob["stage"], string> = {
  waiting: "Ожидает обработки",
  synthesizing_speech: "Синтез речи",
  generating_video: "Генерация видео",
  assembling: "Сборка проекта",
  encoding: "Кодирование",
  uploading: "Выгрузка",
  done: "Готово",
};

export function QueueClient() {
  const [scope, setScope] = useState<"active" | "all">("active");
  const queryClient = useQueryClient();

  const jobs = useQuery({
    queryKey: [...queryKeys.adminJobs, scope],
    queryFn: () => dataClient.admin.listJobs({ active: scope === "active" }),
    // Очередь смотрят, чтобы увидеть текущее состояние, поэтому она
    // обновляется сама, а не по кнопке.
    refetchInterval: 2000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs });

  const cancel = useMutation({
    mutationFn: (jobId: string) => dataClient.generation.cancel(jobId),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: (jobId: string) => dataClient.generation.retry(jobId),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <Tabs value={scope} onValueChange={(value) => setScope(value as "active" | "all")}>
        <TabsList>
          <TabsTrigger value="active">В работе</TabsTrigger>
          <TabsTrigger value="all">Все задачи</TabsTrigger>
        </TabsList>
      </Tabs>

      {jobs.isPending ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (jobs.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground text-sm">
              {scope === "active" ? "Активных задач нет." : "Задач пока не было."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(jobs.data ?? []).map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onCancel={() => cancel.mutate(job.id)}
              onRetry={() => retry.mutate(job.id)}
              busy={cancel.isPending || retry.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  onCancel,
  onRetry,
  busy,
}: {
  job: GenerationJob;
  onCancel: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const active = isJobActive(job);

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{KIND_LABELS[job.kind]}</span>
          <StatusBadge job={job} />
          <span className="text-muted-foreground text-xs">
            {formatUpdatedAt(job.createdAt)}
          </span>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {job.estimatedCostSeconds > 0
              ? `${secondsToMinutesLabel(job.estimatedCostSeconds)} мин`
              : "без списания"}
          </span>
        </div>

        {active ? <Progress value={job.progressPct} className="h-1.5" /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">
            {STAGE_LABELS[job.stage]}
            {job.projectId ? ` · проект ${job.projectId}` : ""}
          </p>

          <div className="ml-auto flex gap-1">
            {active ? (
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                Остановить
              </Button>
            ) : null}
            {/* Повторяются только задачи, которые для этого пригодны: у
                отменённых и упавших вход сохранился, у успешных повтор — это
                новая генерация и новое списание. */}
            {job.status === "failed" || job.status === "canceled" ? (
              <Button variant="secondary" size="sm" onClick={onRetry} disabled={busy}>
                <RotateCcw className="size-3.5" />
                Повторить
              </Button>
            ) : null}
          </div>
        </div>

        {job.error ? (
          <p className="text-destructive text-xs">{job.error.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ job }: { job: GenerationJob }) {
  if (job.status === "succeeded") return <Badge variant="secondary">Готово</Badge>;
  if (job.status === "failed") return <Badge variant="destructive">Ошибка</Badge>;
  if (job.status === "canceled") return <Badge variant="outline">Отменено</Badge>;
  if (job.status === "running") return <Badge>Выполняется</Badge>;
  return <Badge variant="outline">В очереди</Badge>;
}
