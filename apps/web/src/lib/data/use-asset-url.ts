"use client";

import { useEffect, useState } from "react";
import { getAssetBlob } from "./uploads";

/**
 * Ссылка на локально сохранённый файл. Object URL держит блоб в памяти, пока
 * его не отозвать, поэтому отзыв идёт в очистке эффекта — без этого каждая
 * перерисовка списка ассетов подтекала бы мегабайтами.
 */
export function useAssetUrl(assetId: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ assetId: string; url: string } | null>(null);

  useEffect(() => {
    if (!assetId) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    void getAssetBlob(assetId).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ assetId, url: objectUrl });
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  // Ссылка отдаётся только для текущего ассета. Сбрасывать состояние в эффекте
  // не нужно: при смене id прошлый object URL уже отозван, и сравнение здесь
  // не даёт вернуть мёртвую ссылку.
  return resolved !== null && resolved.assetId === assetId ? resolved.url : null;
}
