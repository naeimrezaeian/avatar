"use client";

import { useRef } from "react";
import { Lock } from "lucide-react";
import {
  clipEndSec,
  isDurationLocked,
  type Asset,
  type Clip,
  type TrackKind,
} from "@avatar/contracts";
import { useEditorStore } from "@/lib/editor/store";
import { collectSnapPoints, moveClip, snap, trimClip } from "@/lib/editor/operations";
import { cn } from "@/lib/utils";

/** Насколько близко к точке притяжения нужно подвести край, в пикселях. */
const SNAP_THRESHOLD_PX = 8;
/** Ширина зоны захвата края для обрезки. */
const TRIM_HANDLE_PX = 8;

const TRACK_COLOR: Record<TrackKind, string> = {
  video: "bg-track-video",
  avatar: "bg-track-avatar",
  image: "bg-track-image",
  text: "bg-track-text",
  voiceover: "bg-track-voiceover",
  music: "bg-track-music",
  sfx: "bg-track-sfx",
  subtitle: "bg-track-subtitle",
};

type Mode = "move" | "trim-start" | "trim-end";

export function ClipView({
  clip,
  trackKind,
  label,
  asset,
  laneRef,
}: {
  clip: Clip;
  trackKind: TrackKind;
  label: string;
  asset: Asset | null;
  /** Дорожка нужна, чтобы переводить координаты указателя в секунды. */
  laneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const pixelsPerSecond = useEditorStore((state) => state.pixelsPerSecond);
  const selected = useEditorStore((state) => state.selectedClipIds.includes(clip.id));
  const apply = useEditorStore((state) => state.apply);
  const select = useEditorStore((state) => state.select);

  const dragRef = useRef<{ mode: Mode; grabOffsetSec: number } | null>(null);

  const locked = isDurationLocked(clip);
  const width = Math.max(2, clip.durationSec * pixelsPerSecond);
  const left = clip.startSec * pixelsPerSecond;

  const pointerSeconds = (event: React.PointerEvent | PointerEvent): number => {
    const lane = laneRef.current;
    if (!lane) return 0;
    const rect = lane.getBoundingClientRect();
    return Math.max(0, (event.clientX - rect.left + lane.scrollLeft) / pixelsPerSecond);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;

    // Края отведены под обрезку, середина — под перенос. У клипов с
    // фиксированной длительностью края не активны.
    const mode: Mode =
      !locked && offsetX < TRIM_HANDLE_PX
        ? "trim-start"
        : !locked && offsetX > rect.width - TRIM_HANDLE_PX
          ? "trim-end"
          : "move";

    dragRef.current = { mode, grabOffsetSec: pointerSeconds(event) - clip.startSec };
    select([clip.id]);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const seconds = pointerSeconds(event);
    const state = useEditorStore.getState();
    const document = state.document;
    if (!document) return;

    const points = collectSnapPoints(document, {
      playheadSec: state.playheadSec,
      exceptClipId: clip.id,
    });
    const threshold = SNAP_THRESHOLD_PX / pixelsPerSecond;

    if (drag.mode === "move") {
      const desired = seconds - drag.grabOffsetSec;
      // Притягиваем и начало, и конец: клип должен вставать вплотную к соседу
      // любой своей стороной.
      const snappedStart = snap(desired, points, threshold);
      const snappedEnd = snap(desired + clip.durationSec, points, threshold) - clip.durationSec;
      const start =
        Math.abs(snappedStart - desired) <= Math.abs(snappedEnd - desired)
          ? snappedStart
          : snappedEnd;

      apply((draft) => moveClip(draft, clip.id, start), {
        label: "Перемещение клипа",
        coalesceKey: `move:${clip.id}`,
      });
      return;
    }

    const edge = drag.mode === "trim-start" ? "start" : "end";
    apply((draft) => trimClip(draft, clip.id, edge, snap(seconds, points, threshold)), {
      label: "Обрезка клипа",
      coalesceKey: `${drag.mode}:${clip.id}`,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}, с ${clip.startSec.toFixed(1)} по ${clipEndSec(clip).toFixed(1)} секунду`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ left, width }}
      className={cn(
        "group absolute top-1 bottom-1 overflow-hidden rounded-md text-white select-none",
        TRACK_COLOR[trackKind],
        locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        selected ? "ring-ring ring-2 ring-offset-1" : "",
      )}
    >
      {asset?.waveformPeaks && asset.waveformPeaks.length > 0 ? (
        <Waveform peaks={asset.waveformPeaks} />
      ) : null}

      <span className="pointer-events-none absolute inset-x-1.5 top-1 flex items-center gap-1 truncate text-[11px] font-medium">
        {locked ? <Lock className="size-2.5 shrink-0 opacity-80" /> : null}
        <span className="truncate">{label}</span>
      </span>

      {!locked ? (
        <>
          <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/25" />
          <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/25" />
        </>
      ) : null}
    </div>
  );
}

/**
 * Огибающая рисуется из заранее посчитанных пиков (см. uploads.ts). Точное
 * число столбиков не важно — важно, чтобы форма звука была узнаваема при
 * любом масштабе, поэтому пики растягиваются по ширине клипа.
 */
function Waveform({ peaks }: { peaks: number[] }) {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full opacity-70"
      viewBox={`0 0 ${peaks.length} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {peaks.map((peak, index) => (
        <rect
          key={index}
          x={index}
          y={100 - peak * 100}
          width={1}
          height={Math.max(1, peak * 100)}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
