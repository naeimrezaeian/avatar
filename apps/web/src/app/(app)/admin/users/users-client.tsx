"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreVertical, ShieldCheck, ShieldOff, Wallet } from "lucide-react";
import {
  availableSeconds,
  secondsToMinutesLabel,
  type User,
  type UserRole,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import type { AdminUserRow } from "@/lib/data/ports";
import { useSession } from "@/lib/auth/session-context";
import { formatUpdatedAt } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_LABELS: Record<UserRole, string> = {
  user: "Пользователь",
  manager: "Менеджер",
  admin: "Администратор",
};

const STATUS_LABELS: Record<User["status"], string> = {
  pending_verification: "Ждёт подтверждения",
  active: "Активен",
  blocked: "Заблокирован",
};

export function UsersClient() {
  const [creditsFor, setCreditsFor] = useState<AdminUserRow | null>(null);

  const users = useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: () => dataClient.admin.listUsers(),
  });

  if (users.isPending) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs">
                <tr>
                  <th className="p-3 font-medium">Пользователь</th>
                  <th className="p-3 font-medium">Роль</th>
                  <th className="p-3 font-medium">Статус</th>
                  <th className="p-3 font-medium">Проекты</th>
                  <th className="p-3 font-medium">Доступно</th>
                  <th className="p-3 font-medium">Израсходовано</th>
                  <th className="p-3 font-medium">Последний вход</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((row) => (
                  <UserRow key={row.user.id} row={row} onAdjustCredits={setCreditsFor} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AdjustCreditsDialog row={creditsFor} onClose={() => setCreditsFor(null)} />
    </>
  );
}

function UserRow({
  row,
  onAdjustCredits,
}: {
  row: AdminUserRow;
  onAdjustCredits: (row: AdminUserRow) => void;
}) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useSession();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminStats });
  };

  const setRole = useMutation({
    mutationFn: (role: UserRole) => dataClient.admin.setRole(row.user.id, role),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: (status: User["status"]) => dataClient.admin.setStatus(row.user.id, status),
    onSuccess: invalidate,
  });

  // Себя заблокировать или разжаловать нельзя: администратор, оставшийся без
  // прав, уже не сможет их вернуть.
  const isSelf = currentUser?.id === row.user.id;
  const blocked = row.user.status === "blocked";

  return (
    <tr className="border-border/60 border-b last:border-0">
      <td className="p-3">
        <p className="font-medium">
          {row.user.firstName} {row.user.lastName}
        </p>
        <p className="text-muted-foreground text-xs break-all">{row.user.email}</p>
      </td>
      <td className="p-3">
        <Badge variant={row.user.role === "admin" ? "default" : "secondary"}>
          {ROLE_LABELS[row.user.role]}
        </Badge>
      </td>
      <td className="p-3">
        <span
          className={
            blocked
              ? "text-destructive"
              : row.user.status === "active"
                ? "text-success"
                : "text-muted-foreground"
          }
        >
          {STATUS_LABELS[row.user.status]}
        </span>
      </td>
      <td className="p-3 tabular-nums">{row.projectCount}</td>
      <td className="p-3 tabular-nums">
        {row.account ? `${secondsToMinutesLabel(availableSeconds(row.account))} мин` : "—"}
      </td>
      <td className="text-muted-foreground p-3 tabular-nums">
        {secondsToMinutesLabel(row.spentSeconds)} мин
      </td>
      <td className="text-muted-foreground p-3 text-xs">
        {row.user.lastLoginAt ? formatUpdatedAt(row.user.lastLoginAt) : "не входил"}
      </td>
      <td className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="size-8" aria-label="Действия">
                {setRole.isPending || setStatus.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MoreVertical className="size-4" />
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onAdjustCredits(row)}>
              <Wallet className="size-4" />
              Изменить кредиты
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs">Роль</DropdownMenuLabel>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
              <DropdownMenuItem
                key={role}
                disabled={isSelf || role === row.user.role}
                onClick={() => setRole.mutate(role)}
              >
                {ROLE_LABELS[role]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {blocked ? (
              <DropdownMenuItem onClick={() => setStatus.mutate("active")}>
                <ShieldCheck className="size-4" />
                Разблокировать
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                disabled={isSelf}
                onClick={() => setStatus.mutate("blocked")}
              >
                <ShieldOff className="size-4" />
                Заблокировать
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function AdjustCreditsDialog({
  row,
  onClose,
}: {
  row: AdminUserRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user: actor } = useSession();
  const [minutes, setMinutes] = useState("10");
  const [note, setNote] = useState("");

  const adjust = useMutation({
    mutationFn: (sign: 1 | -1) =>
      dataClient.admin.adjustCredits({
        userId: row!.user.id,
        deltaSeconds: sign * Math.round(Number(minutes) * 60),
        note: note.trim() || (sign > 0 ? "Начисление администратором" : "Списание администратором"),
        actorUserId: actor!.id,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminStats });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creditAccount });
      setNote("");
      onClose();
    },
  });

  const amount = Number(minutes);
  const valid = Number.isFinite(amount) && amount > 0;

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Кредиты пользователя</DialogTitle>
          <DialogDescription>
            {row ? `${row.user.firstName} ${row.user.lastName} · ${row.user.email}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="credit-minutes">Минуты</Label>
            <Input
              id="credit-minutes"
              type="number"
              min="1"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="credit-note">Комментарий</Label>
            <Input
              id="credit-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Причина операции"
            />
            <p className="text-muted-foreground text-xs">
              Попадёт в историю операций вместе с тем, кто её выполнил.
            </p>
          </div>

          {adjust.error ? (
            <p className="text-destructive text-sm">{adjust.error.message}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => adjust.mutate(-1)}
            disabled={!valid || adjust.isPending}
          >
            Списать
          </Button>
          <Button
            onClick={() => adjust.mutate(1)}
            disabled={!valid || adjust.isPending}
            className="bg-gradient-accent text-white hover:opacity-90"
          >
            Начислить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
