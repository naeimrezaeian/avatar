"use client";

import {
  AUTH_ERROR_MESSAGES,
  AuthErrorCode,
  Session,
  User,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type UpdateProfileInput,
} from "@avatar/contracts";
import { AuthError, type AuthService, type PendingEmail } from "./ports";

/**
 * Аутентификация через сервер.
 *
 * Заменяет браузерную реализацию целиком: пароль сюда не попадает дальше тела
 * запроса, решение принимает сервер, а идентификатор сессии живёт в
 * httpOnly-куке, недоступной скриптам. Порт AuthService не изменился — экраны
 * входа, регистрации и настроек продолжают работать с тем же интерфейсом.
 */

const AUTH_CODES = new Set<string>(AuthErrorCode.options);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      // Кука ставится и читается только для своего же источника; явное
      // указание защищает от настроек, где fetch по умолчанию их не шлёт.
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Сервер недоступен. Проверьте соединение и повторите попытку");
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | T
    | null;

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } })?.error;
    const code = error?.code ?? "internal";
    // Коды ошибок аутентификации поднимаются как AuthError: формы разбирают
    // именно их, чтобы предложить нужное действие — например, отправить письмо
    // с подтверждением заново.
    if (AUTH_CODES.has(code)) {
      const parsed = AuthErrorCode.parse(code);
      throw new AuthError(parsed, error?.message ?? AUTH_ERROR_MESSAGES[parsed]);
    }
    throw new Error(error?.message ?? "Не удалось выполнить запрос");
  }

  return payload as T;
}

/**
 * Сигнал другим вкладкам. Куку скрипты не видят, поэтому о входе и выходе
 * соседние вкладки узнают отсюда — иначе одна вкладка продолжала бы показывать
 * кабинет уже вышедшего пользователя.
 */
const AUTH_BROADCAST_KEY = "avatar-studio.auth";

function announce(): void {
  localStorage.setItem(AUTH_BROADCAST_KEY, String(Date.now()));
}

export const httpAuthService: AuthService = {
  async current() {
    const data = await request<{ user: unknown; session: unknown } | null>("/me");
    if (!data) return null;
    return { user: User.parse(data.user), session: Session.parse(data.session) };
  },

  async register(input: RegisterInput) {
    const data = await request<{ user: unknown; email: PendingEmail }>("/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { user: User.parse(data.user), email: data.email };
  },

  async login(input: LoginInput) {
    const data = await request<{ user: unknown; session: unknown }>("/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    announce();
    return { user: User.parse(data.user), session: Session.parse(data.session) };
  },

  async logout() {
    await request<void>("/logout", { method: "POST" });
    announce();
  },

  async verifyEmail(token: string) {
    const data = await request<{ user: unknown }>("/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return User.parse(data.user);
  },

  async resendVerification(email: string) {
    const data = await request<{ email: PendingEmail | null }>("/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return data.email;
  },

  async requestPasswordReset(email: string) {
    const data = await request<{ email: PendingEmail | null }>("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return data.email;
  },

  async resetPassword(token: string, newPassword: string) {
    await request<void>("/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password: newPassword }),
    });
    announce();
  },

  async changePassword(input: ChangePasswordInput) {
    await request<void>("/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateProfile(input: UpdateProfileInput) {
    const data = await request<{ user: unknown }>("/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return User.parse(data.user);
  },

  async listSessions() {
    const data = await request<{ sessions: unknown[] }>("/sessions");
    return data.sessions.map((item) => Session.parse(item));
  },

  async revokeSession(sessionId: string) {
    await request<void>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  },

  async revokeOtherSessions() {
    await request<void>("/sessions", { method: "DELETE" });
  },
};

export { AUTH_BROADCAST_KEY };
