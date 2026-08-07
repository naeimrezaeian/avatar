import "server-only";
import { cookies, headers } from "next/headers";
import type { User } from "@avatar/contracts";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { generateSessionId } from "./crypto";
import { ApiError } from "./http";
import { sessionRepository, userRepository } from "./repositories";

/**
 * Сессия живёт в httpOnly-куке.
 *
 * Это главное отличие от временной браузерной реализации, где идентификатор
 * лежал в localStorage: оттуда его читает любой скрипт на странице, и одна
 * XSS-дыра означала угон учётной записи. Куку с httpOnly скрипты не видят
 * вовсе, а sameSite=lax закрывает переход по чужой ссылке с побочным
 * действием.
 */

export { SESSION_COOKIE };

/** Срок жизни сессии. Продлевается при каждом обращении. */
const SESSION_TTL_DAYS = 30;

export function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Описание устройства собирается на сервере из заголовков, а не в браузере:
 * клиент может прислать что угодно, а список «где выполнен вход» должен
 * отражать запросы, которые сервер действительно видел.
 */
export async function describeDevice(): Promise<{
  deviceLabel: string;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
}> {
  const store = await headers();
  const ua = store.get("user-agent") ?? "";

  const browser = /Firefox/.test(ua)
    ? "Firefox"
    : /Edg/.test(ua)
      ? "Edge"
      : /Chrome|Chromium/.test(ua)
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

  // За обратным прокси настоящий адрес приходит в X-Forwarded-For первым в
  // списке; при прямом обращении заголовка нет вовсе.
  const forwarded = store.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() ?? null;

  return {
    deviceLabel: browser && os ? `${browser} · ${os}` : (browser ?? os ?? "Неизвестное устройство"),
    browser,
    os,
    ipAddress,
  };
}

export async function startSession(userId: string): Promise<string> {
  const id = generateSessionId();
  const device = await describeDevice();
  const expiresAt = sessionExpiry();

  sessionRepository.create({ id, userId, expiresAt, ...device });

  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    // secure только по HTTPS: иначе кука не поставится при разработке на
    // http://localhost, и войти будет нельзя.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });

  return id;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function currentSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Текущий пользователь или null. Заодно продлевает отметку активности сессии. */
export async function currentAuth(): Promise<{ user: User; sessionId: string } | null> {
  const sessionId = await currentSessionId();
  if (!sessionId) return null;

  const session = sessionRepository.findValid(sessionId);
  if (!session) return null;

  const user = userRepository.findById(session.userId);
  if (!user) return null;

  sessionRepository.touch(sessionId);
  return { user, sessionId };
}

export async function requireAuth(): Promise<{ user: User; sessionId: string }> {
  const auth = await currentAuth();
  if (!auth) throw ApiError.unauthorized();
  if (auth.user.status === "blocked") throw ApiError.auth(403, "account_blocked");
  return auth;
}
