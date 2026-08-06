"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, AudioLines, Clapperboard, Loader2 } from "lucide-react";
import {
  MODEL_VERSIONS,
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
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATE_HINTS: Record<string, { text: string; tone: "muted" | "warning" | "success" }> = {
  empty: { text: "Добавьте текст, чтобы озвучить сцену", tone: "muted" },
  needs_voiceover: { text: "Текст готов — можно синтезировать озвучку", tone: "muted" },
  needs_video: { text: "Озвучка готова — можно генерировать видео", tone: "muted" },
  outdated: {
    text: "Входные данные изменились после генерации: результат устарел",
    tone: "warning",
  },
  ready: { text: "Сцена сгенерирована полностью", tone: "success" },
};

export function SceneEditor({
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

  const voiceoverUrl = useAssetUrl(scene.voiceoverAssetId);

  // Состояние выводится из хэшей текущих входных данных: хранить его нельзя,
  // оно разъезжалось бы с текстом при каждом нажатии клавиши.
  const currentVoiceoverHash = voiceoverInputHash({
    voiceId: scene.voiceId,
    scriptText: scene.scriptText,
    speech: scene.speech,
  });
  const currentVideoHash = videoInputHash({
    avatarId: scene.avatarId,
    referenceAssetId: scene.avatarId,
    prompt: scene.prompt,
    voiceoverAssetId: scene.voiceoverAssetId ?? "",
  });
  const state = sceneGenerationState(scene, currentVoiceoverHash, currentVideoHash);

  const estimatedSec = estimateSpeechDurationSec(scene.scriptText, scene.speech);
  const plannedSec = scene.durationSec ?? estimatedSec;
  const videoCostSec = estimateCostSeconds(plannedSec, "720p");

  const tooShort = estimatedSec > 0 && estimatedSec < SCENE_MIN_DURATION_SEC;
  const tooLong = estimatedSec > SCENE_MAX_DURATION_SEC;

  const voiceoverJob = activeJobs.find((job) => job.kind === "tts");
  const videoJob = activeJobs.find((job) => job.kind === "avatar_video");

  const startVoiceover = useMutation({
    mutationFn: () => dataClient.generation.startVoiceover({ projectId, sceneId: scene.id }),
  });
  const startVideo = useMutation({
    mutationFn: () => dataClient.generation.startVideo({ projectId, sceneId: scene.id }),
  });

  const hint = STATE_HINTS[state]!;
  const error = startVoiceover.error ?? startVideo.error;

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
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="scene-script">Текст для озвучивания</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {scene.scriptText.length} знаков · ≈{estimatedSec.toFixed(1)} с
          </span>
        </div>
        <Textarea
          id="scene-script"
          value={scene.scriptText}
          onChange={(event) => onChange({ scriptText: event.target.value })}
          placeholder="То, что аватар произнесёт в этой сцене"
          rows={6}
        />
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
          Промпт управляет тем, что происходит между репликами. Саму речь задаёт текст выше.
        </p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Параметры речи</legend>
        <SpeechSlider
          label="Скорость"
          value={scene.speech.speedPct}
          min={50}
          max={200}
          suffix="%"
          onChange={(speedPct) => onChange({ speech: { ...scene.speech, speedPct } })}
        />
        <SpeechSlider
          label="Тон"
          value={scene.speech.pitchSemitones}
          min={-12}
          max={12}
          suffix=" пт"
          onChange={(pitchSemitones) => onChange({ speech: { ...scene.speech, pitchSemitones } })}
        />
        <SpeechSlider
          label="Громкость"
          value={scene.speech.volumePct}
          min={0}
          max={200}
          suffix="%"
          onChange={(volumePct) => onChange({ speech: { ...scene.speech, volumePct } })}
        />
      </fieldset>

      {state === "outdated" ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>{hint.text}. Перегенерируйте, иначе в сборку попадёт старый результат.</AlertDescription>
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

      {voiceoverUrl ? (
        <div className="space-y-1.5">
          <Label>Озвучка</Label>
          <audio controls src={voiceoverUrl} className="w-full" preload="metadata" />
        </div>
      ) : null}

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
            variant="secondary"
            onClick={() => startVoiceover.mutate()}
            disabled={
              scene.scriptText.trim().length === 0 ||
              tooShort ||
              tooLong ||
              voiceoverJob !== undefined ||
              startVoiceover.isPending
            }
          >
            {voiceoverJob ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <AudioLines className="size-4" />
            )}
            {voiceoverJob ? `Озвучка ${voiceoverJob.progressPct}%` : "Синтезировать озвучку"}
          </Button>

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
          Озвучка не тарифицируется: проверьте текст на слух до того, как тратить кредиты на видео.
          Модель: {MODEL_VERSIONS.avatarVideo}.
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

function SpeechSlider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="flex items-baseline justify-between">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary w-full"
      />
    </label>
  );
}
