"use client";

import { Trash2 } from "lucide-react";
import {
  isDurationLocked,
  type Clip,
  type ProjectDocument,
} from "@avatar/contracts";
import { useEditorStore } from "@/lib/editor/store";
import { removeClips, trimClip } from "@/lib/editor/operations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RangeField } from "@/components/ui/range-field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Настройки выбранного клипа.
 *
 * Живут под шкалой, а не в боковой колонке: правят то, что только что выделили
 * мышью, и переводить взгляд через весь экран после каждого клика не нужно.
 * Панель появляется только когда выделен ровно один клип — у группы общих
 * настроек нет, а показывать пустую панель постоянно значит занимать место
 * ничем.
 */
export function ClipInspector({ document }: { document: ProjectDocument }) {
  const selectedClipIds = useEditorStore((state) => state.selectedClipIds);
  const select = useEditorStore((state) => state.select);
  const apply = useEditorStore((state) => state.apply);

  if (selectedClipIds.length !== 1) return null;
  const clip = document.clips[selectedClipIds[0]!];
  if (!clip) return null;

  const patch = (label: string, mutate: (draft: ProjectDocument) => void) =>
    apply(mutate, { label });

  const remove = () => {
    apply((draft) => removeClips(draft, [clip.id]), { label: "Удаление клипа" });
    select([]);
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{title(clip, document)}</p>
          <span className="text-muted-foreground text-xs">
            {document.tracks[clip.trackId]?.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            className="text-destructive ml-auto"
          >
            <Trash2 className="size-3.5" />
            Удалить
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SecondsField
            label="Начало"
            value={clip.startSec}
            onChange={(value) =>
              patch("Начало клипа", (draft) => {
                const target = draft.clips[clip.id];
                if (target) target.startSec = Math.max(0, value);
              })
            }
          />

          <SecondsField
            label="Длительность"
            value={clip.durationSec}
            // Длительность клипа аватара задана озвучкой: видео порождено из неё,
            // и растягивание рассинхронизировало бы губы со звуком.
            disabled={isDurationLocked(clip)}
            hint={isDurationLocked(clip) ? "Задана длительностью озвучки" : undefined}
            onChange={(value) =>
              patch("Длительность клипа", (draft) =>
                trimClip(draft, clip.id, "end", clip.startSec + value),
              )
            }
          />

          {clip.kind === "image" ? (
            <div className="grid gap-2">
              <Label>Вписывание</Label>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ["cover", "Заполнить"],
                    ["contain", "Целиком"],
                    ["fill", "Растянуть"],
                  ] as const
                ).map(([mode, caption]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      patch("Вписывание изображения", (draft) => {
                        const target = draft.clips[clip.id];
                        if (target?.kind === "image") target.fitMode = mode;
                      })
                    }
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                      clip.fitMode === mode
                        ? "border-ring bg-accent/50"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {caption}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {"audio" in clip ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <RangeField
              label="Громкость"
              value={clip.audio.volumePct}
              min={0}
              max={200}
              unit="%"
              onChange={(volumePct) =>
                patch("Громкость клипа", (draft) => {
                  const target = draft.clips[clip.id];
                  if (target && "audio" in target) target.audio.volumePct = volumePct;
                })
              }
            />
            <RangeField
              label="Нарастание"
              value={clip.audio.fadeInSec}
              min={0}
              max={10}
              step={0.1}
              unit="с"
              onChange={(fadeInSec) =>
                patch("Нарастание звука", (draft) => {
                  const target = draft.clips[clip.id];
                  if (target && "audio" in target) target.audio.fadeInSec = fadeInSec;
                })
              }
            />
            <RangeField
              label="Затухание"
              value={clip.audio.fadeOutSec}
              min={0}
              max={10}
              step={0.1}
              unit="с"
              onChange={(fadeOutSec) =>
                patch("Затухание звука", (draft) => {
                  const target = draft.clips[clip.id];
                  if (target && "audio" in target) target.audio.fadeOutSec = fadeOutSec;
                })
              }
            />
          </div>
        ) : null}

        {clip.kind === "text" ? <TextClipFields clip={clip} patch={patch} /> : null}
      </CardContent>
    </Card>
  );
}

function TextClipFields({
  clip,
  patch,
}: {
  clip: Extract<Clip, { kind: "text" }>;
  patch: (label: string, mutate: (draft: ProjectDocument) => void) => void;
}) {
  const setStyle = (label: string, mutate: (style: Extract<Clip, { kind: "text" }>["style"]) => void) =>
    patch(label, (draft) => {
      const target = draft.clips[clip.id];
      if (target?.kind === "text") mutate(target.style);
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="clip-text">Текст надписи</Label>
        <Textarea
          id="clip-text"
          value={clip.text}
          rows={2}
          maxLength={500}
          onChange={(event) =>
            patch("Текст надписи", (draft) => {
              const target = draft.clips[clip.id];
              if (target?.kind === "text") target.text = event.target.value;
            })
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RangeField
          label="Размер"
          // Кегль задан долей высоты кадра, а не пикселями: проект собирается и
          // в 720p, и в 1080p, и пиксельный размер менялся бы вместе с ними.
          value={Math.round(clip.style.fontSizeRatio * 100)}
          min={2}
          max={30}
          unit="%"
          onChange={(value) =>
            setStyle("Размер надписи", (style) => {
              style.fontSizeRatio = value / 100;
            })
          }
        />

        <div className="grid gap-2">
          <Label htmlFor="clip-text-color">Цвет</Label>
          <div className="flex items-center gap-2">
            <Input
              id="clip-text-color"
              type="color"
              value={clip.style.color}
              onChange={(event) =>
                setStyle("Цвет надписи", (style) => {
                  style.color = event.target.value;
                })
              }
              className="h-9 w-14 cursor-pointer p-1"
            />
            <button
              type="button"
              onClick={() =>
                setStyle("Подложка надписи", (style) => {
                  style.backgroundColor = style.backgroundColor === null ? "#000000" : null;
                })
              }
              className={cn(
                "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                clip.style.backgroundColor !== null
                  ? "border-ring bg-accent/50"
                  : "border-border hover:bg-muted",
              )}
            >
              Подложка
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Выравнивание</Label>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                ["left", "Слева"],
                ["center", "По центру"],
                ["right", "Справа"],
              ] as const
            ).map(([align, caption]) => (
              <button
                key={align}
                type="button"
                onClick={() =>
                  setStyle("Выравнивание надписи", (style) => {
                    style.align = align;
                  })
                }
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                  clip.style.align === align
                    ? "border-ring bg-accent/50"
                    : "border-border hover:bg-muted",
                )}
              >
                {caption}
              </button>
            ))}
          </div>
        </div>

        <RangeField
          label="Положение по вертикали"
          // Ноль — центр кадра, поэтому шкала идёт от минус половины до плюс.
          value={Math.round(clip.transform.offsetYRatio * 100)}
          min={-50}
          max={50}
          unit="%"
          onChange={(value) =>
            patch("Положение надписи", (draft) => {
              const target = draft.clips[clip.id];
              if (target?.kind === "text") target.transform.offsetYRatio = value / 100;
            })
          }
        />
      </div>
    </div>
  );
}

function SecondsField({
  label,
  value,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step={0.1}
          value={Math.round(value * 10) / 10}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className="w-24 tabular-nums"
        />
        <span className="text-muted-foreground text-xs">с</span>
      </div>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function title(clip: Clip, document: ProjectDocument): string {
  switch (clip.kind) {
    case "avatar":
      return `Аватар · ${document.scenes[clip.sceneId]?.title || "сцена"}`;
    case "audio":
      return clip.sceneId
        ? `Озвучка · ${document.scenes[clip.sceneId]?.title || "сцена"}`
        : "Аудио";
    case "image":
      return "Изображение";
    case "video":
      return "Видео";
    case "text":
      return "Надпись";
    case "subtitle":
      return "Субтитры";
  }
}
