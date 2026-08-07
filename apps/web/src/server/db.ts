import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * База данных сервера.
 *
 * SQLite из стандартной библиотеки Node — потому что для этого этапа никакой
 * инфраструктуры не нужно: ни отдельного процесса, ни строки подключения, ни
 * докера. База — один файл, который переживает перезапуск сервера и виден всем
 * устройствам, заходящим на этот сервер. Именно этого не хватало IndexedDB:
 * данные жили в одном браузере.
 *
 * Что придётся поменять при выходе за пределы одной машины: SQLite пишет в
 * локальный файл, поэтому на площадках с эфемерной файловой системой (Vercel и
 * подобные) данные потеряются между запусками. Переезд на PostgreSQL меняет
 * этот файл и запросы в репозиториях; ни маршруты, ни клиент об этом не знают.
 */

const DEFAULT_PATH = resolve(process.cwd(), ".data/avatar.sqlite");

/**
 * Схема версионируется через `user_version`: миграции применяются по порядку и
 * ровно один раз. Отдельная таблица для этого не нужна — счётчик встроен в
 * файл базы.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id                 TEXT PRIMARY KEY,
    first_name         TEXT NOT NULL,
    last_name          TEXT NOT NULL,
    email              TEXT NOT NULL UNIQUE,
    email_verified_at  TEXT,
    avatar_url         TEXT,
    role               TEXT NOT NULL,
    status             TEXT NOT NULL,
    interface_language TEXT NOT NULL DEFAULT 'ru',
    last_login_at      TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );

  CREATE TABLE credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    salt    TEXT NOT NULL,
    hash    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_label TEXT NOT NULL,
    browser      TEXT,
    os           TEXT,
    ip_address   TEXT,
    location     TEXT,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL
  );
  CREATE INDEX sessions_by_user ON sessions(user_id);

  CREATE TABLE verification_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose    TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX tokens_by_user ON verification_tokens(user_id, purpose);
  `,
];

let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (instance) return instance;

  const path = process.env.DATABASE_FILE ?? DEFAULT_PATH;
  mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  // Внешние ключи в SQLite выключены по умолчанию: без этого удаление
  // пользователя оставило бы висящие сессии и токены.
  db.exec("PRAGMA foreign_keys = ON");
  // WAL — чтобы чтение не блокировалось записью: маршруты обрабатываются
  // параллельно, и без него одна запись останавливала бы все остальные запросы.
  db.exec("PRAGMA journal_mode = WAL");

  migrate(db);
  instance = db;
  return db;
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  const applied = row.user_version;

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
