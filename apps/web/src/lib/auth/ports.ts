import type {
  AuthErrorCode,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  Session,
  User,
} from "@avatar/contracts";

/**
 * Ошибка аутентификации с кодом. Текст берётся из AUTH_ERROR_MESSAGES в
 * контрактах: формулировки должны совпадать на клиенте и на сервере, а
 * различать «нет такого адреса» и «неверный пароль» нельзя — иначе форма входа
 * становится способом узнать, зарегистрирован ли человек.
 */
export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Письмо, которое отправил бы бэкенд. На первом этапе доставки нет, поэтому
 * ссылка показывается прямо в интерфейсе — это заглушка, и она так и подписана.
 */
export type PendingEmail = {
  to: string;
  purpose: "email_verification" | "password_reset";
  /** Относительный путь со встроенным токеном. */
  link: string;
  expiresAt: string;
};

export interface AuthService {
  /** Текущий пользователь или null. */
  current(): Promise<{ user: User; session: Session } | null>;

  register(input: RegisterInput): Promise<{ user: User; email: PendingEmail }>;
  login(input: LoginInput): Promise<{ user: User; session: Session }>;
  logout(): Promise<void>;

  verifyEmail(token: string): Promise<User>;
  resendVerification(email: string): Promise<PendingEmail | null>;

  requestPasswordReset(email: string): Promise<PendingEmail | null>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;

  listSessions(): Promise<Session[]>;
  revokeSession(sessionId: string): Promise<void>;
  /** Выход со всех устройств, кроме текущего (п.3 ТЗ). */
  revokeOtherSessions(): Promise<void>;
}
