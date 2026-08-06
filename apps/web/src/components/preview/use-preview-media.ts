"use client";

import { useEffect, useState } from "react";
import {
  ASPECT_RATIO_VALUES,
  primaryImage,
  type Clip,
  type ProjectDocument,
} from "@avatar/contracts";
import { dataClient } from "@/lib/data";
import { getAssetBlob } from "@/lib/data/uploads";

export type PreviewMedia = {
  images: Map<string, HTMLImageElement>;
  audio: Map<string, HTMLAudioElement>;
  /** Клипы, для которых файла нет: превью рисует на их месте заглушку. */
  missing: Set<string>;
};

const EMPTY: PreviewMedia = { images: new Map(), audio: new Map(), missing: new Set() };

/**
 * Медиа для отрисовки кадра. Элементы создаются один раз на документ: заводить
 * Image и Audio внутри цикла отрисовки — значит пересоздавать их 60 раз в
 * секунду и не дождаться ни одной загрузки.
 *
 * Для клипа аватара берётся его референсная фотография: настоящего
 * сгенерированного видео на первом этапе нет, и подделывать его нельзя, а
 * показать реальное лицо в нужной позиции кадра — можно.
 */
export function usePreviewMedia(document: ProjectDocument | null): PreviewMedia {
  const [media, setMedia] = useState<PreviewMedia>(EMPTY);

  // Пересобираем только когда меняется набор источников, а не на каждую правку
  // позиции клипа.
  const signature = document
    ? Object.values(document.clips)
        .map((clip) => `${clip.id}:${sourceKey(clip, document)}`)
        .sort()
        .join("|")
    : "";

  useEffect(() => {
    if (!document) return;

    let cancelled = false;
    const urls: string[] = [];

    const build = async () => {
      const images = new Map<string, HTMLImageElement>();
      const audio = new Map<string, HTMLAudioElement>();
      const missing = new Set<string>();

      const avatars = await dataClient.avatars.list();

      for (const clip of Object.values(document.clips)) {
        let assetId: string | null = null;

        if (clip.kind === "avatar") {
          const scene = document.scenes[clip.sceneId];
          const avatar = avatars.find((item) => item.id === scene?.avatarId) ?? null;
          assetId = avatar ? (primaryImage(avatar)?.assetId ?? null) : null;
        } else if ("assetId" in clip) {
          assetId = clip.assetId;
        }

        if (!assetId) {
          if (clip.kind !== "text" && clip.kind !== "subtitle") missing.add(clip.id);
          continue;
        }

        const blob = await getAssetBlob(assetId);
        if (!blob) {
          missing.add(clip.id);
          continue;
        }

        const url = URL.createObjectURL(blob);
        urls.push(url);

        if (blob.type.startsWith("audio/")) {
          const element = new Audio(url);
          element.preload = "auto";
          audio.set(clip.id, element);
        } else if (blob.type.startsWith("image/")) {
          const element = new Image();
          element.src = url;
          await element.decode().catch(() => undefined);
          images.set(clip.id, element);
        } else {
          missing.add(clip.id);
        }
      }

      if (!cancelled) setMedia({ images, audio, missing });
    };

    void build();

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пересборка привязана к набору источников, а не к объекту документа
  }, [signature]);

  return media;
}

function sourceKey(clip: Clip, document: ProjectDocument): string {
  if (clip.kind === "avatar") return document.scenes[clip.sceneId]?.avatarId ?? "none";
  return "assetId" in clip ? clip.assetId : clip.kind;
}

/** Размер кадра в пикселях холста под соотношение сторон проекта. */
export function canvasSize(aspectRatio: keyof typeof ASPECT_RATIO_VALUES, width: number) {
  return { width, height: Math.round(width / ASPECT_RATIO_VALUES[aspectRatio]) };
}
