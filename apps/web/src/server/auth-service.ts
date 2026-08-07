import "server-only";
import {
  Password,
  TOKEN_TTL_HOURS,
  User,
  type LoginInput,
  type RegisterInput,
  type VerificationPurpose,
} from "@avatar/contracts";
import {
  generateSalt,
  generateToken,
  hashPassword,
  hashToken,
  newId,
  safeEqual,
} from "./crypto";
import { ApiError } from "./http";
import {
  credentialRepository,
  nowIso,
  normalizeEmail,
  sessionRepository,
  tokenRepository,
  userRepository,
} from "./repositories";

/**
 * Письмо, которое отправил бы почтовый сервис.
 *
 * Доставки нет: SMTP-провайдера у проекта пока не подключено, поэтому ссылка
 * возвращается в ответе и показывается в интерфейсе. Это заглушка, и она так и
 * подписана на экране. Когда появится отправка, из ответа исчезнет поле link —
 * больше ничего менять не придётся.
 */
export type PendingEmail = {
  to: string;
  purpose: VerificationPurpose;
  link: string;
  expiresAt: string;
};

function issueToken(userId: string, email: string, purpose: VerificationPurpose): PendingEmail {
  tokenRepository.invalidate(userId, purpose);

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + TOKEN_TTL_HOURS[purpose] * 60 * 60 * 1000,
  ).toISOString();

  tokenRepository.create({
    id: newId("vt"),
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const path = purpose === "email_verification" ? "/verify-email" : "/reset-password";
  return { to: email, purpose, link: `${path}?token=${token}`, expiresAt };
}

function consumeToken(token: string, purpose: VerificationPurpose): { userId: string } {
  const row = tokenRepository.findByHash(hashToken(token));
  if (!row || row.purpose !== purpose || row.used_at !== null) {
    throw ApiError.auth(400, "token_invalid");
  }
  if (row.expires_at <= nowIso()) throw ApiError.auth(400, "token_expired");

  tokenRepository.markUsed(row.id);
  return { userId: row.user_id };
}

export const authService = {
  register(input: RegisterInput): { user: User; email: PendingEmail } {
    const email = normalizeEmail(input.email);
    if (userRepository.findByEmail(email)) throw ApiError.auth(409, "email_taken");

    const timestamp = nowIso();
    const user = User.parse({
      id: newId("usr"),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      emailVerifiedAt: null,
      avatarUrl: null,
      role: "user",
      status: "pending_verification",
      interfaceLanguage: "ru",
      lastLoginAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    userRepository.insert(user);
    return { user, email: issueToken(user.id, user.email, "email_verification") };
  },

  async setPassword(userId: string, password: string): Promise<void> {
    const salt = generateSalt();
    credentialRepository.put(userId, salt, await hashPassword(password, salt));
  },

  /**
   * Проверка пароля.
   *
   * При отсутствующем пользователе хэш всё равно считается: иначе ответ на
   * незарегистрированный адрес приходил бы заметно быстрее, и форма входа
   * становилась бы способом узнать, кто зарегистрирован на платформе.
   */
  async verifyPassword(input: LoginInput): Promise<User> {
    const user = userRepository.findByEmail(input.email);
    const credentials = user ? credentialRepository.find(user.id) : null;
    const salt = credentials?.salt ?? "00000000000000000000000000000000";

    const candidate = await hashPassword(input.password, salt);
    if (!user || !credentials || !safeEqual(candidate, credentials.hash)) {
      throw ApiError.auth(401, "invalid_credentials");
    }
    if (user.status === "blocked") throw ApiError.auth(403, "account_blocked");
    if (user.status === "pending_verification") throw ApiError.auth(403, "email_not_verified");

    return userRepository.update(user.id, { lastLoginAt: nowIso() });
  },

  verifyEmail(token: string): User {
    const { userId } = consumeToken(token, "email_verification");
    const timestamp = nowIso();
    return userRepository.update(userId, {
      emailVerifiedAt: timestamp,
      status: "active",
    });
  },

  /**
   * Повторная отправка письма и запрос сброса отвечают одинаково независимо от
   * того, есть ли такой адрес: иначе форма превращается в проверку наличия
   * учётной записи. Вызывающая сторона получает null и ничего об этом не
   * сообщает пользователю.
   */
  resendVerification(email: string): PendingEmail | null {
    const user = userRepository.findByEmail(email);
    if (!user || user.emailVerifiedAt !== null) return null;
    return issueToken(user.id, user.email, "email_verification");
  },

  requestPasswordReset(email: string): PendingEmail | null {
    const user = userRepository.findByEmail(email);
    if (!user) return null;
    return issueToken(user.id, user.email, "password_reset");
  },

  /**
   * После смены пароля все сессии закрываются: если пароль меняют из-за того,
   * что его узнал посторонний, оставленная у него сессия сводит смену на нет.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    Password.parse(newPassword);
    const { userId } = consumeToken(token, "password_reset");
    await authService.setPassword(userId, newPassword);
    sessionRepository.removeAll(userId);
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId: string,
  ): Promise<void> {
    Password.parse(newPassword);

    const credentials = credentialRepository.find(userId);
    if (!credentials) throw ApiError.unauthorized();

    const candidate = await hashPassword(currentPassword, credentials.salt);
    if (!safeEqual(candidate, credentials.hash)) {
      throw new ApiError(400, "invalid_credentials", "Текущий пароль указан неверно");
    }

    await authService.setPassword(userId, newPassword);
    sessionRepository.removeOthers(userId, keepSessionId);
  },
};
