import "server-only";
import { can, type Permission, type User } from "@avatar/contracts";
import { ApiError } from "./http";
import { requireAuth } from "./session";

/**
 * Проверка прав на сервере.
 *
 * Права — это данные (`ROLE_PERMISSIONS` в контрактах), и та же функция `can`
 * фильтрует пункты меню в интерфейсе. Но фильтрация меню — это удобство:
 * скрытый пункт не мешает вызвать маршрут напрямую, поэтому решение всё равно
 * принимается здесь.
 */
export async function requirePermission(permission: Permission): Promise<User> {
  const { user } = await requireAuth();
  if (!can(user.role, permission)) throw ApiError.forbidden();
  return user;
}
