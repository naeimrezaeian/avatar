"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Captions, Clapperboard, Download, Loader2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Короткая подсказка о том, что делать со сценой дальше.
 *
 * Состояния «устарело» здесь нет намеренно: предупреждение о том, что входные
 * данные изменились после генерации, убрано из этой колонки. Признак остаётся
 * у сцены в сценарии — значком рядом с её названием.
 */
const STATE_HINTS: Partial<
  Record<string, { text: string; tone: "muted" | "success" }>
> = {
  empty: { text: "Добавьте текст в сценарии, чтобы озвучить сцену", tone: "muted" },
  needs_voiceover: { text: "Озвучьте реплику кнопкой в сценарии", tone: "muted" },
  needs_video: { text: "Озвучка готова — можно генерировать видео", tone: "muted" },
  ready: { text: "Сцена сгенерирована полностью", tone: "success" },
};

/**
 * Постановка кадра и действия над сценой.
 *
 * Всё, что запускает работу, собрано в одной колонке: раньше промпт и смета
 * жили по центру, а экспорт и субтитры — в шапке, и путь «написал — озвучил —
 * снял — собрал» приходилось искать по всему экрану.
 */
export function SceneActions({
  projectId,
  scene,
  avatar,
  activeJobs,
  projectDurationSec,
  onChangePrompt,
  onSubtitles,
  onExport,
}: {
  projectId: string;
  scene: Scene;
  avatar: Avatar | null;
  activeJobs: GenerationJob[];
  projectDurationSec: number;
  onChangePrompt: (prompt: string) => void;
  onSubtitles: () => void;
  onExport: () => void;
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
  const videoCostSec = estimateCostSeconds(scene.durationSec ?? estimatedSec, "720p");

  const tooShort = estimatedSec > 0 && estimatedSec < SCENE_MIN_DURATION_SEC;
  const tooLong = estimatedSec > SCENE_MAX_DURATION_SEC;

  const videoJob = activeJobs.find((job) => job.kind === "avatar_video");

  const startVideo = useMutation({
    mutationFn: () => dataClient.generation.startVideo({ projectId, sceneId: scene.id }),
  });

  const hint = STATE_HINTS[state] ?? null;
  const available = account.data
    ? account.data.balanceSeconds - account.data.reservedSeconds
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Label htmlFor="scene-prompt">Промпт для видео</Label>
        <Textarea
          id="scene-prompt"
          value={scene.prompt}
          onChange={(event) => onChangePrompt(event.target.value)}
          placeholder="Поза, жесты, план, поведение в паузах"
          rows={8}
          className="min-h-40"
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

      {hint ? (
        <p className={hint.tone === "success" ? "text-success text-sm" : "text-muted-foreground text-sm"}>
          {hint.text}
        </p>
      ) : null}

      <div className="border-border space-y-3 border-t pt-4">
        <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>Стоимость сцены</span>
          <span className="text-foreground font-medium tabular-nums">
            {secondsToMinutesLabel(videoCostSec)} из {secondsToMinutesLabel(available)} мин
          </span>
        </div>

        <Button
          onClick={() => startVideo.mutate()}
          disabled={
            scene.voiceoverAssetId === null ||
            avatar?.status !== "ready" ||
            videoJob !== undefined ||
            startVideo.isPending
          }
          className="bg-gradient-accent w-full text-white hover:opacity-90"
        >
          {videoJob ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Clapperboard className="size-4" />
          )}
          {videoJob ? `Генерация ${videoJob.progressPct}%` : "Сгенерировать видео"}
        </Button>

        <Button
          variant="secondary"
          onClick={onSubtitles}
          disabled={scene.durationSec === null}
          title={
            scene.durationSec === null
              ? "Сначала озвучьте реплику: без озвучки неизвестно время слов"
              : undefined
          }
          className="w-full"
        >
          <Captions className="size-4" />
          Субтитры сцены
        </Button>

        <Button
          variant="secondary"
          onClick={onExport}
          disabled={projectDurationSec === 0}
          title={
            projectDurationSec === 0 ? "Собирать нечего: на шкале нет клипов" : undefined
          }
          className="w-full"
        >
          <Download className="size-4" />
          Экспорт проекта
        </Button>

        <p className="text-muted-foreground text-xs">
          Озвучка запускается кнопкой рядом с текстом в сценарии и не тарифицируется: послушайте
          реплику до того, как тратить кредиты на видео.
        </p>

        {startVideo.error ? (
          <p className="text-destructive text-sm">
            {startVideo.error instanceof InsufficientCreditsError
              ? `Недостаточно кредитов: нужно ${secondsToMinutesLabel(startVideo.error.requiredSeconds)} мин, доступно ${secondsToMinutesLabel(startVideo.error.availableSeconds)} мин`
              : startVideo.error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
