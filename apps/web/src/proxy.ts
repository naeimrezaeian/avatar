import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Защита маршрутов до отрисовки страницы.
 *
 * Проверяется только наличие куки, а не её действительность: обращение к базе
 * на каждый запрос за разметкой замедлило бы навигацию, и документация прямо
 * называет proxy местом для оптимистичной проверки, а не для авторизации.
 * Настоящее решение принимают обработчики API — там сессия сверяется с базой,
 * и подделанная кука не даёт ни строчки данных.
 *
 * Чем это отличается от прежнего поведения: раньше решение принимал компонент
 * в браузере, то есть разметку кабинета получал кто угодно, отключив скрипты.
 * Теперь неаутентифицированный запрос до страницы вообще не доходит.
 */

/** Разделы кабинета. Всё, что не перечислено, доступно без входа. */
const PROTECTED = [
  "/dashboard",
  "/projects",
  "/podcast",
  "/avatars",
  "/voices",
  "/billing",
  "/notifications",
  "/settings",
  "/admin",
];

/**
 * Страницы входа и регистрации. Вошедшему они не нужны — его возвращают в
 * кабинет. Подтверждение почты и сброс пароля сюда не входят намеренно: по
 * ссылке из письма человек может прийти в любом состоянии.
 */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);

  if (pathname === "/") {
    return NextResponse.redirect(new URL(signedIn ? "/dashboard" : "/login", request.url));
  }

  if (!signedIn && matches(pathname, PROTECTED)) {
    const url = new URL("/login", request.url);
    // Куда человек шёл — чтобы после входа вернуть его туда, а не на общий
    // обзор: иначе ссылка на конкретный проект теряется при истёкшей сессии.
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (signedIn && matches(pathname, GUEST_ONLY)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Статика и обработчики API исключены: первые не требуют проверки, вторые
  // проверяют сессию сами и обязаны отвечать кодом, а не перенаправлением.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
