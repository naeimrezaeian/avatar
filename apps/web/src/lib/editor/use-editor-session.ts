"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectDocument } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useEditorStore } from "./store";

/** Пауза между последней правкой и записью. */
const AUTOSAVE_DELAY_MS = 800;

/**
 * Загрузка документа в редактор и автосохранение.
 *
 * Сохранение отложенное: набор текста в надписи давал бы запись на каждый
 * символ. Сохраняется вся текущая версия документа, а не накопленные патчи, —
 * поток патчей появится вместе с настоящим API, здесь важнее, что запись идёт
 * от известной ревизии и конфликт нельзя проглотить.
 */
export function useEditorSession(projectId: string) {
  const queryClient = useQueryClient();
  const load = useEditorStore((state) => state.load);
  const markSaved = useEditorStore((state) => state.markSaved);
  const document = useEditorStore((state) => state.document);
  const dirty = useEditorStore((state) => state.dirty);

  const query = useQuery({
    queryKey: queryKeys.document(projectId),
    queryFn: () => dataClient.documents.get(projectId),
    // Документ — источник истины редактора; повторные фоновые запросы затирали
    // бы несохранённые правки.
    staleTime: Infinity,
    refetchOnMount: false,
  });

  const loadedProjectRef = useRef<string | null>(null);
  // Ошибка сохранения именно в состоянии, а не в ref: индикатор должен
  // перерисоваться, когда запись отклонена, — из ref он бы её не увидел.
  const [saveError, setSaveError] = useState<Error | null>(null);

  useEffect(() => {
    if (!query.data) return;
    if (loadedProjectRef.current === projectId) return;
    loadedProjectRef.current = projectId;
    load(query.data);
  }, [projectId, query.data, load]);

  useEffect(() => {
    if (!dirty || !document) return;

    const timer = setTimeout(() => {
      const current = useEditorStore.getState().document;
      if (!current) return;

      void dataClient.documents
        .save(current, current.revision)
        .then((saved: ProjectDocument) => {
          setSaveError(null);
          markSaved(saved.revision);
          queryClient.setQueryData(queryKeys.document(projectId), saved);
          void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        })
        .catch((error: Error) => {
          setSaveError(error);
        });
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [dirty, document, markSaved, projectId, queryClient]);

  return {
    isPending: query.isPending,
    notFound: query.isSuccess && query.data === null,
    saveError,
  };
}

/** Ctrl/Cmd+Z и Shift+Ctrl/Cmd+Z. */
export function useUndoShortcuts(): void {
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;

      // В полях ввода за отмену отвечает браузер: перехват сломал бы откат
      // набранного текста.
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);
}
