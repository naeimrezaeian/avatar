"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { localAuthService } from "@/lib/auth/local-auth";
import { AuthError } from "@/lib/auth/ports";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type State = { kind: "pending" } | { kind: "ok" } | { kind: "error"; message: string };

export function VerifyEmailClient({ token }: { token: string | null }) {
  // Отсутствие токена видно сразу, без обращения к хранилищу, — поэтому это
  // начальное состояние, а не установка из эффекта.
  const [state, setState] = useState<State>(
    token ? { kind: "pending" } : { kind: "error", message: "В адресе нет кода подтверждения" },
  );
  // Токен гасится при первом использовании, поэтому повторный вызов в
  // строгом режиме разработки сообщил бы о недействительной ссылке.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;

    localAuthService
      .verifyEmail(token)
      .then(() => setState({ kind: "ok" }))
      .catch((error: unknown) => {
        setState({
          kind: "error",
          message: error instanceof AuthError ? error.message : "Не удалось подтвердить адрес",
        });
      });
  }, [token]);

  return (
    <Card className="shadow-soft-lg">
      <CardContent className="space-y-4 pt-6 text-center">
        {state.kind === "pending" ? (
          <>
            <Loader2 className="text-muted-foreground mx-auto size-8 animate-spin" />
            <h1 className="text-lg font-semibold">Подтверждаем адрес</h1>
          </>
        ) : state.kind === "ok" ? (
          <>
            <CheckCircle2 className="text-success mx-auto size-10" />
            <h1 className="text-lg font-semibold">Адрес подтверждён</h1>
            <p className="text-muted-foreground text-sm">Теперь можно войти в кабинет.</p>
            <Button
              nativeButton={false} role="link" render={<Link href="/login" />}
              className="bg-gradient-accent w-full text-white hover:opacity-90"
            >
              Войти
            </Button>
          </>
        ) : (
          <>
            <XCircle className="text-destructive mx-auto size-10" />
            <h1 className="text-lg font-semibold">Не получилось</h1>
            <p className="text-muted-foreground text-sm">{state.message}</p>
            <Button variant="secondary" nativeButton={false} role="link" render={<Link href="/login" />} className="w-full">
              К странице входа
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
