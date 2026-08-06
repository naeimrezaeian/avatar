"use client";

import {
  AUTH_ERROR_MESSAGES,
  CreditAccount,
  LoginInput,
  RegisterInput,
  Session,
  TOKEN_TTL_HOURS,
  User,
  VerificationToken,
  type ChangePasswordInput,
  type VerificationPurpose,
} from "@avatar/contracts";
import { getDb, newId, nowIso } from "@/lib/data/db";
import { generateSalt, generateToken, hashPassword, hashToken, safeEqual } from "./crypto";
import { AuthError, type AuthService, type PendingEmail } from "./ports";

/**
 * Локальная аутентификация первого этапа.
 *
 * ЭТО НЕ ЗАЩИТА. Всё выполняется в браузере: и проверка пароля, и решение о
 * доступе. Любой, у кого есть доступ к устройству или консоли разработчика,
 * обойдёт её за минуту. Назначение реализации — довести до готовности экраны и
 * потоки, чтобы при появлении бэкенда заменить только этот файл.
 *
 * Что при переезде обязано уехать на сервер: проверка пароля, выдача сессии,
 * решение о доступе к маршрутам и хранение токенов. Идентификатор сессии
 * должен переехать из localStorage в httpOnly-куку, недоступную скриптам.
 */

const SESSION_STORAGE_KEY = "avatar-studio.session";

function describeDevice(): { deviceLabel: string; browser: string | null; os: string | null } {
  if (typeof navigator === "undefined") {
    return { deviceLabel: "Неизвестное устройство", browser: null, os: null };
  }

  const ua = navigator.userAgent;
  const browser = /Firefox/.test(ua)
    ? "Firefox"
    : /Edg/.test(ua)
      ? "Edge"
      : /Chrome/.test(ua)
        ? "Chrome"
        : /Safari/.test(ua)
          ? "Safari"
          : null;
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;

  return { deviceLabel: [browser, os].filter(Boolean).join(" · ") || "Браузер", browser, os };
}

async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  // Адреса сравниваются в нижнем регистре: иначе Ivan@ и ivan@ станут разными
  // учётными записями, а человек будет уверен, что уже регистрировался.
  return (await db.getFromIndex("users", "by-email", email.trim().toLowerCase())) ?? null;
}

async function issueToken(
  userId: string,
  purpose: VerificationPurpose,
  email: string,
): Promise<PendingEmail> {
  const db = await getDb();
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + TOKEN_TTL_HOURS[purpose] * 3_600_000,
  ).toISOString();

  await db.put(
    "verificationTokens",
    VerificationToken.parse({
      id: newId("vtk"),
      userId,
      purpose,
      // В базе только хэш: утечка таблицы токенов иначе равносильна доступу к
      // любой учётной записи.
      tokenHash: await hashToken(token),
      expiresAt,
      createdAt: nowIso(),
    }),
  );

  return {
    to: email,
    purpose,
    link:
      purpose === "email_verification"
        ? `/verify-email?token=${token}`
        : `/reset-password?token=${token}`,
    expiresAt,
  };
}

async function consumeToken(token: string, purpose: VerificationPurpose): Promise<string> {
  const db = await getDb();
  const hash = await hashToken(token);
  const all = await db.getAll("verificationTokens");
  const record = all.find((item) => item.purpose === purpose && safeEqual(item.tokenHash, hash));

  if (!record || record.usedAt !== null) {
    throw new AuthError("token_invalid", AUTH_ERROR_MESSAGES.token_invalid);
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    throw new AuthError("token_expired", AUTH_ERROR_MESSAGES.token_expired);
  }

  // Токен гасится сразу: ссылка из письма должна срабатывать ровно один раз.
  await db.put("verificationTokens", { ...record, usedAt: nowIso() });
  return record.userId;
}

async function createSession(userId: string): Promise<Session> {
  const db = await getDb();
  const device = describeDevice();
  const session = Session.parse({
    id: newId("ses"),
    userId,
    deviceLabel: device.deviceLabel,
    browser: device.browser,
    os: device.os,
    ipAddress: null,
    location: null,
    isCurrent: true,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  });

  await db.put("sessions", session);
  localStorage.setItem(SESSION_STORAGE_KEY, session.id);
  return session;
}

