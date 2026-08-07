"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Circle, Clapperboard, Loader2, Square } from "lucide-react";
import {
  MODEL_VERSIONS,
  type AvatarClip,
  type AvatarStyle,
  type Scene,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useEditorStore } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const BACKGROUND_OPTIONS: Array<{
  kind: AvatarStyle["background"]["kind"];
  label: string;
  hint: string;
}> = [
  { kind: "original", label: "Исходный", hint: "Фон с фотографии" },
  { kind: "color", label: "Цвет", hint: "Однотонная подложка" },
  { kind: "remove", label: "Убрать", hint: "Требует модели на сервере" },
];

/**
 * Подложки для кадра аватара. Это цвет внутри видео, а не элемент интерфейса,
 * поэтому набор шире палитры платформы: нужны и светлые фоны для деловых
 * роликов, и тёмные для контраста со светлой одеждой. Первые два — фирменные.
 */
const PRESET_COLORS = [
  "#5068e8",
  "#15b8a6",
  "#172033",
  "#f4f7fb",
  "#ffffff",
  "#e3e8f0",
  "#7c2d12",
  "#4c1d95",
];

/**
 * Настройки аватара для выбранной сцены. Живут на клипе, а не на аватаре: один
 * и тот же аватар в разных сценах вставляют по-разному — в одной крупно по
 * центру, в другой кружком в углу.
 */
