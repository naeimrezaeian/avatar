import "server-only";
import { ZodError, type ZodType } from "zod";
import { AUTH_ERROR_MESSAGES, type AuthErrorCode } from "@avatar/contracts";

/**
 * Ошибка с кодом, который понимает клиент.
 *
 * Коды берутся из контрактов, а тексты — из AUTH_ERROR_MESSAGES: формулировки
 * обязаны совпадать на сервере и на клиенте, иначе одно и то же условие
 * объясняется людям по-разному в зависимости от того, где его заметили.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static auth(status: number, code: AuthErrorCode): ApiError {
    return new ApiError(status, code, AUTH_ERROR_MESSAGES[code]);
  }

  static unauthorized(): ApiError {
    return new ApiError(401, "unauthorized", "Требуется вход");
  }

  static forbidden(): ApiError {
    return new ApiError(403, "forbidden", "Недостаточно прав");
  }

  static notFound(what = "Запись не найдена"): ApiError {
    return new ApiError(404, "not_found", what);
  }

  static badRequest(message: string): ApiError {
    return new ApiError(400, "bad_request", message);
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    // Наружу отдаётся только первое сообщение: форма показывает его целиком, а
    // полный список путей zod пользователю ничего не объясняет.
    const first = error.issues[0];
    return Response.json(
      { error: { code: "bad_request", message: first?.message ?? "Некорректные данные" } },
      { status: 400 },
    );
  }

  console.error("Необработанная ошибка маршрута:", error);
  return Response.json(
    { error: { code: "internal", message: "Внутренняя ошибка сервера" } },
    { status: 500 },
  );
}

/**
 * Обёртка обработчика: ошибки превращаются в ответ с кодом, а не в 500 со
 * стеком. Без неё каждый маршрут повторял бы один и тот же try/catch.
 */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch(jsonError);
}

export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw ApiError.badRequest("Ожидалось тело запроса в формате JSON");
  }
  return schema.parse(raw);
}
