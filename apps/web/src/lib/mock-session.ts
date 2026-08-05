import { CreditAccount, User } from "@avatar/contracts";

/**
 * Заглушка сессии на время первого этапа. Возвращает уже провалидированные
 * контрактами объекты, поэтому при появлении настоящего API меняется только
 * тело функций — типы вызывающего кода остаются прежними.
 */

const NOW = "2026-08-01T09:00:00.000Z";

export const MOCK_USER: User = User.parse({
  id: "usr_demo",
  firstName: "Наим",
  lastName: "Резаиан",
  email: "naeimwtg@gmail.com",
  emailVerifiedAt: NOW,
  avatarUrl: null,
  role: "admin",
  status: "active",
  interfaceLanguage: "ru",
  lastLoginAt: NOW,
  createdAt: "2026-06-14T12:30:00.000Z",
  updatedAt: NOW,
});

export const MOCK_CREDIT_ACCOUNT: CreditAccount = CreditAccount.parse({
  userId: MOCK_USER.id,
  // 45 минут доступно, 2 минуты уже зарезервированы под активную генерацию.
  balanceSeconds: 2700,
  reservedSeconds: 120,
  expiresAt: "2026-12-31T23:59:59.000Z",
  planId: "plan_pro",
  createdAt: "2026-06-14T12:30:00.000Z",
  updatedAt: NOW,
});

export function getCurrentUser(): User {
  return MOCK_USER;
}

export function getCreditAccount(): CreditAccount {
  return MOCK_CREDIT_ACCOUNT;
}

export function userInitials(user: User): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
}

export function userFullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
