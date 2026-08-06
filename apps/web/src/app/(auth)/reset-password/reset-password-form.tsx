"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { PASSWORD_MIN_LENGTH, Password } from "@avatar/contracts";
import { localAuthService } from "@/lib/auth/local-auth";
import { AuthError } from "@/lib/auth/ports";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  const reset = useMutation({
    mutationFn: () => localAuthService.resetPassword(token!, password),
    onSuccess: () => setDone(true),
  });

  if (!token) {
    return (
      <Card className="shadow-soft-lg">
        <CardContent className="space-y-4 pt-6">
          <h1 className="text-xl font-semibold">Ссылка неполная</h1>
          <p className="text-muted-foreground text-sm">
            В адресе нет кода подтверждения. Откройте ссылку из письма целиком или запросите
            новую.
          </p>
          <Button render={<Link href="/forgot-password" />} className="w-full">
            Запросить новую ссылку
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="shadow-soft-lg">
        <CardContent className="space-y-4 pt-6">
          <h1 className="text-xl font-semibold">Пароль изменён</h1>
          <p className="text-muted-foreground text-sm">
            Все активные сессии завершены — на других устройствах потребуется войти заново.
          </p>
          <Button
            onClick={() => router.replace("/login")}
            className="bg-gradient-accent w-full text-white hover:opacity-90"
          >
            Войти
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rules = [
    { label: `Не короче ${PASSWORD_MIN_LENGTH} символов`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: "Есть буква", ok: /\p{L}/u.test(password) },
    { label: "Есть цифра", ok: /\d/.test(password) },
  ];
  const valid = Password.safeParse(password).success;

  return (
    <Card className="shadow-soft-lg">
      <CardContent className="space-y-5 pt-6">
        <div>
          <h1 className="text-xl font-semibold">Новый пароль</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            После смены пароля вход на всех устройствах потребуется заново.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            reset.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="reset-password">Пароль</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <ul className="mt-1 space-y-1">
              {rules.map((rule) => (
                <li
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    rule.ok ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {rule.ok ? <Check className="size-3" /> : <X className="size-3" />}
                  {rule.label}
                </li>
              ))}
            </ul>
          </div>

          {reset.error ? (
            <Alert>
              <AlertDescription className="text-destructive">
                {reset.error instanceof AuthError ? reset.error.message : "Не удалось сменить пароль"}
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            disabled={!valid || reset.isPending}
            className="bg-gradient-accent w-full text-white hover:opacity-90"
          >
            {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Сохранить пароль
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
