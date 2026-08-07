/**
 * Проверки серверной аутентификации по HTTP.
 *
 * Гоняет настоящие запросы к запущенному серверу, а не вызывает функции: смысл
 * переезда был в том, чтобы решение принимал сервер, и проверять это нужно
 * снаружи — вместе с кукой, кодами ответов и перенаправлениями proxy.
 *
 * Запуск: npm run check:api (сервер должен быть поднят).
 */

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

let failures = 0;
function check(label, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Банка для кук: fetch в Node их не хранит, а вся проверка держится на том,
 * что сессия ездит именно в куке.
 */
function makeJar() {
  const jar = new Map();
  return {
    header() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    absorb(response) {
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(";");
        const index = pair.indexOf("=");
        const name = pair.slice(0, index);
        const value = pair.slice(index + 1);
        if (value === "" || /expires=Thu, 01 Jan 1970/i.test(raw)) jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    },
    has(name) {
      return jar.has(name);
    },
    raw(response) {
      return response.headers.getSetCookie().join(" | ");
    },
  };
}

async function call(jar, path, { method = "GET", body, redirect = "manual" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect,
    headers: {
      cookie: jar.header(),
      ...(body ? { "content-type": "application/json" } : {}),
      "user-agent": "api-check/1.0 (Macintosh; Mac OS X) Chrome/1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  jar.absorb(response);

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data, location: response.headers.get("location") };
}

const stamp = Date.now();
const EMAIL = `check.${stamp}@example.com`;
const PASSWORD = "proverka2026";
const NEW_PASSWORD = "drugoiparol1";

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "naeimwtg@gmail.com";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "avatar2026demo";

const SESSION_COOKIE = "avatar_session";

async function main() {
  const guest = makeJar();

  // --- Защита маршрутов ---
  const dashboard = await call(guest, "/dashboard");
  check("гостя уводит со страницы кабинета", dashboard.status === 307, `${dashboard.status}`);
  check(
    "адрес назначения сохранён в next",
    (dashboard.location ?? "").includes("next=%2Fdashboard"),
    dashboard.location ?? "нет заголовка",
  );

  const meAnon = await call(guest, "/api/auth/me");
  check("без сессии /me отвечает null", meAnon.status === 200 && meAnon.data === null);

  const sessionsAnon = await call(guest, "/api/auth/sessions");
  check("без сессии список сессий закрыт", sessionsAnon.status === 401, `${sessionsAnon.status}`);

  const adminAnon = await call(guest, "/api/admin/users");
  check("без сессии список пользователей закрыт", adminAnon.status === 401);

  // --- Регистрация ---
  const registered = await call(guest, "/api/auth/register", {
    method: "POST",
    body: { firstName: "Иван", lastName: "Петров", email: EMAIL, password: PASSWORD },
  });
  check("регистрация принята", registered.status === 201, `${registered.status}`);
  check("выдана ссылка подтверждения", typeof registered.data?.email?.link === "string");
  check(
    "новая запись ждёт подтверждения",
    registered.data?.user?.status === "pending_verification",
  );

  const duplicate = await call(guest, "/api/auth/register", {
    method: "POST",
    body: { firstName: "Иван", lastName: "Петров", email: EMAIL, password: PASSWORD },
  });
  check("повторная регистрация отклонена", duplicate.data?.error?.code === "email_taken");

  const weak = await call(guest, "/api/auth/register", {
    method: "POST",
    body: { firstName: "И", lastName: "П", email: `w.${stamp}@example.com`, password: "korotko" },
  });
  check("короткий пароль отклонён", weak.status === 400, `${weak.status}`);

  // --- Подтверждение почты ---
  const beforeVerify = await call(guest, "/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  check(
    "без подтверждения войти нельзя",
    beforeVerify.data?.error?.code === "email_not_verified",
    beforeVerify.data?.error?.code,
  );

  const token = new URL(registered.data.email.link, BASE).searchParams.get("token");
  const verified = await call(guest, "/api/auth/verify-email", {
    method: "POST",
    body: { token },
  });
  check("почта подтверждена", verified.data?.user?.status === "active");

  const reused = await call(guest, "/api/auth/verify-email", { method: "POST", body: { token } });
  check("повторное использование токена отклонено", reused.data?.error?.code === "token_invalid");

  // --- Вход ---
  const wrongPassword = await call(guest, "/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: "sovsemnetot1" },
  });
  check("неверный пароль отклонён", wrongPassword.data?.error?.code === "invalid_credentials");

  const unknown = await call(guest, "/api/auth/login", {
    method: "POST",
    body: { email: `nikto.${stamp}@example.com`, password: PASSWORD },
  });
  check(
    "несуществующий адрес отвечает тем же кодом",
    unknown.data?.error?.code === "invalid_credentials",
  );

  const user = makeJar();
  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "api-check Chrome Mac OS X" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  user.absorb(loginResponse);
  const loginBody = await loginResponse.json();

  check("вход выполнен", loginResponse.status === 200, `${loginResponse.status}`);
  check("кука сессии поставлена", user.has(SESSION_COOKIE));
  const rawCookie = loginResponse.headers.getSetCookie().join(" ");
  check("кука недоступна скриптам", /HttpOnly/i.test(rawCookie), rawCookie);
  check("кука не уходит на сторонние переходы", /SameSite=lax/i.test(rawCookie));
  check("в ответе описано устройство", typeof loginBody?.session?.deviceLabel === "string");
  check("отмечен вход", loginBody?.user?.lastLoginAt !== null);

  const me = await call(user, "/api/auth/me");
  check("сессия читается", me.data?.user?.email === EMAIL);

  const dashboardIn = await call(user, "/dashboard");
  check("с сессией кабинет открывается", dashboardIn.status === 200, `${dashboardIn.status}`);

  const loginPage = await call(user, "/login");
  check("вошедшего уводит со страницы входа", loginPage.status === 307);

  // --- Профиль ---
  const profile = await call(user, "/api/auth/profile", {
    method: "PATCH",
    body: { firstName: "Пётр", lastName: "Иванов" },
  });
  check("профиль изменён", profile.data?.user?.firstName === "Пётр");

  // --- Сессии ---
  const second = makeJar();
  await call(second, "/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });

  const sessions = await call(user, "/api/auth/sessions");
  check("видны обе сессии", sessions.data?.sessions?.length === 2, `${sessions.data?.sessions?.length}`);
  check(
    "текущая помечена",
    sessions.data?.sessions?.filter((item) => item.isCurrent).length === 1,
  );

  const otherId = sessions.data.sessions.find((item) => !item.isCurrent).id;
  const foreign = await call(guest, `/api/auth/sessions/${otherId}`, { method: "DELETE" });
  check("чужую сессию завершить нельзя", foreign.status === 401, `${foreign.status}`);

  await call(user, "/api/auth/sessions", { method: "DELETE" });
  const afterRevoke = await call(user, "/api/auth/sessions");
  check("осталась одна сессия", afterRevoke.data?.sessions?.length === 1);

  const revokedMe = await call(second, "/api/auth/me");
  check("завершённая сессия больше не работает", revokedMe.data === null);

  // --- Смена пароля ---
  const wrongCurrent = await call(user, "/api/auth/change-password", {
    method: "POST",
    body: { currentPassword: "nevernyi123", newPassword: NEW_PASSWORD },
  });
  check("смена с неверным текущим отклонена", wrongCurrent.status === 400);

  const changed = await call(user, "/api/auth/change-password", {
    method: "POST",
    body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  check("пароль изменён", changed.status === 204, `${changed.status}`);

  const oldPassword = await call(guest, "/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  check("прежний пароль больше не подходит", oldPassword.status === 401);

  // --- Сброс пароля ---
  const reset = await call(guest, "/api/auth/forgot-password", {
    method: "POST",
    body: { email: EMAIL },
  });
  const resetToken = new URL(reset.data.email.link, BASE).searchParams.get("token");
  check("выдана ссылка сброса", typeof resetToken === "string");

  const silent = await call(guest, "/api/auth/forgot-password", {
    method: "POST",
    body: { email: `nikto.${stamp}@example.com` },
  });
  check("на неизвестный адрес ответ без подсказки", silent.status === 200 && silent.data.email === null);

  await call(guest, "/api/auth/reset-password", {
    method: "POST",
    body: { token: resetToken, password: PASSWORD },
  });
  const afterReset = await call(user, "/api/auth/me");
  check("сброс закрыл все сессии", afterReset.data === null);

  const relogin = await call(guest, "/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  check("вход новым паролем работает", relogin.status === 200);

  // --- Права ---
  const admin = makeJar();
  const adminLogin = await call(admin, "/api/auth/login", {
    method: "POST",
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  check("демонстрационная запись входит", adminLogin.status === 200, `${adminLogin.status}`);

  // К этому моменту в банке `guest` лежит сессия обычного пользователя: он
  // только что вошёл заново после сброса пароля. Ответ должен быть 403 — вход
  // выполнен, но прав на список нет.
  const listAsUser = await call(guest, "/api/admin/users");
  check(
    "обычному пользователю список пользователей закрыт",
    listAsUser.status === 403,
    `${listAsUser.status}`,
  );

  const users = await call(admin, "/api/admin/users");
  check("администратор видит список", Array.isArray(users.data?.users));

  const target = users.data.users.find((item) => item.email === EMAIL);
  check("новая запись есть в списке", target !== undefined);

  const self = await call(admin, `/api/admin/users/${adminLogin.data.user.id}`, {
    method: "PATCH",
    body: { role: "user" },
  });
  check("себе роль изменить нельзя", self.status === 400, `${self.status}`);

  const promoted = await call(admin, `/api/admin/users/${target.id}`, {
    method: "PATCH",
    body: { role: "manager" },
  });
  check("роль изменена", promoted.data?.user?.role === "manager");

  const blocked = await call(admin, `/api/admin/users/${target.id}`, {
    method: "PATCH",
    body: { status: "blocked" },
  });
  check("статус изменён", blocked.data?.user?.status === "blocked");

  const blockedLogin = await call(guest, "/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  check(
    "заблокированный не входит",
    blockedLogin.data?.error?.code === "account_blocked",
    blockedLogin.data?.error?.code,
  );

  // --- Выход ---
  const logout = await call(admin, "/api/auth/logout", { method: "POST" });
  check("выход выполнен", logout.status === 204);
  check("кука снята", !admin.has(SESSION_COOKIE));
  const afterLogout = await call(admin, "/api/auth/me");
  check("после выхода сессии нет", afterLogout.data === null);

  console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`Сервер на ${BASE} недоступен или ответил неожиданно.`);
  console.error(error);
  process.exit(1);
});
