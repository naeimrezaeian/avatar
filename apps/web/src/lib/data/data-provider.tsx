"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { dataClient, queryKeys } from ".";
import { seedIfEmpty } from "./seed";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Данные лежат локально, но задачи генерации меняют их извне запросов,
        // поэтому кэш живёт недолго и обновляется по событиям.
        staleTime: 5_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * Подписка на поток статусов задач. Одна на всё приложение: каждое событие
 * инвалидирует то, что задача могла изменить, — сам список задач, документ
 * проекта и баланс кредитов.
 */
function JobEventBridge({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return dataClient.generation.subscribe((event) => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });

      if (event.status === "succeeded" || event.status === "failed" || event.status === "canceled") {
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.creditAccount });
        void queryClient.invalidateQueries({ queryKey: queryKeys.creditTransactions });
      }
    });
  }, [queryClient]);

  return children;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedIfEmpty()
      .then(() => setReady(true))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Не удалось открыть локальное хранилище");
      });
  }, []);

  if (error !== null) {
    return (
      <div className="text-destructive p-6 text-sm">
        Ошибка хранилища: {error}
      </div>
    );
  }

  // Экраны читают данные сразу после монтирования, поэтому рендерим их только
  // после посева — иначе первый запрос вернёт пустой список и мигнёт пустым
  // состоянием.
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <JobEventBridge>{children}</JobEventBridge>
    </QueryClientProvider>
  );
}
