"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AUTH_ERROR_MESSAGES } from "@avatar/contracts";
import { localAuthService } from "@/lib/auth/local-auth";
import { AuthError } from "@/lib/auth/ports";
import { useSession } from "@/lib/auth/session-context";
import { DEMO_CREDENTIALS } from "@/lib/data/seed";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const { refresh } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resent, setResent] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => localAuthService.login({ email, password }),
    onSuccess: async () => {
      await refresh();
      router.replace("/dashboard");
    },
  });

  const resend = useMutation({
    mutationFn: () => localAuthService.resendVerification(email),
    onSuccess: (pending) => setResent(pending?.link ?? null),
  });

  const error = login.error;
  const notVerified = error instanceof AuthError && error.code === "email_not_verified";

  return (
    <Card className="shadow-soft-lg">
      <CardContent className="space-y-5 pt-6">
        <div>
          <h1 className="text-xl font-semibold">Вход</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Продолжите работу со своими проектами и аватарами.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="login-email">Электронная почта</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="login-password">Пароль</Label>
              <Link
                href="/forgot-password"
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              >
                Забыли пароль?
              </Link>
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="text-destructive">
                  {error instanceof AuthError
                    ? error.message
                    : AUTH_ERROR_MESSAGES.invalid_credentials}
                </p>
                {notVerified ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => resend.mutate()}
                    disabled={resend.isPending}
                  >
                    Отправить письмо ещё раз
                  </Button>
                ) : null}
                {resent ? (
                  <Link href={resent as Route} className="text-primary block break-all text-xs underline">
                    {resent}
                  </Link>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            disabled={login.isPending}
            className="bg-gradient-accent w-full text-white hover:opacity-90"
          >
            {login.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Войти
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          Нет учётной записи?{" "}
          <Link href="/register" className="text-foreground underline underline-offset-2">
            Зарегистрироваться
          </Link>
        </p>

        {/* Демонстрационный доступ. На рабочей платформе такого блока быть не
            должно — он существует только потому, что регистрация пока никуда
            не отправляет писем. */}
        <div className="border-border bg-muted/40 rounded-xl border border-dashed p-3">
          <p className="text-muted-foreground text-xs font-medium">Демонстрационный доступ</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {DEMO_CREDENTIALS.email} · {DEMO_CREDENTIALS.password}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              setEmail(DEMO_CREDENTIALS.email);
              setPassword(DEMO_CREDENTIALS.password);
            }}
          >
            Подставить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
