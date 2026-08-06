"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { localAuthService } from "@/lib/auth/local-auth";
import type { PendingEmail } from "@/lib/auth/ports";
import { PendingEmailNotice } from "@/components/auth/pending-email-notice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<PendingEmail | null>(null);

  const request = useMutation({
    mutationFn: () => localAuthService.requestPasswordReset(email),
    onSuccess: (result) => {
      setPending(result);
      setSubmitted(true);
    },
  });

  return (
    <Card className="shadow-soft-lg">
      <CardContent className="space-y-5 pt-6">
        <div>
          <h1 className="text-xl font-semibold">Восстановление пароля</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Укажите адрес, на который зарегистрирована учётная запись.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            {/* Ответ одинаков независимо от того, есть такой адрес или нет:
                иначе форма превращается в способ проверять, кто на платформе
                зарегистрирован. */}
            <Alert>
              <AlertDescription>
                Если учётная запись с таким адресом существует, ссылка для смены пароля
                отправлена.
              </AlertDescription>
            </Alert>

            {pending ? <PendingEmailNotice email={pending} /> : null}

            <Button variant="ghost" nativeButton={false} render={<Link href="/login" />} className="w-full">
              К странице входа
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              request.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="forgot-email">Электронная почта</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              disabled={request.isPending}
              className="bg-gradient-accent w-full text-white hover:opacity-90"
            >
              {request.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Отправить ссылку
            </Button>

            <Button variant="ghost" nativeButton={false} render={<Link href="/login" />} className="w-full">
              Вернуться ко входу
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
