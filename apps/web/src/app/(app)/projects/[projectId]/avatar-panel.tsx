"use client";

import { useQuery } from "@tanstack/react-query";
import { Circle, Square } from "lucide-react";
import {
  type AvatarClip,
  type AvatarStyle,
  type Scene,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useEditorStore } from "@/lib/editor/store";
import { Label } from "@/components/ui/label";
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
 * Оформление кадра для выбранной сцены: фон, форма, скругление, приближение.
 *
 * Настройки живут на клипе, а не на аватаре: один и тот же аватар в разных
 * сценах вставляют по-разному — в одной крупно по центру, в другой кружком в
 * углу. Сам аватар и голос здесь не выбираются: они заданы при создании
 * проекта, а модель генерации назначает администратор, и подменять её в
 * проекте пользователь не может.
 */
export function AvatarPanel({
  scene,
  clip,
  sceneIndex,
}: {
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
  const avatar = avatars.data?.find((item) => item.id === scene.avatarId) ?? null;
  const voice = voices.data?.find((item) => item.id === scene.voiceId) ?? null;

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

  const style = clip?.style ?? null;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-semibold">Оформление кадра</p>
        <p className="text-muted-foreground text-xs">
          Сцена {sceneIndex + 1}
          {avatar ? ` · ${avatar.name}` : ""}
          {voice ? ` · ${voice.name}` : ""}
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
