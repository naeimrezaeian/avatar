"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { dataClient, queryKeys } from ".";
import { onPreparationChange } from "./preparation";
import { seedIfEmpty } from "./seed";

/** Сколько ждём открытия базы, прежде чем признать её недоступной. */
const STORAGE_TIMEOUT_MS = 8000;

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
    // Подготовка аватаров и голосов меняет их статусы вне запросов, поэтому
    // её события тоже должны инвалидировать кэш — иначе карточки застревают
    // в состоянии «материалы загружены» до перезагрузки страницы.
    return onPreparationChange((kind) => {
      void queryClient.invalidateQueries({
        queryKey: kind === "avatars" ? queryKeys.avatars : queryKeys.voices,
      });
    });
  }, [queryClient]);

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
    // Открытие базы может не завершиться вовсе: если другая вкладка держит
    // старую версию схемы, обновление блокируется молча. Без ограничения по
    // времени пользователь смотрел бы на пустой экран без объяснений.
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              "Хранилище не отвечает. Скорее всего, приложение открыто в другой вкладке — закройте её и обновите страницу.",
            ),
          ),
        STORAGE_TIMEOUT_MS,
      );
    });

    Promise.race([seedIfEmpty(), timeout])
      .then(() => setReady(true))
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : "Не удалось открыть локальное хранилище",
        );
      });
  }, []);

  if (error !== null) {
    return (
      <div className="border-destructive/40 bg-destructive/5 rounded-2xl border p-6">
        <p className="text-destructive text-sm font-medium">
          {error.includes("защищённом контексте") ? "Небезопасный адрес" : "Хранилище недоступно"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground mt-4 rounded-lg px-3 py-2 text-sm font-medium"
        >
          Обновить страницу
        </button>
      </div>
    );
  }

  // Экраны читают данные сразу после монтирования, поэтому рендерим их только
  // после посева — иначе первый запрос вернёт пустой список и мигнёт пустым
  // состоянием. Показываем скелет, а не пустоту: пустой экран читается как
  // поломка.
  if (!ready) {
    return (
      <div className="space-y-4">
        <div className="bg-muted h-8 w-48 animate-pulse rounded-lg" />
        <div className="bg-muted h-40 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <JobEventBridge>{children}</JobEventBridge>
    </QueryClientProvider>
  );
}
