"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectDocument } from "@avatar/contracts";
import { dataClient, queryKeys } from ".";

/**
 * Чтение и запись документа проекта.
 *
 * Сохранение всегда идёт от ревизии, которую видел вызывающий код, и сервер
 * отклоняет запись поверх более новой версии. Полноценное автосохранение
 * патчами и undo/redo появятся вместе с состоянием редактора; здесь достаточно
 * того, чтобы конфликт нельзя было проглотить молча.
 */
export function useProjectDocument(projectId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.document(projectId),
    queryFn: () => dataClient.documents.get(projectId),
  });

  const save = useMutation({
    mutationFn: async (next: ProjectDocument) => {
      return dataClient.documents.save(next, next.revision);
    },
    onSuccess: (saved) => {
      // Кладём ответ в кэш напрямую: перечитывание документа после каждой
      // правки давало бы мигание и гонку с уже набранным текстом.
      queryClient.setQueryData(queryKeys.document(projectId), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  const update = useCallback(
    (recipe: (document: ProjectDocument) => ProjectDocument) => {
      const current = queryClient.getQueryData<ProjectDocument | null>(
        queryKeys.document(projectId),
      );
      if (!current) return;
      save.mutate(recipe(current));
    },
    [projectId, queryClient, save],
  );

  return {
    document: query.data ?? null,
    isPending: query.isPending,
    update,
    isSaving: save.isPending,
    conflict: save.error,
  };
}
