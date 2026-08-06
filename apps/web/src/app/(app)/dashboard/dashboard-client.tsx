"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  availableSeconds,
  estimateSpeechDurationSec,
  isJobActive,
  secondsToMinutesLabel,
  type GenerationJob,
} from "@avatar/contracts";
import { AudioLines, Clapperboard, Loader2, XCircle } from "lucide-react";
import { InsufficientCreditsError, dataClient, queryKeys } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const DEMO_PROJECT_ID = "prj_demo";
const DEMO_SCENE_ID = "scn_demo";

const STAGE_LABELS: Record<GenerationJob["stage"], string> = {
  waiting: "Ожидает обработки",
  synthesizing_speech: "Синтез речи",
  generating_video: "Генерация видео",
  assembling: "Сборка проекта",
  encoding: "Кодирование",
  uploading: "Выгрузка",
  done: "Готово",
};

const KIND_LABELS: Record<GenerationJob["kind"], string> = {
  tts: "Озвучивание",
  avatar_video: "Видео аватара",
  export: "Экспорт",
};

export function DashboardClient() {
  const queryClient = useQueryClient();

  const projects = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => dataClient.projects.list(),
  });
  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const account = useQuery({
    queryKey: queryKeys.creditAccount,
    queryFn: () => dataClient.credits.getAccount("usr_demo"),
  });
  const jobs = useQuery({
    queryKey: queryKeys.jobs(),
    queryFn: () => dataClient.jobs.list(),
  });
  const document = useQuery({
    queryKey: queryKeys.document(DEMO_PROJECT_ID),
    queryFn: () => dataClient.documents.get(DEMO_PROJECT_ID),
  });

  const scene = document.data?.scenes[DEMO_SCENE_ID] ?? null;
  const voiceoverReady = scene?.voiceoverAssetId !== null && scene?.voiceoverAssetId !== undefined;

  const startVoiceover = useMutation({
    mutationFn: () =>
      dataClient.generation.startVoiceover({
        projectId: DEMO_PROJECT_ID,
        sceneId: DEMO_SCENE_ID,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const startVideo = useMutation({
    mutationFn: () =>
      dataClient.generation.startVideo({ projectId: DEMO_PROJECT_ID, sceneId: DEMO_SCENE_ID }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const cancel = useMutation({
    mutationFn: (jobId: string) => dataClient.generation.cancel(jobId),
  });

  const activeJobs = (jobs.data ?? []).filter(isJobActive);
  const recentJobs = (jobs.data ?? []).filter((job) => !isJobActive(job)).slice(0, 4);

  // Смета считается до запуска: пользователь должен видеть цену заранее, а не
  // узнавать её из списанного баланса.
  const estimatedSec = scene ? estimateSpeechDurationSec(scene.scriptText, scene.speech) : 0;

  const startError = startVideo.error ?? startVoiceover.error;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
        <StatCard label="Проекты" value={String(projects.data?.length ?? "—")} />
        <StatCard label="Аватары" value={String(avatars.data?.length ?? "—")} />
        <StatCard
          label="Доступно минут"
          value={account.data ? secondsToMinutesLabel(availableSeconds(account.data)) : "—"}
          hint={
            account.data && account.data.reservedSeconds > 0
              ? `${secondsToMinutesLabel(account.data.reservedSeconds)} мин в резерве`
              : undefined
          }
        />
      </div>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Демонстрация пайплайна</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Озвучка синтезируется первой и не тарифицируется — она является входом для видео.
            Кнопка генерации видео недоступна, пока озвучки нет.
          </p>

          {scene ? (
            <div className="bg-muted/50 rounded-xl p-3 text-sm">
              <p className="text-muted-foreground mb-1 text-xs font-medium">Текст сцены</p>
              <p className="line-clamp-3">{scene.scriptText}</p>
              <p className="text-muted-foreground mt-2 text-xs">
                Оценка длительности: {estimatedSec.toFixed(1)} с
                {scene.durationSec !== null
                  ? ` · фактическая: ${scene.durationSec.toFixed(1)} с`
                  : ""}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => startVoiceover.mutate()}
              disabled={startVoiceover.isPending}
              variant="secondary"
            >
              <AudioLines className="size-4" />
              Синтезировать озвучку
            </Button>
            <Button
              onClick={() => startVideo.mutate()}
              disabled={!voiceoverReady || startVideo.isPending}
              className="bg-gradient-accent text-white hover:opacity-90"
            >
              <Clapperboard className="size-4" />
              Сгенерировать видео
            </Button>
          </div>

          {startError ? (
            <p className="text-destructive text-sm">
              {startError instanceof InsufficientCreditsError
                ? `Недостаточно кредитов: нужно ${secondsToMinutesLabel(startError.requiredSeconds)} мин, доступно ${secondsToMinutesLabel(startError.availableSeconds)} мин`
                : startError.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Очередь генерации</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeJobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Активных задач нет.</p>
          ) : (
            activeJobs.map((job) => (
              <div key={job.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    {KIND_LABELS[job.kind]}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="Отменить задачу"
                    onClick={() => cancel.mutate(job.id)}
                  >
                    <XCircle className="size-3.5" />
                  </Button>
                </div>
                <Progress value={job.progressPct} className="h-1.5" />
                <p className="text-muted-foreground text-xs">{STAGE_LABELS[job.stage]}</p>
              </div>
            ))
          )}

          {recentJobs.length > 0 ? (
            <div className="border-border space-y-2 border-t pt-3">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{KIND_LABELS[job.kind]}</span>
                  <JobStatusBadge job={job} />
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function JobStatusBadge({ job }: { job: GenerationJob }) {
  if (job.status === "succeeded") return <Badge variant="secondary">Готово</Badge>;
  if (job.status === "failed") return <Badge variant="destructive">Ошибка</Badge>;
  return <Badge variant="outline">Отменено</Badge>;
}
