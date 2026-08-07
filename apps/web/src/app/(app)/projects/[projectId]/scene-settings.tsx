"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clapperboard, Loader2 } from "lucide-react";
import {
  SCENE_MAX_DURATION_SEC,
  SCENE_MIN_DURATION_SEC,
  estimateCostSeconds,
  estimateSpeechDurationSec,
  sceneGenerationState,
  secondsToMinutesLabel,
  videoInputHash,
  voiceoverInputHash,
  type Avatar,
  type GenerationJob,
  type Scene,
} from "@avatar/contracts";
import { InsufficientCreditsError, dataClient, queryKeys } from "@/lib/data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATE_HINTS: Record<string, { text: string; tone: "muted" | "warning" | "success" }> = {
  empty: { text: "Добавьте текст, чтобы озвучить сцену", tone: "muted" },
  needs_voiceover: { text: "Текст готов — можно синтезировать озвучку", tone: "muted" },
  needs_video: { text: "Озвучка готова — можно генерировать видео", tone: "muted" },
  outdated: { text: "Входные данные изменились после генерации", tone: "warning" },
  ready: { text: "Сцена сгенерирована полностью", tone: "success" },
};

/**
 * Настройки выбранной сцены: постановка кадра, речь, смета и запуск.
 *
 * Сам текст реплики правится в сценарии слева и здесь не дублируется — иначе
 * два поля с одним содержимым расходились бы на глазах у пользователя.
 */
export function SceneSettings({
  projectId,
  scene,
  avatar,
  onChange,
  activeJobs,
}: {
  projectId: string;
  scene: Scene;
  avatar: Avatar | null;
  onChange: (patch: Partial<Scene>) => void;
  activeJobs: GenerationJob[];
}) {
  const account = useQuery({
    queryKey: queryKeys.creditAccount,
    queryFn: () => dataClient.credits.getAccount("usr_demo"),
  });

  // Состояние выводится из хэшей текущих входных данных: хранить его нельзя, оно
  // разъезжалось бы с текстом при каждом нажатии клавиши.
  const state = sceneGenerationState(
    scene,
    voiceoverInputHash({
      voiceId: scene.voiceId,
      scriptText: scene.scriptText,
      speech: scene.speech,
    }),
    videoInputHash({
      avatarId: scene.avatarId,
      referenceAssetId: scene.avatarId,
      prompt: scene.prompt,
      voiceoverAssetId: scene.voiceoverAssetId ?? "",
    }),
  );

  const estimatedSec = estimateSpeechDurationSec(scene.scriptText, scene.speech);
  const plannedSec = scene.durationSec ?? estimatedSec;
  const videoCostSec = estimateCostSeconds(plannedSec, "720p");

  const tooShort = estimatedSec > 0 && estimatedSec < SCENE_MIN_DURATION_SEC;
  const tooLong = estimatedSec > SCENE_MAX_DURATION_SEC;

  const videoJob = activeJobs.find((job) => job.kind === "avatar_video");

  const startVideo = useMutation({
    mutationFn: () => dataClient.generation.startVideo({ projectId, sceneId: scene.id }),
  });

  const hint = STATE_HINTS[state]!;
  const error = startVideo.error;

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Label htmlFor="scene-title">Название сцены</Label>
        <Input
          id="scene-title"
          value={scene.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Например: вступление"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="scene-prompt">Промпт для видео</Label>
        <Textarea
          id="scene-prompt"
          value={scene.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          placeholder="Поза, жесты, план, поведение в паузах"
          rows={2}
        />
        <p className="text-muted-foreground text-xs">
          Промпт управляет тем, что происходит между репликами. Саму речь задаёт текст сценария.
        </p>
      </div>

      {tooShort ? (
        <p className="text-warning text-xs">
          Меньше {SCENE_MIN_DURATION_SEC} с — модель не примет такую сцену, добавьте текста.
        </p>
      ) : null}
      {tooLong ? (
        <p className="text-warning text-xs">
          Больше {SCENE_MAX_DURATION_SEC / 60} минут — разбейте на несколько сцен.
        </p>
      ) : null}

      {state === "outdated" ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>
            {hint.text}. Перегенерируйте, иначе в сборку попадёт старый результат.
          </AlertDescription>
        </Alert>
      ) : (
        <p
          className={
            hint.tone === "success"
              ? "text-success text-sm"
              : hint.tone === "warning"
                ? "text-warning text-sm"
                : "text-muted-foreground text-sm"
          }
        >
          {hint.text}
        </p>
      )}

      <div className="border-border space-y-3 border-t pt-4">
        <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>Стоимость генерации видео</span>
          <span className="text-foreground font-medium tabular-nums">
            {secondsToMinutesLabel(videoCostSec)} мин
            {account.data
              ? ` из ${secondsToMinutesLabel(account.data.balanceSeconds - account.data.reservedSeconds)}`
              : ""}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => startVideo.mutate()}
            disabled={
              scene.voiceoverAssetId === null ||
              avatar?.status !== "ready" ||
              videoJob !== undefined ||
              startVideo.isPending
            }
            className="bg-gradient-accent text-white hover:opacity-90"
          >
            {videoJob ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Clapperboard className="size-4" />
            )}
            {videoJob ? `Видео ${videoJob.progressPct}%` : "Сгенерировать видео"}
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          Озвучка запускается кнопкой рядом с текстом в сценарии и не тарифицируется: послушайте
          реплику до того, как тратить кредиты на видео.
        </p>

        {error ? (
          <p className="text-destructive text-sm">
            {error instanceof InsufficientCreditsError
              ? `Недостаточно кредитов: нужно ${secondsToMinutesLabel(error.requiredSeconds)} мин, доступно ${secondsToMinutesLabel(error.availableSeconds)} мин`
              : error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
