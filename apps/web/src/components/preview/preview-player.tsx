"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack } from "lucide-react";
import {
  ASPECT_RATIO_VALUES,
  clipEndSec,
  type AvatarStyle,
  type Clip,
  type ProjectDocument,
} from "@avatar/contracts";
import { useEditorStore } from "@/lib/editor/store";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { usePreviewMedia, type PreviewMedia } from "./use-preview-media";

/** Ширина внутреннего холста. Кадр рисуется в этих координатах и масштабируется CSS. */
const CANVAS_WIDTH = 960;

/** Как часто позиция уезжает в общее состояние. */
const STORE_SYNC_MS = 100;

/**
 * Превью композиции.
 *
 * Все дорожки ведут одни часы: у каждого элемента `<video>`/`<audio>` своё
 * представление о времени, и если позволить им идти самостоятельно, звук и
 * картинка разъедутся уже через несколько секунд. Поэтому время считает цикл
 * отрисовки, а медиаэлементы к нему подстраиваются.
 *
 * Превью — приближение, а не WYSIWYG: итоговый ролик собирается на сервере,
 * и совпадать они будут по композиции, но не по попиксельной картинке.
 */
export function PreviewPlayer({ document }: { document: ProjectDocument }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);

  const playheadSec = useEditorStore((state) => state.playheadSec);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);

  const media = usePreviewMedia(document);

  const durationSec = Object.values(document.clips).reduce(
    (max, clip) => Math.max(max, clipEndSec(clip)),
    0,
  );

  // Часы живут в ref: перерисовывать React 60 раз в секунду ради счётчика
  // времени незачем, холст рисуется напрямую.
  const clockRef = useRef(playheadSec);
  const playingRef = useRef(false);

  // Внешняя перемотка (клик по шкале) должна догонять часы, пока стоим на паузе.
  useEffect(() => {
    if (!playingRef.current) clockRef.current = playheadSec;
  }, [playheadSec]);

  const stopMedia = useCallback((current: PreviewMedia) => {
    current.audio.forEach((element) => element.pause());
    current.videos.forEach((element) => element.pause());
  }, []);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) stopMedia(media);
  }, [playing, media, stopMedia]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let previous = performance.now();
    let lastSync = 0;

    const tick = (now: number) => {
      const deltaSec = (now - previous) / 1000;
      previous = now;

      if (playingRef.current) {
        clockRef.current += deltaSec;
        if (clockRef.current >= durationSec) {
          clockRef.current = durationSec;
          playingRef.current = false;
          setPlaying(false);
        }
        if (now - lastSync > STORE_SYNC_MS) {
          lastSync = now;
          setPlayhead(clockRef.current);
        }
      }

      drawFrame(context, canvas, document, media, clockRef.current);
      syncAudio(document, media, clockRef.current, playingRef.current);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [document, media, durationSec, setPlayhead]);

  const height = Math.round(CANVAS_WIDTH / ASPECT_RATIO_VALUES[document.aspectRatio]);

  return (
    <div className="space-y-3">
      <div className="bg-muted mx-auto w-full max-w-160 overflow-hidden rounded-xl">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={height}
          className="block h-auto w-full"
        />
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="В начало"
          onClick={() => {
            clockRef.current = 0;
            setPlayhead(0);
          }}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          size="icon"
          onClick={() => setPlaying((value) => !value)}
          disabled={durationSec === 0}
          aria-label={playing ? "Пауза" : "Воспроизвести"}
          className="bg-gradient-accent text-white hover:opacity-90"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatDuration(playheadSec)} / {formatDuration(durationSec)}
        </span>
      </div>

      <p className="text-muted-foreground text-center text-xs">
        Предпросмотр упрощённый: итоговый ролик собирается на сервере и совпадёт по композиции,
        но не по точности картинки.
      </p>
    </div>
  );
}

function activeClips(document: ProjectDocument, timeSec: number): Clip[] {
  return document.trackOrder.flatMap((trackId) => {
    const track = document.tracks[trackId];
    if (!track || track.hidden) return [];
    return Object.values(document.clips).filter(
      (clip) =>
        clip.trackId === trackId && clip.startSec <= timeSec && clipEndSec(clip) > timeSec,
    );
  });
}

function drawFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  document: ProjectDocument,
  media: PreviewMedia,
  timeSec: number,
): void {
  const { width, height } = canvas;
  // Кадр остаётся тёмным независимо от темы интерфейса: это поле видео, а не
  // поверхность приложения, и светлая подложка искажала бы восприятие цвета
  // будущего ролика.
  context.fillStyle = "#0d1017";
  context.fillRect(0, 0, width, height);

  for (const clip of activeClips(document, timeSec)) {
    if (clip.kind === "audio" || clip.kind === "subtitle") continue;

    if (clip.kind === "text") {
      drawText(context, width, height, clip);
      continue;
    }

    if (clip.kind === "video") {
      const video = media.videos.get(clip.id);
      // Кадр берётся у <video> тем же drawImage: холст принимает его наравне с
      // картинкой, и отдельная ветка отрисовки для видео не нужна.
      if (video && video.readyState >= 2) {
        drawImage(context, width, height, video, clip.transform, null);
      } else {
        drawPlaceholder(context, width, height, clip);
      }
      continue;
    }

    const image = media.images.get(clip.id);
    if (!image) {
      drawPlaceholder(context, width, height, clip);
      continue;
    }

    if (clip.kind === "image") {
      drawFitted(context, width, height, image, clip.fitMode, clip.transform.opacity);
      continue;
    }

    drawImage(
      context,
      width,
      height,
      image,
      "transform" in clip ? clip.transform : null,
      clip.kind === "avatar" ? clip.style : null,
    );
  }
}

/**
 * Изображение на дорожке фона.
 *
 * Ему нужны правила вписывания, а не якорь и масштаб: подложку либо растягивают
 * на весь кадр, либо показывают целиком. Клип аватара рисуется иначе — там
 * важно положение фигуры, а не заполнение кадра.
 */
function drawFitted(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement,
  fitMode: "contain" | "cover" | "fill",
  opacity: number,
): void {
  const ratio = image.width / image.height;
  const frameRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;

  if (fitMode === "contain") {
    if (ratio > frameRatio) drawHeight = width / ratio;
    else drawWidth = height * ratio;
  } else if (fitMode === "cover") {
    if (ratio > frameRatio) drawWidth = height * ratio;
    else drawHeight = width / ratio;
  }

  context.globalAlpha = opacity;
  context.save();
  // «Заполнить» выходит за кадр — лишнее обрезается рамкой, а не рисуется
  // поверх соседних областей холста.
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  context.restore();
  context.globalAlpha = 1;
}

function drawImage(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement | HTMLVideoElement,
  transform: { anchor: string; offsetXRatio: number; offsetYRatio: number; scale: number; opacity: number } | null,
  style: AvatarStyle | null,
): void {
  // Подложка рисуется до фигуры: сплошной цвет заменяет фон кадра, а «убрать
  // фон» без модели сегментации честно показывается тем же способом — иначе
  // предпросмотр обещал бы вырезание, которого здесь нет.
  if (style && style.background.kind === "color") {
    context.fillStyle = style.background.color;
    context.fillRect(0, 0, width, height);
  }

  const zoom = style ? style.zoomPct / 100 : 1;
  const scale = (transform?.scale ?? 1) * zoom;
  // Вписываем по высоте кадра — так лицо остаётся целиком видимым в любом
  // соотношении сторон.
  const drawHeight = height * scale;
  // У <video> собственный размер лежит в videoWidth/videoHeight: width и height
  // там — это размеры элемента на странице, а он в разметке не участвует.
  const sourceWidth = "videoWidth" in image ? image.videoWidth : image.width;
  const sourceHeight = "videoHeight" in image ? image.videoHeight : image.height;
  const drawWidth = (sourceWidth / sourceHeight) * drawHeight;

  const anchorX =
    transform?.anchor === "left"
      ? drawWidth / 2
      : transform?.anchor === "right"
        ? width - drawWidth / 2
        : width / 2;

  const x = anchorX + (transform?.offsetXRatio ?? 0) * width - drawWidth / 2;
  const y = height / 2 + (transform?.offsetYRatio ?? 0) * height - drawHeight / 2;

  context.globalAlpha = transform?.opacity ?? 1;
  context.save();

  // Исходный кадр не обрезается вовсе; обрезанный скругляется на заданную
  // величину — вплоть до полной окружности. Радиус задан в пикселях кадра
  // 1080p и пересчитывается под холст, иначе скругление менялось бы вместе с
  // масштабом предпросмотра.
  if (style && style.shape === "circle") {
    const radius = Math.min(
      (style.cornerRadiusPx / 1080) * height,
      Math.min(drawWidth, drawHeight) / 2,
    );

    context.beginPath();
    context.roundRect(x, y, drawWidth, drawHeight, radius);
    context.clip();
  }

  context.drawImage(image, x, y, drawWidth, drawHeight);
  context.restore();
  context.globalAlpha = 1;
}

/** Отступ подложки надписи от букв, долей кегля. */
const TEXT_PADDING_RATIO = 0.3;

