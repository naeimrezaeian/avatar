"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@avatar/contracts";
import { AUTH_BROADCAST_KEY } from "./http-auth";
import { authService } from "./service";

type SessionState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

const SESSION_QUERY_KEY = ["session"] as const;

/**
 * Сессия читается тем же механизмом запросов, что и остальные данные, а не
 * собственным состоянием: одно место кэширования, одна инвалидация и никакой
 * ручной синхронизации после входа и выхода.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => authService.current(),
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  }, [queryClient]);

  const logout = useCallback(async () => {
    await authService.logout();
    await refresh();
  }, [refresh]);

  // Вход и выход в соседней вкладке должны отражаться здесь: иначе одна вкладка
  // продолжает показывать кабинет уже вышедшего пользователя. Саму куку сессии
  // скрипты не видят, поэтому вкладки договариваются отдельной отметкой.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_BROADCAST_KEY) void refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  return (
    <SessionContext.Provider
      value={{
        user: query.data?.user ?? null,
        session: query.data?.session ?? null,
        loading: query.isPending,
        refresh,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession вызван вне SessionProvider");
  return value;
}
