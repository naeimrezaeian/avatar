"use client";

import Link from "next/link";
import type { Route } from "next";
import { Mail } from "lucide-react";
import type { PendingEmail } from "@/lib/auth/ports";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Письмо-заглушка. Отправлять почту пока нечем, поэтому ссылка показывается
 * прямо на экране — и об этом сказано прямо, чтобы никто не принял заглушку за
 * работающую рассылку.
 */
export function PendingEmailNotice({ email }: { email: PendingEmail }) {
  const expires = new Date(email.expiresAt).toLocaleString("ru", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Alert>
      <Mail className="size-4" />
      <AlertTitle>
        {email.purpose === "email_verification"
          ? "Подтвердите адрес электронной почты"
          : "Ссылка для смены пароля"}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Отправка писем ещё не подключена, поэтому ссылка показана здесь. На рабочей платформе
          она придёт на {email.to}.
        </p>
        {/* Путь собирается во время выполнения из одноразового токена, поэтому
            статическая проверка маршрутов его подтвердить не может. */}
        <Link
          href={email.link as Route}
          className="text-primary block break-all underline underline-offset-2"
        >
          {email.link}
        </Link>
        <p className="text-muted-foreground text-xs">Действует до {expires}</p>
      </AlertDescription>
    </Alert>
  );
}