export const localAuthService: AuthService = {
  async current() {
    if (typeof localStorage === "undefined") return null;
    const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) return null;

    const db = await getDb();
    const session = await db.get("sessions", sessionId);
    if (!session) {
      // Сессию отозвали с другого устройства — чистим локальный след.
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    const user = await db.get("users", session.userId);
    if (!user || user.status === "blocked") {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    await db.put("sessions", { ...session, lastSeenAt: nowIso() });
    return { user, session };
  },

  async register(input) {
    const parsed = RegisterInput.parse(input);
    const email = parsed.email.trim().toLowerCase();

    if (await findUserByEmail(email)) {
      throw new AuthError("email_taken", AUTH_ERROR_MESSAGES.email_taken);
    }

    const db = await getDb();
    const timestamp = nowIso();
    const user = User.parse({
      id: newId("usr"),
      firstName: parsed.firstName.trim(),
      lastName: parsed.lastName.trim(),
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

    const salt = generateSalt();
    const hash = await hashPassword(parsed.password, salt);

    // Профиль, секреты и счёт кредитов создаются одной транзакцией: учётная
    // запись без счёта не смогла бы запустить ни одной генерации.
    const tx = db.transaction(["users", "credentials", "creditAccounts"], "readwrite");
    await Promise.all([
      tx.objectStore("users").put(user),
      tx.objectStore("credentials").put({ userId: user.id, salt, hash }),
      tx.objectStore("creditAccounts").put(
        CreditAccount.parse({
          userId: user.id,
          // Стартовый пакет: пять минут, чтобы попробовать платформу.
          balanceSeconds: 300,
          reservedSeconds: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
      tx.done,
    ]);

    return { user, email: await issueToken(user.id, "email_verification", email) };
  },

  async login(input) {
    const parsed = LoginInput.parse(input);
    const user = await findUserByEmail(parsed.email);

    const db = await getDb();
    const credentials = user ? await db.get("credentials", user.id) : null;

    // Хэш считается даже когда пользователя нет: иначе ответ на
    // несуществующий адрес возвращался бы заметно быстрее и выдавал бы,
    // зарегистрирован человек или нет.
    const candidate = await hashPassword(
      parsed.password,
      credentials?.salt ?? "00000000000000000000000000000000",
    );

    if (!user || !credentials || !safeEqual(candidate, credentials.hash)) {
      throw new AuthError("invalid_credentials", AUTH_ERROR_MESSAGES.invalid_credentials);
    }
    if (user.status === "blocked") {
      throw new AuthError("account_blocked", AUTH_ERROR_MESSAGES.account_blocked);
    }
    if (user.status === "pending_verification") {
      throw new AuthError("email_not_verified", AUTH_ERROR_MESSAGES.email_not_verified);
    }

    const session = await createSession(user.id);
    const updated = User.parse({ ...user, lastLoginAt: nowIso(), updatedAt: nowIso() });
    await db.put("users", updated);

    return { user: updated, session };
  },

  async logout() {
    const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    if (!sessionId) return;
    const db = await getDb();
    await db.delete("sessions", sessionId);
  },

  async verifyEmail(token) {
    const userId = await consumeToken(token, "email_verification");
    const db = await getDb();
    const user = await db.get("users", userId);
    if (!user) throw new AuthError("token_invalid", AUTH_ERROR_MESSAGES.token_invalid);

    const verified = User.parse({
      ...user,
      emailVerifiedAt: nowIso(),
      status: "active",
      updatedAt: nowIso(),
    });
    await db.put("users", verified);
    return verified;
  },

  async resendVerification(email) {
    const user = await findUserByEmail(email);
    // Наружу ничего не сообщаем: ответ одинаков для существующего и
    // несуществующего адреса.
    if (!user || user.status !== "pending_verification") return null;
    return issueToken(user.id, "email_verification", user.email);
  },

  async requestPasswordReset(email) {
    const user = await findUserByEmail(email);
    if (!user) return null;
    return issueToken(user.id, "password_reset", user.email);
  },

  async resetPassword(token, newPassword) {
    const userId = await consumeToken(token, "password_reset");
    const db = await getDb();

    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    await db.put("credentials", { userId, salt, hash });

    // Смена пароля разлогинивает все устройства: если пароль меняют из-за
    // утечки, чужая сессия не должна пережить эту операцию.
    const sessions = await db.getAllFromIndex("sessions", "by-user", userId);
    await Promise.all(sessions.map((session) => db.delete("sessions", session.id)));
    localStorage.removeItem(SESSION_STORAGE_KEY);
  },

  async changePassword(input: ChangePasswordInput) {
    const currentAuth = await localAuthService.current();
    if (!currentAuth) throw new AuthError("invalid_credentials", "Требуется вход");

    const db = await getDb();
    const credentials = await db.get("credentials", currentAuth.user.id);
    if (!credentials) throw new AuthError("invalid_credentials", "Требуется вход");

    const candidate = await hashPassword(input.currentPassword, credentials.salt);
    if (!safeEqual(candidate, credentials.hash)) {
      throw new AuthError("invalid_credentials", "Текущий пароль указан неверно");
    }

    const salt = generateSalt();
    const hash = await hashPassword(input.newPassword, salt);
    await db.put("credentials", { userId: currentAuth.user.id, salt, hash });
  },

  async listSessions() {
    const auth = await localAuthService.current();
    if (!auth) return [];

    const db = await getDb();
    const sessions = await db.getAllFromIndex("sessions", "by-user", auth.user.id);
    return sessions
      .map((session) => ({ ...session, isCurrent: session.id === auth.session.id }))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  },

  async revokeSession(sessionId) {
    const db = await getDb();
    await db.delete("sessions", sessionId);
    if (localStorage.getItem(SESSION_STORAGE_KEY) === sessionId) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  },

  async revokeOtherSessions() {
    const auth = await localAuthService.current();
    if (!auth) return;

    const db = await getDb();
    const sessions = await db.getAllFromIndex("sessions", "by-user", auth.user.id);
    await Promise.all(
      sessions
        .filter((session) => session.id !== auth.session.id)
        .map((session) => db.delete("sessions", session.id)),
    );
  },
};
