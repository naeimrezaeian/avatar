import "fake-indexeddb/auto";

// В Node нет localStorage, а локальная реализация хранит в нём идентификатор
// сессии. Подменяем минимальной версией до импорта модуля аутентификации.
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
  const { localAuthService } = await import("../src/lib/auth/local-auth");
  const { AuthError } = await import("../src/lib/auth/ports");
  const { getDb } = await import("../src/lib/data/db");

  let failures = 0;
  function check(label: string, condition: boolean, detail = "") {
    if (!condition) failures += 1;
    console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  }

  async function expectAuthError(action: () => Promise<unknown>): Promise<string | null> {
    try {
      await action();
      return null;
    } catch (error) {
      return error instanceof AuthError ? error.code : `не AuthError: ${String(error)}`;
    }
  }

  const EMAIL = "tester@example.com";
  const PASSWORD = "pervyiparol1";
  const NEW_PASSWORD = "vtoroiparol22";

  // --- Регистрация ---
  const registered = await localAuthService.register({
    firstName: "Иван",
    lastName: "Петров",
    email: EMAIL,
    password: PASSWORD,
  });
  check("учётная запись создана", registered.user.email === EMAIL);
  check("до подтверждения статус pending_verification", registered.user.status === "pending_verification");
  check("выдана ссылка подтверждения", registered.email.link.includes("/verify-email?token="));

  const db = await getDb();
  const account = await db.get("creditAccounts", registered.user.id);
  check("новому пользователю начислен стартовый пакет", (account?.balanceSeconds ?? 0) > 0, `${account?.balanceSeconds} с`);

  const storedToken = (await db.getAll("verificationTokens"))[0];
  const rawToken = registered.email.link.split("token=")[1]!;
  check("в базе лежит только хэш токена", storedToken?.tokenHash !== rawToken);

  const credentials = await db.get("credentials", registered.user.id);
  check("пароль не хранится в открытом виде", credentials?.hash !== PASSWORD);
  check("у пароля своя соль", (credentials?.salt.length ?? 0) === 32);

  // --- Повторная регистрация того же адреса ---
  check(
    "повторная регистрация отклонена",
    (await expectAuthError(() =>
      localAuthService.register({ firstName: "И", lastName: "П", email: EMAIL, password: PASSWORD }),
    )) === "email_taken",
  );

  // --- Регистр адреса не создаёт вторую запись ---
  check(
    "адрес в другом регистре считается тем же",
    (await expectAuthError(() =>
      localAuthService.register({
        firstName: "И",
        lastName: "П",
        email: EMAIL.toUpperCase(),
        password: PASSWORD,
      }),
    )) === "email_taken",
  );

  // --- Вход до подтверждения ---
  check(
    "вход до подтверждения запрещён",
    (await expectAuthError(() => localAuthService.login({ email: EMAIL, password: PASSWORD }))) ===
      "email_not_verified",
  );

  // --- Подтверждение почты ---
  const verified = await localAuthService.verifyEmail(rawToken);
  check("после подтверждения статус active", verified.status === "active");
  check("проставлена дата подтверждения", verified.emailVerifiedAt !== null);
  check(
    "повторное использование токена отклонено",
    (await expectAuthError(() => localAuthService.verifyEmail(rawToken))) === "token_invalid",
  );

  // --- Вход ---
  check(
    "неверный пароль отклонён",
    (await expectAuthError(() => localAuthService.login({ email: EMAIL, password: "nepravilny1" }))) ===
      "invalid_credentials",
  );
  check(
    "несуществующий адрес даёт тот же код ошибки",
    (await expectAuthError(() =>
      localAuthService.login({ email: "nikto@example.com", password: PASSWORD }),
    )) === "invalid_credentials",
  );

  const loggedIn = await localAuthService.login({ email: EMAIL, password: PASSWORD });
  check("вход выполнен", loggedIn.user.id === registered.user.id);
  check("создана сессия", loggedIn.session.userId === registered.user.id);
  check("отмечено время последнего входа", loggedIn.user.lastLoginAt !== null);

  const current = await localAuthService.current();
  check("текущий пользователь определяется", current?.user.id === registered.user.id);

  // --- Сессии ---
  const sessions = await localAuthService.listSessions();
  check("текущая сессия помечена", sessions.filter((s) => s.isCurrent).length === 1);

  await db.put("sessions", { ...loggedIn.session, id: "ses_other", isCurrent: false });
  check("вторая сессия видна в списке", (await localAuthService.listSessions()).length === 2);

  await localAuthService.revokeOtherSessions();
  const afterRevoke = await localAuthService.listSessions();
  check("выход с других устройств оставил только текущую", afterRevoke.length === 1);
  check("текущая сессия сохранилась", afterRevoke[0]?.isCurrent === true);

  // --- Смена пароля из настроек ---
  check(
    "смена пароля с неверным текущим отклонена",
    (await expectAuthError(() =>
      localAuthService.changePassword({ currentPassword: "nevernyi123", newPassword: NEW_PASSWORD }),
    )) === "invalid_credentials",
  );

  // --- Сброс пароля ---
  const resetEmail = await localAuthService.requestPasswordReset(EMAIL);
  check("выдана ссылка сброса", resetEmail?.link.includes("/reset-password?token=") === true);
  check(
    "сброс для несуществующего адреса ничего не выдаёт",
    (await localAuthService.requestPasswordReset("nikto@example.com")) === null,
  );

  const resetToken = resetEmail!.link.split("token=")[1]!;
  await localAuthService.resetPassword(resetToken, NEW_PASSWORD);

  check("после сброса сессии завершены", (await localAuthService.current()) === null);
  check(
    "старый пароль больше не подходит",
    (await expectAuthError(() => localAuthService.login({ email: EMAIL, password: PASSWORD }))) ===
      "invalid_credentials",
  );

  const relogin = await localAuthService.login({ email: EMAIL, password: NEW_PASSWORD });
  check("новый пароль работает", relogin.user.id === registered.user.id);

  // --- Просроченный токен ---
  const expiredEmail = await localAuthService.requestPasswordReset(EMAIL);
  const expiredRaw = expiredEmail!.link.split("token=")[1]!;
  const tokens = await db.getAll("verificationTokens");
  const expiredRecord = tokens.find((t) => t.purpose === "password_reset" && t.usedAt === null)!;
  await db.put("verificationTokens", {
    ...expiredRecord,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  check(
    "просроченный токен отклонён",
    (await expectAuthError(() => localAuthService.resetPassword(expiredRaw, "eshepar0l1"))) ===
      "token_expired",
  );

  // --- Блокировка ---
  const blockedUser = await db.get("users", registered.user.id);
  await db.put("users", { ...blockedUser!, status: "blocked" as const });
  check(
    "заблокированная запись не пускает",
    (await expectAuthError(() => localAuthService.login({ email: EMAIL, password: NEW_PASSWORD }))) ===
      "account_blocked",
  );
  check("блокировка обрывает текущую сессию", (await localAuthService.current()) === null);

  console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);

}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
