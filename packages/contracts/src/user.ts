import { z } from 'zod';
import { Id, IsoDateTime, LanguageCode, Timestamps } from './primitives';

export const UserRole = z.enum(['user', 'manager', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const UserStatus = z.enum(['pending_verification', 'active', 'blocked']);
export type UserStatus = z.infer<typeof UserStatus>;

export const User = z
  .object({
    id: Id,
    firstName: z.string().min(1).max(64),
    lastName: z.string().min(1).max(64),
    email: z.email(),
    emailVerifiedAt: IsoDateTime.nullable().default(null),
    avatarUrl: z.url().nullable().default(null),
    role: UserRole,
    status: UserStatus,
    interfaceLanguage: LanguageCode.default('ru'),
    lastLoginAt: IsoDateTime.nullable().default(null),
  })
  .extend(Timestamps.shape);
export type User = z.infer<typeof User>;

/**
 * Сессия устройства. Нужна для «выйти со всех устройств» и списка активных
 * сессий (п.3 ТЗ). currentDevice вычисляется сервером, а не клиентом.
 */
export const Session = z.object({
  id: Id,
  userId: Id,
  deviceLabel: z.string(),
  browser: z.string().nullable(),
  os: z.string().nullable(),
  ipAddress: z.string().nullable(),
  location: z.string().nullable(),
  isCurrent: z.boolean(),
  createdAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
});
export type Session = z.infer<typeof Session>;

/**
 * Права описаны данными, а не проверками `role === 'admin'` по коду: раздел
 * «управление ролями и правами» (п.4 ТЗ) иначе невозможно реализовать, а UI
 * начнёт расходиться с реальными правами.
 */
export const PERMISSIONS = [
  'users.read',
  'users.write',
  'users.block',
  'roles.manage',
  'credits.grant',
  'credits.revoke',
  'plans.manage',
  'jobs.read',
  'jobs.control',
  'logs.read',
  'models.manage',
  'announcements.manage',
  'stats.read',
  'system.settings',
] as const;

export const Permission = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof Permission>;

const MANAGER_PERMISSIONS: Permission[] = [
  'users.read',
  'credits.grant',
  'jobs.read',
  'stats.read',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  user: [],
  manager: MANAGER_PERMISSIONS,
  admin: PERMISSIONS,
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
