"use client";

import { useRef, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Redo2,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clipEndSec,
  type Clip,
  type ProjectDocument,
  type Track,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  selectCanRedo,
  selectCanUndo,
  useEditorStore,
} from "@/lib/editor/store";
import {
  ADDABLE_TRACKS,
  addMediaClip,
  addTextClip,
  addTrack,
  duplicateClips,
  removeClips,
} from "@/lib/editor/operations";
import { UploadValidationError, uploadFile, validateFile } from "@/lib/data/uploads";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipView } from "./clip-view";

const TRACK_HEIGHT = 56;

/**
 * Ширина колонки с названиями дорожек. На телефоне она урезана: 172 px от 390
 * не оставляют места самой шкале, а название дорожки и там, и там читается —
 * просто короче.
 */
const HEADER_WIDTH = 172;
const HEADER_WIDTH_NARROW = 104;

export function Timeline({ document }: { document: ProjectDocument }) {
  const laneRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [addError, setAddError] = useState<string | null>(null);
  const [uploadingTrackId, setUploadingTrackId] = useState<string | null>(null);

  const pixelsPerSecond = useEditorStore((state) => state.pixelsPerSecond);
  const setPixelsPerSecond = useEditorStore((state) => state.setPixelsPerSecond);
  const playheadSec = useEditorStore((state) => state.playheadSec);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const selectedClipIds = useEditorStore((state) => state.selectedClipIds);
  const select = useEditorStore((state) => state.select);
  const apply = useEditorStore((state) => state.apply);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);

  const assets = useQuery({
    queryKey: queryKeys.assets(document.projectId),
    queryFn: () => dataClient.assets.list({ projectId: document.projectId }),
  });

  const durationSec = Object.values(document.clips).reduce(
    (max, clip) => Math.max(max, clipEndSec(clip)),
    0,
  );
  // Запас справа, чтобы клип можно было перетащить за текущий конец проекта.
  const canvasSec = Math.max(30, durationSec + 15);
  const canvasWidth = canvasSec * pixelsPerSecond;

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    setPlayhead((event.clientX - rect.left + lane.scrollLeft) / pixelsPerSecond);
  };

  const removeSelected = () => {
    if (selectedClipIds.length === 0) return;
    apply((draft) => removeClips(draft, selectedClipIds), { label: "Удаление клипов" });
    select([]);
  };

  /**
   * Материал ложится на дорожку в один шаг: выбрал файл — увидел клип.
   *
   * Отдельной медиатеки для этого нет намеренно: она означала бы «загрузите
   * сюда, потом найдите там, потом перетащите» — три шага вместо одного ради
   * склада, который на этом этапе всё равно пуст.
   */
  const addMedia = async (track: Track, file: File) => {
    setAddError(null);
    setUploadingTrackId(track.id);
    try {
      validateFile(file, "media");
      const asset = await uploadFile({ file, kind: "media", projectId: document.projectId });

      let created: string | null = null;
      apply(
        (draft) => {
          created = addMediaClip(draft, {
            trackId: track.id,
            kind: asset.kind === "audio" ? "audio" : asset.kind === "video" ? "video" : "image",
            assetId: asset.id,
            durationSec: asset.durationSec,
            startSec: playheadSec,
          });
        },
        { label: "Добавление материала" },
      );

      await queryClient.invalidateQueries({ queryKey: queryKeys.assets(document.projectId) });
      if (created) select([created]);
    } catch (error) {
      setAddError(
        error instanceof UploadValidationError || error instanceof Error
          ? error.message
          : "Не удалось добавить файл на дорожку",
      );
    } finally {
      setUploadingTrackId(null);
    }
  };

  const addText = (track: Track) => {
    setAddError(null);
    let created: string | null = null;
    apply(
      (draft) => {
        created = addTextClip(draft, { trackId: track.id, startSec: playheadSec });
      },
      { label: "Добавление надписи" },
    );
    if (created) select([created]);
  };

  const duplicateSelected = () => {
    if (selectedClipIds.length === 0) return;
    let created: string[] = [];
    apply(
      (draft) => {
        created = duplicateClips(draft, selectedClipIds);
      },
      { label: "Копирование клипов" },
    );
    select(created);
  };

  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-soft">
      <div className="border-border flex flex-wrap items-center gap-1 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Отменить"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Повторить"
        >
          <Redo2 className="size-4" />
        </Button>

        <span className="bg-border mx-1 h-5 w-px" />

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={duplicateSelected}
          disabled={selectedClipIds.length === 0}
          aria-label="Копировать клип"
        >
          <Copy className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={removeSelected}
          disabled={selectedClipIds.length === 0}
          aria-label="Удалить клип"
        >
          <Trash2 className="size-4" />
        </Button>

        <span className="bg-border mx-1 h-5 w-px" />

        {/* Дорожки заводятся по требованию: проект начинается с четырёх, а
            титры и звуки нужны не в каждом ролике. */}
        {ADDABLE_TRACKS.filter(
          (preset) => !document.trackOrder.some((id) => document.tracks[id]?.kind === preset.kind),
        ).map((preset) => (
          <Button
            key={preset.kind}
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() =>
              apply((draft) => void addTrack(draft, preset.kind), {
                label: `Дорожка «${preset.name}»`,
              })
            }
          >
            <Plus className="size-3.5" />
            {preset.name}
          </Button>
        ))}

        <span className="text-muted-foreground ml-2 text-xs tabular-nums">
          {formatDuration(playheadSec)} / {formatDuration(durationSec)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setPixelsPerSecond(pixelsPerSecond / 1.5)}
            disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
            aria-label="Уменьшить масштаб"
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setPixelsPerSecond(pixelsPerSecond * 1.5)}
            disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
            aria-label="Увеличить масштаб"
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>

      {addError ? (
        <p className="text-destructive border-border border-b px-3 py-2 text-xs">{addError}</p>
      ) : null}

      <div className="flex">
        <div
          className="border-border w-[var(--track-header-narrow)] shrink-0 border-r sm:w-[var(--track-header)]"
          style={
            {
              "--track-header": `${HEADER_WIDTH}px`,
              "--track-header-narrow": `${HEADER_WIDTH_NARROW}px`,
            } as React.CSSProperties
          }
        >
          <div className="border-border h-7 border-b" />
          {document.trackOrder.map((trackId) => {
            const track = document.tracks[trackId];
            if (!track) return null;
            return (
              <TrackHeader
                key={trackId}
                track={track}
                busy={uploadingTrackId === trackId}
                onAddMedia={(file) => void addMedia(track, file)}
                onAddText={() => addText(track)}
              />
            );
          })}
        </div>

        <div
          ref={laneRef}
          className="relative flex-1 overflow-x-auto"
          onPointerDown={(event) => {
            // Клик по пустому месту снимает выделение и переносит курсор:
            // так же ведут себя привычные редакторы.
            select([]);
            seekFromPointer(event);
          }}
        >
          <div style={{ width: canvasWidth }} className="relative">
            <Ruler canvasSec={canvasSec} pixelsPerSecond={pixelsPerSecond} />

            {document.trackOrder.map((trackId) => {
              const track = document.tracks[trackId];
              if (!track) return null;
              const clips = Object.values(document.clips).filter(
                (clip) => clip.trackId === trackId,
              );

              return (
                <div
                  key={trackId}
                  className="border-border/60 relative border-b"
                  style={{ height: TRACK_HEIGHT }}
                >
                  {clips.map((clip) => (
                    <ClipView
                      key={clip.id}
                      clip={clip}
                      trackKind={track.kind}
                      label={clipLabel(clip, document)}
                      asset={
                        "assetId" in clip
                          ? (assets.data?.find((item) => item.id === clip.assetId) ?? null)
                          : null
                      }
                      laneRef={laneRef}
                    />
                  ))}
                </div>
              );
            })}

            <div
              className="bg-destructive pointer-events-none absolute top-0 bottom-0 w-px"
              style={{ left: playheadSec * pixelsPerSecond }}
            >
              <span className="bg-destructive absolute -top-0.5 -left-1 size-2.5 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function clipLabel(clip: Clip, document: ProjectDocument): string {
  if (clip.kind === "avatar") {
    return document.scenes[clip.sceneId]?.title || "Аватар";
  }
  if (clip.kind === "text") return clip.text || "Надпись";
  if (clip.kind === "subtitle") return "Субтитры";
  if (clip.kind === "audio" && clip.sceneId !== null) {
    return `Озвучка: ${document.scenes[clip.sceneId]?.title || "сцена"}`;
  }
  return clip.kind === "audio" ? "Аудио" : clip.kind === "video" ? "Видео" : "Изображение";
}