export function AvatarPanel({
  projectId,
  scene,
  clip,
  sceneIndex,
}: {
  projectId: string;
  scene: Scene;
  clip: AvatarClip | null;
  sceneIndex: number;
}) {
  const apply = useEditorStore((state) => state.apply);

  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const voices = useQuery({ queryKey: queryKeys.voices, queryFn: () => dataClient.voices.list() });
  const jobs = useQuery({
    queryKey: queryKeys.jobs(projectId),
    queryFn: () => dataClient.jobs.list({ projectId }),
  });

  const avatar = avatars.data?.find((item) => item.id === scene.avatarId) ?? null;
  const voice = voices.data?.find((item) => item.id === scene.voiceId) ?? null;

  const activeJob = (jobs.data ?? []).find(
    (job) => job.sceneId === scene.id && (job.status === "queued" || job.status === "running"),
  );

  const render = useMutation({
    mutationFn: async () => {
      // Сцена рендерится в два шага, и порядок нарушать нельзя: видео строится
      // из озвучки. Если её ещё нет — начинаем с неё.
      if (scene.voiceoverAssetId === null) {
        return dataClient.generation.startVoiceover({ projectId, sceneId: scene.id });
      }
      return dataClient.generation.startVideo({ projectId, sceneId: scene.id });
    },
  });

  const patchStyle = (patch: Partial<AvatarStyle>) => {
    if (!clip) return;
    apply(
      (draft) => {
        const target = draft.clips[clip.id];
        if (target?.kind !== "avatar") return;
        Object.assign(target.style, patch);
      },
      { label: "Оформление аватара", coalesceKey: `style:${clip.id}` },
    );
  };

  const patchBackground = (patch: Partial<AvatarStyle["background"]>) => {
    if (!clip) return;
    apply(
      (draft) => {
        const target = draft.clips[clip.id];
        if (target?.kind !== "avatar") return;
        Object.assign(target.style.background, patch);
      },
      { label: "Фон аватара", coalesceKey: `bg:${clip.id}` },
    );
  };

  const patchScene = (patch: Partial<Scene>) => {
    apply(
      (draft) => {
        const target = draft.scenes[scene.id];
        if (target) Object.assign(target, patch);
      },
      { label: "Аватар сцены" },
    );
  };

  const style = clip?.style ?? null;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-semibold">Аватар и голос</p>
        <p className="text-muted-foreground text-xs">Сцена {sceneIndex + 1}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="studio-avatar">Аватар</Label>
        <Select
          items={Object.fromEntries(
            (avatars.data ?? []).map((item) => [item.id, item.name]),
          )}
          value={scene.avatarId}
          onValueChange={(value) => {
            if (!value) return;
            const next = avatars.data?.find((item) => item.id === value);
            // Голос тянется за аватаром: чужой голос на чужом лице — почти
            // всегда ошибка, а не намерение.
            patchScene({ avatarId: value, voiceId: next?.voiceId ?? scene.voiceId });
          }}
        >
          <SelectTrigger id="studio-avatar">
            <SelectValue placeholder={avatar?.name ?? "Выберите аватар"} />
          </SelectTrigger>
          <SelectContent>
            {(avatars.data ?? [])
              .filter((item) => item.status === "ready")
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="studio-voice">Голос</Label>
        <Select
          items={Object.fromEntries((voices.data ?? []).map((item) => [item.id, item.name]))}
          value={scene.voiceId}
          onValueChange={(value) => value && patchScene({ voiceId: value })}
        >
          <SelectTrigger id="studio-voice">
            <SelectValue placeholder={voice?.name ?? "Выберите голос"} />
          </SelectTrigger>
          <SelectContent>
            {(voices.data ?? [])
              .filter((item) => item.status === "ready")
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Модель генерации</Label>
        <div className="border-border bg-muted/40 rounded-lg border px-3 py-2 text-sm">
          {MODEL_VERSIONS.avatarVideo}
        </div>
        <p className="text-muted-foreground text-xs">
          Выбор из нескольких моделей появится, когда их будет больше одной.
        </p>
      </div>

      {clip === null ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed p-3 text-sm">
          Оформление кадра появится после первой генерации: клип аватара создаётся вместе с
          результатом.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <Label>Фон аватара</Label>
            <div className="grid grid-cols-3 gap-2">
              {BACKGROUND_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => patchBackground({ kind: option.kind })}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-center transition-colors",
                    style?.background.kind === option.kind
                      ? "border-ring bg-accent/40"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="text-muted-foreground block text-xs">{option.hint}</span>
                </button>
              ))}
            </div>

            {style?.background.kind === "color" ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Цвет ${color}`}
                    onClick={() => patchBackground({ color })}
                    style={{ backgroundColor: color }}
                    className={cn(
                      "size-7 rounded-full border transition-transform",
                      style.background.color === color
                        ? "ring-ring scale-110 ring-2"
                        : "border-border",
                    )}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Свой цвет"
                  value={style.background.color}
                  onChange={(event) => patchBackground({ color: event.target.value })}
                  className="border-border h-7 w-10 cursor-pointer rounded border bg-transparent"
                />
              </div>
            ) : null}

            {style?.background.kind === "remove" ? (
              <p className="text-warning text-xs">
                Отделение фигуры от фона выполняет модель сегментации на сервере. В
                предпросмотре фон показывается как есть.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Форма кадра</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["original", "circle"] as const).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => patchStyle({ shape })}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border py-2 text-sm transition-colors",
                    style?.shape === shape
                      ? "border-ring bg-accent/40 font-medium"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  {shape === "circle" ? <Circle className="size-4" /> : <Square className="size-4" />}
                  {shape === "circle" ? "Круг" : "Исходная"}
                </button>
              ))}
            </div>
          </div>

          <StyleSlider
            label="Скругление"
            value={style?.cornerRadiusPx ?? 0}
            min={0}
            max={400}
            suffix=" px"
            disabled={style?.shape === "circle"}
            hint={style?.shape === "circle" ? "У круга скругление максимально" : undefined}
            onChange={(cornerRadiusPx) => patchStyle({ cornerRadiusPx })}
          />

          <StyleSlider
            label="Приближение"
            value={style?.zoomPct ?? 100}
            min={50}
            max={300}
            suffix=" %"
            onChange={(zoomPct) => patchStyle({ zoomPct })}
          />
        </>
      )}

      <div className="border-border border-t pt-4">
        <Button
          onClick={() => render.mutate()}
          disabled={
            scene.scriptText.trim().length === 0 || activeJob !== undefined || render.isPending
          }
          className="bg-gradient-accent w-full text-white hover:opacity-90"
        >
          {activeJob || render.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Clapperboard className="size-4" />
          )}
          {activeJob
            ? `Идёт генерация ${activeJob.progressPct}%`
            : scene.voiceoverAssetId === null
              ? "Синтезировать озвучку"
              : "Отрендерить сцену"}
        </Button>

        {render.error ? (
          <p className="text-destructive mt-2 text-sm">{render.error.message}</p>
        ) : null}
      </div>
    </div>
  );
}

function StyleSlider({
  label,
  value,
  min,
  max,
  suffix,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  disabled?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="text-muted-foreground text-sm tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary w-full disabled:opacity-40"
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
