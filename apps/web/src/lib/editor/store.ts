"use client";

import { create } from "zustand";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import type { ProjectDocument } from "@avatar/contracts";

enablePatches();

/**
 * Один шаг истории. Хранятся именно патчи, а не снимки документа: снимок сцены
 * с десятками клипов весит килобайты, и глубокая история из снимков съедала бы
 * память тем быстрее, чем активнее правят проект. Патч же описывает ровно
 * изменившиеся поля — он же уходит в автосохранение.
 */
type HistoryEntry = {
  patches: Patch[];
  inverse: Patch[];
  /** Ключ склейки: подряд идущие шаги с одним ключом объединяются в один. */
  coalesceKey: string | null;
  label: string;
};

const HISTORY_LIMIT = 200;

export type ApplyOptions = {
  label: string;
  /**
   * Перетаскивание генерирует десятки изменений в секунду. Без склейки одно
   * движение мышью занимало бы всю историю, и Ctrl+Z откатывал бы клип на
   * пиксель. Ключ должен быть уникален для операции: "move:<clipId>".
   */
  coalesceKey?: string;
  /** Изменения вида «выделили клип» в историю не попадают. */
  skipHistory?: boolean;
};

type EditorState = {
  document: ProjectDocument | null;
  /** Ревизия, до которой документ сохранён. Отстаёт от локальной при правках. */
  savedRevision: number;
  dirty: boolean;

  past: HistoryEntry[];
  future: HistoryEntry[];

  selectedClipIds: string[];
  playheadSec: number;
  pixelsPerSecond: number;

  load: (document: ProjectDocument) => void;
  apply: (recipe: (draft: ProjectDocument) => void, options: ApplyOptions) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (revision: number) => void;

  select: (clipIds: string[]) => void;
  toggleSelection: (clipId: string) => void;
  setPlayhead: (seconds: number) => void;
  setPixelsPerSecond: (value: number) => void;
};

export const MIN_PIXELS_PER_SECOND = 8;
export const MAX_PIXELS_PER_SECOND = 240;

export const useEditorStore = create<EditorState>((set, get) => ({
  document: null,
  savedRevision: 0,
  dirty: false,
  past: [],
  future: [],
  selectedClipIds: [],
  playheadSec: 0,
  pixelsPerSecond: 40,

  load: (document) =>
    set({
      document,
      savedRevision: document.revision,
      dirty: false,
      // История принадлежит открытому документу: переносить её на другой
      // проект — значит позволить откатить чужие правки.
      past: [],
      future: [],
      selectedClipIds: [],
      playheadSec: 0,
    }),

  apply: (recipe, options) => {
    const state = get();
    if (!state.document) return;

    const [next, patches, inverse] = produceWithPatches(state.document, recipe);
    if (patches.length === 0) return;

    if (options.skipHistory) {
      set({ document: next, dirty: true });
      return;
    }

    const last = state.past.at(-1);
    const canCoalesce =
      options.coalesceKey !== undefined &&
      last !== undefined &&
      last.coalesceKey === options.coalesceKey;

    const entry: HistoryEntry = canCoalesce
      ? {
          // Прямые патчи дописываются в конец, обратные — в начало: откат
          // должен идти в порядке, обратном применению.
          patches: [...last.patches, ...patches],
          inverse: [...inverse, ...last.inverse],
          coalesceKey: options.coalesceKey ?? null,
          label: last.label,
        }
      : {
          patches,
          inverse,
          coalesceKey: options.coalesceKey ?? null,
          label: options.label,
        };

    const past = canCoalesce ? [...state.past.slice(0, -1), entry] : [...state.past, entry];

    set({
      document: next,
      dirty: true,
      past: past.slice(-HISTORY_LIMIT),
      // Новое действие обрывает ветку повтора — как в любом редакторе.
      future: [],
    });
  },

  undo: () => {
    const state = get();
    const entry = state.past.at(-1);
    if (!entry || !state.document) return;

    set({
      document: applyPatches(state.document, entry.inverse),
      past: state.past.slice(0, -1),
      future: [entry, ...state.future],
      dirty: true,
    });
  },

  redo: () => {
    const state = get();
    const [entry, ...rest] = state.future;
    if (!entry || !state.document) return;

    set({
      document: applyPatches(state.document, entry.patches),
      past: [...state.past, entry],
      future: rest,
      dirty: true,
    });
  },

  markSaved: (revision) =>
    set((state) => ({
      savedRevision: revision,
      dirty: false,
      document: state.document ? { ...state.document, revision } : null,
    })),

  select: (selectedClipIds) => set({ selectedClipIds }),

  toggleSelection: (clipId) =>
    set((state) => ({
      selectedClipIds: state.selectedClipIds.includes(clipId)
        ? state.selectedClipIds.filter((id) => id !== clipId)
        : [...state.selectedClipIds, clipId],
    })),

  setPlayhead: (seconds) => set({ playheadSec: Math.max(0, seconds) }),

  setPixelsPerSecond: (value) =>
    set({
      pixelsPerSecond: Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, value)),
    }),
}));

export const selectCanUndo = (state: EditorState) => state.past.length > 0;
export const selectCanRedo = (state: EditorState) => state.future.length > 0;
export const selectUndoLabel = (state: EditorState) => state.past.at(-1)?.label ?? null;
