import { z } from "zod";
import { UserRole, UserStatus } from "@avatar/contracts";
import { ApiError, handle, readBody } from "@/server/http";
import { sessionRepository, userRepository } from "@/server/repositories";
import { requirePermission } from "@/server/authorize";

const Body = z
  .object({ role: UserRole.optional(), status: UserStatus.optional() })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: "Нечего менять: укажите роль или статус",
  });

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/admin/users/[userId]">,
): Promise<Response> {
  return handle(async () => {
    const { userId } = await params;
    const patch = await readBody(request, Body);

    // Право проверяется под конкретное действие: менеджер может блокировать
    // нарушителей, но раздавать роли — только администратор.
    const actor = await requirePermission(
      patch.role !== undefined ? "roles.manage" : "users.block",
    );

    if (!userRepository.findById(userId)) throw ApiError.notFound("Пользователь не найден");

    // Себе роль и статус не меняют: администратор, снявший с себя права или
    // заблокировавший себя, теряет доступ к панели, где это можно откатить.
    if (userId === actor.id) {
      throw ApiError.badRequest("Собственную роль и статус изменить нельзя");
    }

    const user = userRepository.update(userId, patch);

    // Блокировка завершает сессии: иначе заблокированный продолжит работать до
    // истечения своей сессии.
    if (patch.status === "blocked") sessionRepository.removeAll(userId);

    return Response.json({ user });
  });
}
