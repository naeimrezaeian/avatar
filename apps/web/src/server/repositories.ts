import "server-only";
import { Session, User, type VerificationPurpose } from "@avatar/contracts";
import { getDb } from "./db";

/**
 * Доступ к таблицам. Наружу отдаются разобранные схемами объекты контрактов, а
 * не строки базы: форма ответа обязана совпадать с тем, что ждёт клиент, и
 * проверять это должен zod, а не внимательность.
 */

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  email_verified_at: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  interface_language: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  device_label: string;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  location: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
};

type TokenRow = {
  id: string;
  user_id: string;
  purpose: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}

function toUser(row: UserRow): User {
  return User.parse({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
    interfaceLanguage: row.interface_language,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toSession(row: SessionRow, currentSessionId: string | null): Session {
  return Session.parse({
    id: row.id,
    userId: row.user_id,
    deviceLabel: row.device_label,
    browser: row.browser,
    os: row.os,
    ipAddress: row.ip_address,
    location: row.location,
    isCurrent: row.id === currentSessionId,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  });
}

/** Адреса сравниваются без учёта регистра: Ivan@ и ivan@ — один человек. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const userRepository = {
  findById(id: string): User | null {
    const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | UserRow
      | undefined;
    return row ? toUser(row) : null;
  },

  findByEmail(email: string): User | null {
    const row = getDb()
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(normalizeEmail(email)) as UserRow | undefined;
    return row ? toUser(row) : null;
  },

  list(): User[] {
    const rows = getDb()
      .prepare("SELECT * FROM users ORDER BY created_at DESC")
      .all() as UserRow[];
    return rows.map(toUser);
  },

  insert(user: User): User {
    getDb()
      .prepare(
        `INSERT INTO users (id, first_name, last_name, email, email_verified_at, avatar_url,
                            role, status, interface_language, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        user.firstName,
        user.lastName,
        normalizeEmail(user.email),
        user.emailVerifiedAt,
        user.avatarUrl,
        user.role,
        user.status,
        user.interfaceLanguage,
        user.lastLoginAt,
        user.createdAt,
        user.updatedAt,
      );
    return user;
  },

  update(id: string, patch: Partial<User>): User {
    const current = userRepository.findById(id);
    if (!current) throw new Error(`Пользователь ${id} не найден`);

    const next = User.parse({ ...current, ...patch, id, updatedAt: nowIso() });
    getDb()
      .prepare(
        `UPDATE users SET first_name = ?, last_name = ?, email = ?, email_verified_at = ?,
                          avatar_url = ?, role = ?, status = ?, interface_language = ?,
                          last_login_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.firstName,
        next.lastName,
        normalizeEmail(next.email),
        next.emailVerifiedAt,
        next.avatarUrl,
        next.role,
        next.status,
        next.interfaceLanguage,
        next.lastLoginAt,
        next.updatedAt,
        id,
      );
    return next;
  },
};

export const credentialRepository = {
  find(userId: string): { salt: string; hash: string } | null {
    const row = getDb()
      .prepare("SELECT salt, hash FROM credentials WHERE user_id = ?")
      .get(userId) as { salt: string; hash: string } | undefined;
    return row ?? null;
  },

  put(userId: string, salt: string, hash: string): void {
    getDb()
      .prepare(
        `INSERT INTO credentials (user_id, salt, hash) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, hash = excluded.hash`,
      )
      .run(userId, salt, hash);
  },
};

export const sessionRepository = {
  create(input: {
    id: string;
    userId: string;
    deviceLabel: string;
    browser: string | null;
    os: string | null;
    ipAddress: string | null;
    expiresAt: string;
  }): void {
    const timestamp = nowIso();
    getDb()
      .prepare(
        `INSERT INTO sessions (id, user_id, device_label, browser, os, ip_address, location,
                               created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.userId,
        input.deviceLabel,
        input.browser,
        input.os,
        input.ipAddress,
        timestamp,
        timestamp,
        input.expiresAt,
      );
  },

  /**
   * Действующая сессия. Просроченная удаляется на месте: держать в базе то, что
   * уже не даёт доступа, незачем, а чистка по расписанию потребовала бы
   * планировщика.
   */
  findValid(id: string): { userId: string } | null {
    const db = getDb();
    const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").get(id) as
      | { user_id: string; expires_at: string }
      | undefined;
    if (!row) return null;

    if (row.expires_at <= nowIso()) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      return null;
    }
    return { userId: row.user_id };
  },

  touch(id: string): void {
    getDb().prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), id);
  },

  listByUser(userId: string, currentSessionId: string | null): Session[] {
    const rows = getDb()
      .prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC")
      .all(userId) as SessionRow[];
    return rows.map((row) => toSession(row, currentSessionId));
  },

  remove(id: string): void {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },

  removeOthers(userId: string, keepSessionId: string): void {
    getDb()
      .prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?")
      .run(userId, keepSessionId);
  },

  removeAll(userId: string): void {
    getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  },
};

export const tokenRepository = {
  create(input: {
    id: string;
    userId: string;
    purpose: VerificationPurpose;
    tokenHash: string;
    expiresAt: string;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO verification_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(input.id, input.userId, input.purpose, input.tokenHash, input.expiresAt, nowIso());
  },

  findByHash(tokenHash: string): TokenRow | null {
    const row = getDb()
      .prepare("SELECT * FROM verification_tokens WHERE token_hash = ?")
      .get(tokenHash) as TokenRow | undefined;
    return row ?? null;
  },

  markUsed(id: string): void {
    getDb()
      .prepare("UPDATE verification_tokens SET used_at = ? WHERE id = ?")
      .run(nowIso(), id);
  },

  /** Прежние неиспользованные токены той же цели гасятся при выдаче новой ссылки. */
  invalidate(userId: string, purpose: VerificationPurpose): void {
    getDb()
      .prepare(
        "UPDATE verification_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL",
      )
      .run(nowIso(), userId, purpose);
  },
};
