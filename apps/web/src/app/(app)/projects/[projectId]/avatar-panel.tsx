"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Circle,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Palette,
  Square,
  Upload,
} from "lucide-react";
import {
  type AvatarClip,
  type AvatarStyle,
} from "@avatar/contracts";
import { useEditorStore } from "@/lib/editor/store";
import { uploadFile } from "@/lib/data/uploads";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  projectId,
  clip,
}: {
  projectId: string;
  clip: AvatarClip | null;
}) {
  const apply = useEditorStore((state) => state.apply);

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

  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Файл сохраняется и сразу назначается фоном: отдельный шаг «выбрать
      // загруженное» здесь лишний — картинку загружают именно ради этой сцены.
      const asset = await uploadFile({ file, kind: "media", projectId });
      return asset.id;
    },
    onSuccess: (assetId) => patchBackground({ kind: "image", assetId }),
  });

  const style = clip?.style ?? null;

  return (
    <div className="space-y-5">
      {clip === null ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed p-3 text-sm">
          Оформление кадра появится после первой генерации: клип аватара создаётся вместе с
          результатом.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <Label>Фон аватара</Label>
            {/* Плитки вместо кнопок с подписями: в узкой колонке подписи
                переносились и занимали по три строки на вариант, а разобрать
                четыре способа проще по значкам. Название остаётся в подсказке
                и в озвучиваемой метке. */}
            <div className="flex flex-wrap gap-2">
              <BackgroundTile
                label="Исходный фон"
                active={style?.background.kind === "original"}
                onClick={() => patchBackground({ kind: "original" })}
              >
                <ImageIcon className="size-4" />
              </BackgroundTile>

              <BackgroundTile
                label="Убрать фон"
                active={style?.background.kind === "remove"}
                onClick={() => patchBackground({ kind: "remove" })}
              >
                <Eraser className="size-4" />
              </BackgroundTile>

              <BackgroundTile
                label="Однотонный фон"
                active={style?.background.kind === "color"}
                onClick={() => patchBackground({ kind: "color" })}
                style={
                  style?.background.kind === "color"
                    ? { backgroundColor: style.background.color }
                    : undefined
                }
              >
                <Palette
                  className={cn(
                    "size-4",
                    style?.background.kind === "color" && "text-white mix-blend-difference",
                  )}
                />
              </BackgroundTile>

              <BackgroundUploadTile
                active={style?.background.kind === "image"}
                assetId={style?.background.assetId ?? null}
                busy={upload.isPending}
                onSelect={(file) => upload.mutate(file)}
              />
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
              <p className="text-muted-foreground text-xs">
                Отделение фигуры от фона выполняет модель на сервере. В предпросмотре фон
                показывается как есть.
              </p>
            ) : null}

            {upload.error ? (
              <p className="text-destructive text-xs">{upload.error.message}</p>
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

/** Квадратная плитка выбора фона: значок вместо подписи, название — в подсказке. */
function BackgroundTile({
  label,
  active,
  onClick,
  style,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={style}
      className={cn(
        "flex size-16 shrink-0 items-center justify-center rounded-lg border transition-colors",
        active ? "border-ring ring-ring/30 ring-2" : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Плитка загрузки фона. Показывает саму картинку, когда она выбрана: миниатюра
 * отвечает на вопрос «что сейчас стоит фоном» лучше любой подписи.
 */
function BackgroundUploadTile({
  active,
  assetId,
  busy,
  onSelect,
}: {
  active: boolean;
  assetId: string | null;
  busy: boolean;
  onSelect: (file: File) => void;
}) {
  const url = useAssetUrl(active ? assetId : null);

  return (
    <label
      title="Своё изображение"
      className={cn(
        "relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border transition-colors",
        active ? "border-ring ring-ring/30 ring-2" : "border-border hover:bg-muted",
      )}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Upload className="size-4" />
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Загрузить изображение для фона"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = "";
        }}
      />
    </label>
  );
}
