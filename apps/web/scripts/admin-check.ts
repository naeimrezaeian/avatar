import "fake-indexeddb/auto";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
  configurable: true,
});

async function main() {
  const { dataClient } = await import("../src/lib/data/index");
  const { seedIfEmpty } = await import("../src/lib/data/seed");
  const { getDb } = await import("../src/lib/data/db");

  let failures = 0;
  function check(label: string, condition: boolean, detail = "") {
    if (!condition) failures += 1;
    console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  }

  await seedIfEmpty();
  const db = await getDb();

  // Учётные записи и права проверяются по HTTP в scripts/api-check.mjs: ими
  // владеет сервер, и вызвать сводку отсюда нельзя — она за ними ходит.
  const userId = "usr_demo";

  // --- Кредиты ---
  const granted = await dataClient.admin.adjustCredits({
    userId,
    deltaSeconds: 600,
    note: "Тестовое начисление",
    actorUserId: userId,
  });
  check("начисление увеличило баланс", granted.balanceSeconds === 3300, `${granted.balanceSeconds}`);

  const transactions = await dataClient.credits.listTransactions(userId);
  const adjustment = transactions.find((item) => item.kind === "admin_adjust");
  check("записана транзакция корректировки", adjustment !== undefined);
  check("в транзакции указан автор операции", adjustment?.actorUserId === userId);
  check("в транзакции сохранён комментарий", adjustment?.note === "Тестовое начисление");

  const deducted = await dataClient.admin.adjustCredits({
    userId,
    deltaSeconds: -300,
    note: "Тестовое списание",
    actorUserId: userId,
  });
  check("списание уменьшило баланс", deducted.balanceSeconds === 3000, `${deducted.balanceSeconds}`);

  // Резерв нельзя списать: он удерживается под уже запущенные задачи.
  const account = await db.get("creditAccounts", userId);
  await db.put("creditAccounts", { ...account!, reservedSeconds: 2900 });

  let rejected = false;
  try {
    await dataClient.admin.adjustCredits({
      userId,
      deltaSeconds: -500,
      note: "Слишком много",
      actorUserId: userId,
    });
  } catch {
    rejected = true;
  }
  check("списание зарезервированных средств отклонено", rejected);

  const restored = await db.get("creditAccounts", userId);
  check("после отказа баланс не изменился", restored?.balanceSeconds === 3000);
  await db.put("creditAccounts", { ...restored!, reservedSeconds: 0 });

  let zeroRejected = false;
  try {
    await dataClient.admin.adjustCredits({
      userId,
      deltaSeconds: 0,
      note: "Ноль",
      actorUserId: userId,
    });
  } catch {
    zeroRejected = true;
  }
  check("нулевая корректировка отклонена", zeroRejected);

  // --- Очередь ---
  const allJobs = await dataClient.admin.listJobs();
  const activeJobs = await dataClient.admin.listJobs({ active: true });
  check("очередь читается", Array.isArray(allJobs));
  check("активных задач не больше, чем всех", activeJobs.length <= allJobs.length);

  console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