function drawText(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: Extract<Clip, { kind: "text" }>,
): void {
  const text = clip.text.trim();
  if (text.length === 0) return;

  const { style, transform } = clip;
  const size = Math.round(height * style.fontSizeRatio);

  context.font = `${style.fontWeight} ${size}px Inter, sans-serif`;
  context.textAlign = style.align;
  context.textBaseline = "middle";

  // Ноль по вертикали — центр кадра: смещение задаётся долей высоты и остаётся
  // верным в любом соотношении сторон.
  const y = height / 2 + transform.offsetYRatio * height;
  const x =
    style.align === "left"
      ? width * 0.06
      : style.align === "right"
        ? width * 0.94
        : width / 2;

  if (style.backgroundColor !== null) {
    const metrics = context.measureText(text);
    const padding = size * TEXT_PADDING_RATIO;
    const boxWidth = metrics.width + padding * 2;
    const boxX =
      style.align === "left" ? x - padding : style.align === "right" ? x - boxWidth + padding : x - boxWidth / 2;

    context.fillStyle = style.backgroundColor;
    context.fillRect(boxX, y - size / 2 - padding / 2, boxWidth, size + padding);
  }

  if (style.shadow) {
    context.shadowColor = "rgba(0,0,0,0.6)";
    context.shadowBlur = size / 4;
  }

  context.fillStyle = style.color;
  context.fillText(text, x, y);

  context.shadowBlur = 0;
  context.textBaseline = "alphabetic";
}

/**
 * Заглушка вместо отсутствующего файла. Показывать пустой кадр нельзя: он
 * читается как «ничего не получилось», хотя на деле сгенерированного видео на
 * этом этапе просто не существует.
 */
function drawPlaceholder(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: Clip,
): void {
  context.strokeStyle = "rgba(255,255,255,0.25)";
  context.setLineDash([8, 8]);
  context.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);
  context.setLineDash([]);

  context.font = `500 ${Math.round(height * 0.045)}px Inter, sans-serif`;
  context.fillStyle = "rgba(255,255,255,0.65)";
  context.textAlign = "center";
  context.fillText(
    clip.kind === "avatar" ? "Видео аватара появится после генерации" : "Файл недоступен",
    width / 2,
    height / 2,
  );
}

/**
 * Медиаэлементы подтягиваются к часам. Рассинхрон больше четверти секунды
 * исправляется перемоткой: мелкие расхождения на слух незаметны, а постоянная
 * перемотка сама по себе даёт щелчки.
 */
const MAX_DRIFT_SEC = 0.25;

/**
 * Громкость клипа с учётом нарастания и затухания.
 *
 * Считается на каждом кадре, а не задаётся один раз: `volume` у элемента —
 * одно число, кривой громкости у него нет, и плавность получается только тем,
 * что число пересчитывается вместе с часами.
 */
function clipGain(clip: Extract<Clip, { audio: unknown }>, timeSec: number): number {
  const audio = clip.audio as { volumePct: number; fadeInSec: number; fadeOutSec: number };
  const base = Math.min(1, audio.volumePct / 100);

  const local = timeSec - clip.startSec;
  const remaining = clipEndSec(clip) - timeSec;

  const fadeIn = audio.fadeInSec > 0 ? Math.min(1, local / audio.fadeInSec) : 1;
  const fadeOut = audio.fadeOutSec > 0 ? Math.min(1, remaining / audio.fadeOutSec) : 1;

  return Math.max(0, base * Math.min(fadeIn, fadeOut));
}

function syncAudio(
  document: ProjectDocument,
  media: PreviewMedia,
  timeSec: number,
  playing: boolean,
): void {
  const sync = (element: HTMLMediaElement, clipId: string, videoTrack: boolean) => {
    const clip = document.clips[clipId];
    if (!clip) return;

    const track = document.tracks[clip.trackId];
    const active = clip.startSec <= timeSec && clipEndSec(clip) > timeSec;
    const muted = track?.muted === true || ("audio" in clip && clip.audio.muted);

    // Видео за пределами клипа тоже останавливается, но время ему выставляется
    // и на паузе: иначе на холсте застыл бы кадр из другого места ролика.
    if (!active || !playing || (muted && !videoTrack)) {
      if (!element.paused) element.pause();
      if (!videoTrack) return;
    }

    const target = clip.sourceInSec + (timeSec - clip.startSec);
    if (Math.abs(element.currentTime - target) > MAX_DRIFT_SEC) {
      element.currentTime = Math.max(0, target);
    }

    element.muted = muted;
    element.volume = "audio" in clip ? clipGain(clip, timeSec) : 1;

    if (active && playing && element.paused) {
      void element.play().catch(() => undefined);
    }
  };

  media.audio.forEach((element, clipId) => sync(element, clipId, false));
  media.videos.forEach((element, clipId) => sync(element, clipId, true));
}
