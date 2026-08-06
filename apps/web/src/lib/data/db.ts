import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Asset,
  Avatar,
  ConsentRecord,
  CreditAccount,
  CreditHold,
  CreditTransaction,
  GenerationJob,
  Project,
  ProjectDocument,
  Voice,
} from "@avatar/contracts";

/**
 * Локальное хранилище первого этапа. Схема повторяет будущие таблицы, чтобы
 * переезд на настоящий бэкенд был заменой реализации портов, а не пересмотром
 * структуры данных.
 */
export interface AvatarDB extends DBSchema {
  avatars: { key: string; value: Avatar };
  voices: { key: string; value: Voice };
  projects: { key: string; value: Project };
  documents: { key: string; value: ProjectDocument };
  assets: {
    key: string;
    value: Asset;
    indexes: { "by-project": string };
  };
  consents: { key: string; value: ConsentRecord };
  creditAccounts: { key: string; value: CreditAccount };
  creditHolds: {
    key: string;
    value: CreditHold;
    indexes: { "by-job": string };
  };
  creditTransactions: {
    key: string;
    value: CreditTransaction;
    indexes: { "by-user": string };
  };
  jobs: {
    key: string;
    value: GenerationJob;
    indexes: { "by-project": string };
  };
}

const DB_NAME = "avatar-studio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AvatarDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AvatarDB>> {
  if (typeof indexedDB === "undefined") {
    // Порты вызываются только из клиентских компонентов; явная ошибка лучше,
    // чем молчаливый пустой результат при случайном вызове на сервере.
    return Promise.reject(
      new Error("IndexedDB недоступна: слой данных работает только в браузере"),
    );
  }

  dbPromise ??= openDB<AvatarDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("avatars", { keyPath: "id" });
      db.createObjectStore("voices", { keyPath: "id" });
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("documents", { keyPath: "projectId" });
      db.createObjectStore("consents", { keyPath: "id" });
      db.createObjectStore("creditAccounts", { keyPath: "userId" });

      const assets = db.createObjectStore("assets", { keyPath: "id" });
      assets.createIndex("by-project", "projectId");

      const holds = db.createObjectStore("creditHolds", { keyPath: "id" });
      holds.createIndex("by-job", "jobId");

      const transactions = db.createObjectStore("creditTransactions", { keyPath: "id" });
      transactions.createIndex("by-user", "userId");

      const jobs = db.createObjectStore("jobs", { keyPath: "id" });
      jobs.createIndex("by-project", "projectId");
    },
  });

  return dbPromise;
}

/** Сброс базы — нужен для повторного посева демо-данных. */
export async function resetDb(): Promise<void> {
  const db = await getDb();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
