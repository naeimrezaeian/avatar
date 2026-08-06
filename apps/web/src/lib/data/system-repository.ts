import {
  DEFAULT_SYSTEM_SETTINGS,
  Notification,
  Plan,
  SystemLogEntry,
  SystemSettings,
  type LogLevel,
  type NotificationKind,
} from "@avatar/contracts";
import { getDb, newId, nowIso } from "./db";

/** Сколько записей журнала держим: локальное хранилище не безразмерно. */
const LOG_LIMIT = 500;

export const settingsRepository = {
  async get(): Promise<SystemSettings> {
    const db = await getDb();
    const stored = await db.get("settings", "system");
    if (stored) return stored;

    const timestamp = nowIso();
    const created = SystemSettings.parse({
      ...DEFAULT_SYSTEM_SETTINGS,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.put("settings", created);
    return created;
  },

  async update(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    const db = await getDb();
    const current = await settingsRepository.get();
    const next = SystemSettings.parse({ ...current, ...patch, id: "system", updatedAt: nowIso() });
    await db.put("settings", next);
    return next;
  },
};

export const logRepository = {
  /**
   * Запись в журнал не должна ронять действие, которое её породила: журнал —
   * вспомогательный механизм, и его сбой не повод отменять успешную операцию.
   */
  async write(input: {
    level: LogLevel;
    scope: string;
    message: string;
    actorUserId?: string | null;
    targetId?: string | null;
  }): Promise<void> {
    try {
      const db = await getDb();
      await db.put(
        "systemLog",
        SystemLogEntry.parse({
          id: newId("log"),
          level: input.level,
          scope: input.scope,
          message: input.message,
          actorUserId: input.actorUserId ?? null,
          targetId: input.targetId ?? null,
          createdAt: nowIso(),
        }),
      );

      const all = await db.getAll("systemLog");
      if (all.length > LOG_LIMIT) {
        const excess = all
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(0, all.length - LOG_LIMIT);
        await Promise.all(excess.map((entry) => db.delete("systemLog", entry.id)));
      }
    } catch {
      // Намеренно молча: см. комментарий выше.
    }
  },

  async list(filter?: { level?: LogLevel; scope?: string }): Promise<SystemLogEntry[]> {
    const db = await getDb();
    const all = await db.getAll("systemLog");
    return all
      .filter((entry) => filter?.level === undefined || entry.level === filter.level)
      .filter((entry) => filter?.scope === undefined || entry.scope === filter.scope)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async clear(): Promise<void> {
    const db = await getDb();
    await db.clear("systemLog");
  },
};

export const notificationRepository = {
  async list(userId: string): Promise<Notification[]> {
    const db = await getDb();
    const all = await db.getAllFromIndex("notifications", "by-user", userId);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async unreadCount(userId: string): Promise<number> {
    const all = await notificationRepository.list(userId);
    return all.filter((item) => item.readAt === null).length;
  },

  async create(input: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body?: string;
    href?: string | null;
  }): Promise<Notification> {
    const db = await getDb();
    const notification = Notification.parse({
      id: newId("ntf"),
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? "",
      href: input.href ?? null,
      createdAt: nowIso(),
    });
    await db.put("notifications", notification);
    return notification;
  },

  async markRead(id: string): Promise<void> {
    const db = await getDb();
    const notification = await db.get("notifications", id);
    if (!notification || notification.readAt !== null) return;
    await db.put("notifications", { ...notification, readAt: nowIso() });
  },

  async markAllRead(userId: string): Promise<void> {
    const db = await getDb();
    const all = await db.getAllFromIndex("notifications", "by-user", userId);
    const timestamp = nowIso();
    await Promise.all(
      all
        .filter((item) => item.readAt === null)
        .map((item) => db.put("notifications", { ...item, readAt: timestamp })),
    );
  },

  async clear(userId: string): Promise<void> {
    const db = await getDb();
    const all = await db.getAllFromIndex("notifications", "by-user", userId);
    await Promise.all(all.map((item) => db.delete("notifications", item.id)));
  },
};

export const planRepository = {
  async list(includeInactive = false): Promise<Plan[]> {
    const db = await getDb();
    const all = await db.getAll("plans");
    return all
      .filter((plan) => includeInactive || plan.isActive)
      .sort((a, b) => a.monthlySeconds - b.monthlySeconds);
  },

  async upsert(plan: Plan): Promise<Plan> {
    const db = await getDb();
    const next = Plan.parse({ ...plan, updatedAt: nowIso() });
    await db.put("plans", next);
    return next;
  },

  async setActive(id: string, isActive: boolean): Promise<Plan> {
    const db = await getDb();
    const plan = await db.get("plans", id);
    if (!plan) throw new Error(`Тариф ${id} не найден`);
    const next = Plan.parse({ ...plan, isActive, updatedAt: nowIso() });
    await db.put("plans", next);
    return next;
  },
};
