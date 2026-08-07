"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Laptop, Loader2, LogOut, X } from "lucide-react";
import {
  PASSWORD_MIN_LENGTH,
  Password,
  availableSeconds,
  secondsToMinutesLabel,
  type Session,
  type UserRole,
} from "@avatar/contracts";
import { authService } from "@/lib/auth/service";
import { AuthError } from "@/lib/auth/ports";
import { useSession } from "@/lib/auth/session-context";
import { dataClient, queryKeys } from "@/lib/data";
import { formatUpdatedAt } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  user: "Пользователь",
};

export function SettingsClient() {
  return (
    <div className="max-w-2xl space-y-4">
      <ProfileCard />
      <ChangePasswordCard />
      <SessionsCard />

      <Alert>
        <AlertDescription className="text-xs">
          Пароль проверяет сервер, идентификатор сессии лежит в куке, недоступной скриптам.
          Письма пока не отправляются: ссылку для подтверждения адреса и сброса пароля
          интерфейс показывает прямо на экране.
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * Профиль целиком: кто вошёл, чем оплачивается работа и как выйти.
 *
 * Раньше это жило в меню под аватаром в шапке, и шапка существовала ради двух
 * значков. Данные профиля — редкая, но осмысленная страница, а значки в углу
 * каждой страницы стоили 64 px по высоте везде.
 */
function ProfileCard() {
  const { user, refresh, logout } = useSession();
  const router = useRouter();

  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const account = useQuery({
    queryKey: queryKeys.creditAccount,
    queryFn: () => dataClient.credits.getAccount(user!.id),
    enabled: user !== null,
  });

  const save = useMutation({
    mutationFn: () =>
      authService.updateProfile({
        firstName: firstName ?? user!.firstName,
        lastName: lastName ?? user!.lastName,
      }),
    onSuccess: async () => {
      setSaved(true);
      await refresh();
    },
  });

  if (!user) return null;

  // Поля начинают жить своей жизнью только после первой правки: иначе значение
  // из сессии пришлось бы копировать в состояние эффектом и следить, чтобы
  // копия не разъехалась с обновлённым профилем.
  const first = firstName ?? user.firstName;
  const last = lastName ?? user.lastName;
  const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  const dirty = first !== user.firstName || last !== user.lastName;
  const valid = first.trim().length > 0 && last.trim().length > 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar className="size-14">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-gradient-accent font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-muted-foreground text-sm break-all">{user.email}</p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut className="size-3.5" />
            Выйти
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
          {user.emailVerifiedAt ? (
            <Badge variant="outline" className="text-success">
              <Check className="size-3" />
              Почта подтверждена
            </Badge>
          ) : (
            <Badge variant="outline" className="text-warning">
              <X className="size-3" />
              Почта не подтверждена
            </Badge>
          )}
          {user.status === "blocked" ? <Badge variant="destructive">Заблокирован</Badge> : null}
        </div>

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSaved(false);
            save.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="profile-first-name">Имя</Label>
            <Input
              id="profile-first-name"
              value={first}
              autoComplete="given-name"
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-last-name">Фамилия</Label>
            <Input
              id="profile-last-name"
              value={last}
              autoComplete="family-name"
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            {save.error ? (
              <p className="text-destructive mb-2 text-sm">
                {save.error instanceof AuthError ? save.error.message : "Не удалось сохранить"}
              </p>
            ) : null}
            {saved && !dirty ? <p className="text-success mb-2 text-sm">Профиль сохранён</p> : null}

            <Button type="submit" disabled={!dirty || !valid || save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Сохранить профиль
            </Button>
          </div>
        </form>

        <dl className="border-border grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs">Доступно минут</dt>
            <dd className="tabular-nums">
              {account.data ? secondsToMinutesLabel(availableSeconds(account.data)) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Дата регистрации</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString("ru")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Последний вход</dt>
            <dd>{user.lastLoginAt ? formatUpdatedAt(user.lastLoginAt) : "—"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => authService.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setDone(true);
      setCurrentPassword("");
      setNewPassword("");
    },
  });

  const rules = [
    { label: `Не короче ${PASSWORD_MIN_LENGTH} символов`, ok: newPassword.length >= PASSWORD_MIN_LENGTH },
    { label: "Есть буква", ok: /\p{L}/u.test(newPassword) },
    { label: "Есть цифра", ok: /\d/.test(newPassword) },
  ];
  const valid = Password.safeParse(newPassword).success && currentPassword.length > 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <h2 className="font-semibold">Смена пароля</h2>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setDone(false);
            change.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="current-password">Текущий пароль</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-password">Новый пароль</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
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

          {change.error ? (
            <p className="text-destructive text-sm">
              {change.error instanceof AuthError ? change.error.message : "Не удалось сменить пароль"}
            </p>
          ) : null}
          {done ? <p className="text-success text-sm">Пароль изменён</p> : null}

          <Button type="submit" disabled={!valid || change.isPending}>
            {change.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Сохранить пароль
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => authService.listSessions(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sessions"] });

  const revoke = useMutation({
    mutationFn: (sessionId: string) => authService.revokeSession(sessionId),
    onSuccess: invalidate,
  });
  const revokeOthers = useMutation({
    mutationFn: () => authService.revokeOtherSessions(),
    onSuccess: invalidate,
  });

  const others = (sessions.data ?? []).filter((session) => !session.isCurrent);

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Активные сессии</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => revokeOthers.mutate()}
            disabled={others.length === 0 || revokeOthers.isPending}
          >
            <LogOut className="size-3.5" />
            Выйти со всех других устройств
          </Button>
        </div>

        {sessions.isPending ? (
          <p className="text-muted-foreground text-sm">Загрузка…</p>
        ) : (
          <ul className="space-y-2">
            {(sessions.data ?? []).map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onRevoke={() => revoke.mutate(session.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: () => void }) {
  return (
    <li className="border-border flex items-center gap-3 rounded-xl border p-3">
      <Laptop className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{session.deviceLabel}</p>
        <p className="text-muted-foreground text-xs">
          Активна {formatUpdatedAt(session.lastSeenAt)}
        </p>
      </div>
      {session.isCurrent ? (
        <Badge variant="secondary">Текущая</Badge>
      ) : (
        <Button variant="ghost" size="sm" onClick={onRevoke}>
          Завершить
        </Button>
      )}
    </li>
  );
}
