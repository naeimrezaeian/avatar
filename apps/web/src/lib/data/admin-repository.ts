import { CreditAccount, CreditTransaction, User } from "@avatar/contracts";
import { getDb, newId, nowIso } from "./db";
import type { AdminRepository, AdminStats, AdminUserRow } from "./ports";

/**
 * Сводки для панели администратора.
 *
 * Всё считается перебором записей — на локальном хранилище это допустимо, но
 * на сервере такие цифры обязаны приходить из агрегатов, а не из выборки всех
 * пользователей в память.
 */
export const adminRepository: AdminRepository = {
  async stats(): Promise<AdminStats> {
    const db = await getDb();
    const [users, avatars, projects, renders, jobs, transactions] = await Promise.all([
      db.getAll("users"),
      db.getAll("avatars"),
      db.getAll("projects"),
      db.getAll("renderVersions"),
      db.getAll("jobs"),
      db.getAll("creditTransactions"),
    ]);

    const liveProjects = projects.filter((project) => project.deletedAt === null);
    const liveAvatars = avatars.filter((avatar) => avatar.deletedAt === null);

    return {
      usersTotal: users.length,
      usersActive: users.filter((user) => user.status === "active").length,
      usersBlocked: users.filter((user) => user.status === "blocked").length,
      avatarsTotal: liveAvatars.length,
      avatarsReady: liveAvatars.filter((avatar) => avatar.status === "ready").length,
      projectsTotal: liveProjects.length,
      rendersTotal: renders.length,
      jobsActive: jobs.filter((job) => job.status === "queued" || job.status === "running").length,
      jobsFailed: jobs.filter((job) => job.status === "failed").length,
      // Сколько секунд видео реально произведено — по успешным задачам, а не
      // по запущенным: упавшие ничего не произвели и в статистику попадать не
      // должны.
      generatedSeconds: jobs
        .filter((job) => job.status === "succeeded" && job.kind !== "tts")
        .reduce((sum, job) => sum + job.estimatedCostSeconds, 0),
      spentSeconds: transactions
        .filter((item) => item.kind === "spend")
        .reduce((sum, item) => sum + Math.abs(item.deltaSeconds), 0),
      grantedSeconds: transactions
        .filter((item) => item.kind === "grant" || item.kind === "admin_adjust")
        .reduce((sum, item) => sum + Math.max(0, item.deltaSeconds), 0),
    };
  },

  async listUsers(): Promise<AdminUserRow[]> {
    const db = await getDb();
    const [users, accounts, projects, avatars, transactions] = await Promise.all([
      db.getAll("users"),
      db.getAll("creditAccounts"),
      db.getAll("projects"),
      db.getAll("avatars"),
      db.getAll("creditTransactions"),
    ]);

    return users
      .map((user) => ({
        user,
        account: accounts.find((item) => item.userId === user.id) ?? null,
        projectCount: projects.filter(
          (project) => project.userId === user.id && project.deletedAt === null,
        ).length,
        avatarCount: avatars.filter(
          (avatar) => avatar.userId === user.id && avatar.deletedAt === null,
        ).length,
        spentSeconds: transactions
          .filter((item) => item.userId === user.id && item.kind === "spend")
          .reduce((sum, item) => sum + Math.abs(item.deltaSeconds), 0),
      }))
      .sort((a, b) => a.user.createdAt.localeCompare(b.user.createdAt));
  },

  async setRole(userId, role) {
    const db = await getDb();
    const user = await db.get("users", userId);
    if (!user) throw new Error(`Пользователь ${userId} не найден`);

    const next = User.parse({ ...user, role, updatedAt: nowIso() });
    await db.put("users", next);
    return next;
  },

  async setStatus(userId, status) {
    const db = await getDb();
    const user = await db.get("users", userId);
    if (!user) throw new Error(`Пользователь ${userId} не найден`);

    const next = User.parse({ ...user, status, updatedAt: nowIso() });
    await db.put("users", next);

    // Блокировка завершает сессии: иначе заблокированный продолжит работать до
    // истечения своей сессии.
    if (status === "blocked") {
      const sessions = await db.getAllFromIndex("sessions", "by-user", userId);
      await Promise.all(sessions.map((session) => db.delete("sessions", session.id)));
    }

    return next;
  },

  async adjustCredits({ userId, deltaSeconds, note, actorUserId }) {
    if (deltaSeconds === 0) throw new Error("Изменение баланса должно быть ненулевым");

    const db = await getDb();
    const account = await db.get("creditAccounts", userId);
    if (!account) throw new Error("Счёт кредитов не найден");

    // Списывать можно только свободные средства: зарезервированные удерживаются
    // под уже запущенные задачи, и увести их в минус — значит сломать возврат.
    const free = account.balanceSeconds - account.reservedSeconds;
    if (deltaSeconds < 0 && free + deltaSeconds < 0) {
      throw new Error(`Свободно только ${free} с: часть баланса удерживается под задачами`);
    }

    const timestamp = nowIso();
    const next = CreditAccount.parse({
      ...account,
      balanceSeconds: account.balanceSeconds + deltaSeconds,
      updatedAt: timestamp,
    });

    const transaction = CreditTransaction.parse({
      id: newId("ctx"),
      userId,
      kind: "admin_adjust",
      deltaSeconds,
      balanceAfterSeconds: next.balanceSeconds,
      actorUserId,
      note,
      createdAt: timestamp,
    });

    const tx = db.transaction(["creditAccounts", "creditTransactions"], "readwrite");
    await Promise.all([
      tx.objectStore("creditAccounts").put(next),
      tx.objectStore("creditTransactions").put(transaction),
      tx.done,
    ]);

    return next;
  },

  async listJobs(filter) {
    const db = await getDb();
    const jobs = await db.getAll("jobs");
    const filtered =
      filter?.active === true
        ? jobs.filter((job) => job.status === "queued" || job.status === "running")
        : jobs;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
