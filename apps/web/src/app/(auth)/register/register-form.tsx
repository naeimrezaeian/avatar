"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { PASSWORD_MIN_LENGTH, RegisterInput } from "@avatar/contracts";
import { localAuthService } from "@/lib/auth/local-auth";
import { AuthError, type PendingEmail } from "@/lib/auth/ports";
import { PendingEmailNotice } from "@/components/auth/pending-email-notice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function RegisterForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<PendingEmail | null>(null);

  const register = useMutation({
    mutationFn: () => localAuthService.register({ firstName, lastName, email, password }),
    onSuccess: (result) => setPending(result.email),
  });

  // Требования показываются по мере набора, а не выстреливают списком ошибок
  // после отправки формы.
  const rules = [
    { label: `Не короче ${PASSWORD_MIN_LENGTH} символов`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: "Есть буква", ok: /\p{L}/u.test(password) },
    { label: "Есть цифра", ok: /\d/.test(password) },
  ];

  const parsed = RegisterInput.safeParse({ firstName, lastName, email, password });

  if (pending) {
    return (
      <Card className="shadow-soft-lg">
        <CardContent className="space-y-4 pt-6">
          <div>
            <h1 className="text-xl font-semibold">Почти готово</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Учётная запись создана. Осталось подтвердить адрес — до этого вход недоступен.
            </p>
          </div>
          <PendingEmailNotice email={pending} />
          <Button variant="ghost" nativeButton={false} render={<Link href="/login" />} className="w-full">
            К странице входа
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft-lg">
      <CardContent className="space-y-5 pt-6">
        <div>
          <h1 className="text-xl font-semibold">Регистрация</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Новым пользователям начисляется пять минут генерации для знакомства с платформой.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="register-first">Имя</Label>
              <Input
                id="register-first"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="register-last">Фамилия</Label>
              <Input
                id="register-last"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="register-email">Электронная почта</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="register-password">Пароль</Label>
            <Input
              id="register-password"
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

          {register.error ? (
            <Alert>
              <AlertDescription className="text-destructive">
                {register.error instanceof AuthError
                  ? register.error.message
                  : "Проверьте заполнение полей"}
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            disabled={!parsed.success || register.isPending}
            className="bg-gradient-accent w-full text-white hover:opacity-90"
          >
            {register.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Создать учётную запись
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          Уже зарегистрированы?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-2">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