/**
 * Что можно положить на дорожку руками.
 *
 * Дорожки аватара, озвучки и субтитров сюда не входят: их содержимое порождает
 * генерация, и класть туда файл вручную значило бы разойтись с текстом сцены.
 */
const MANUAL_ACCEPT: Partial<Record<Track["kind"], string>> = {
  video: "video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp",
  image: "image/jpeg,image/png,image/webp",
  music: "audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/webm",
  sfx: "audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/webm",
};

function TrackHeader({
  track,
  busy,
  onAddMedia,
  onAddText,
}: {
  track: Track;
  busy: boolean;
  onAddMedia: (file: File) => void;
  onAddText: () => void;
}) {
  const apply = useEditorStore((state) => state.apply);

  const toggle = (field: "muted" | "hidden") => {
    apply(
      (draft) => {
        const target = draft.tracks[track.id];
        if (target) target[field] = !target[field];
      },
      { label: field === "muted" ? "Звук дорожки" : "Видимость дорожки", skipHistory: true },
    );
  };

  const audio = ["voiceover", "music", "sfx"].includes(track.kind);
  const accept = MANUAL_ACCEPT[track.kind];

  return (
    <div
      className="border-border/60 flex items-center gap-1 border-b px-2"
      style={{ height: TRACK_HEIGHT }}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{track.name}</span>

      {track.kind === "text" ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={onAddText}
          aria-label={`Добавить надпись на дорожку «${track.name}»`}
          title="Добавить надпись"
        >
          <Type className="size-3.5" />
        </Button>
      ) : accept ? (
        <label
          title="Добавить файл"
          aria-label={`Добавить файл на дорожку «${track.name}»`}
          className="hover:bg-accent flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          <input
            type="file"
            accept={accept}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Значение сбрасывается, иначе повторный выбор того же файла не
              // вызовет события и кнопка будет выглядеть сломанной.
              event.target.value = "";
              if (file) onAddMedia(file);
            }}
          />
        </label>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={() => toggle(audio ? "muted" : "hidden")}
        aria-label={audio ? "Заглушить дорожку" : "Скрыть дорожку"}
      >
        {audio ? (
          track.muted ? (
            <VolumeX className="size-3.5" />
          ) : (
            <Volume2 className="size-3.5" />
          )
        ) : track.hidden ? (
          <EyeOff className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

/**
 * Шаг делений подбирается под масштаб: на мелком масштабе подписи каждую
 * секунду сливаются в кашу, на крупном — редкие деления не дают ориентира.
 */
function tickStepSec(pixelsPerSecond: number): number {
  for (const step of [1, 2, 5, 10, 15, 30, 60, 120, 300]) {
    if (step * pixelsPerSecond >= 60) return step;
  }
  return 600;
}

function Ruler({
  canvasSec,
  pixelsPerSecond,
}: {
  canvasSec: number;
  pixelsPerSecond: number;
}) {
  const step = tickStepSec(pixelsPerSecond);
  const ticks: number[] = [];
  for (let second = 0; second <= canvasSec; second += step) ticks.push(second);

  return (
    <div className="border-border bg-muted/40 relative h-7 border-b">
      {ticks.map((second) => (
        <span
          key={second}
          className="text-muted-foreground absolute top-0 flex h-full items-center pl-1 text-[11px] tabular-nums"
          style={{ left: second * pixelsPerSecond }}
        >
          <span className={cn("bg-border absolute top-0 left-0 h-2 w-px")} />
          {formatDuration(second)}
        </span>
      ))}
    </div>
  );
}
