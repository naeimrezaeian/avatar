import { ApiError, handle } from "@/server/http";
import { sessionRepository } from "@/server/repositories";
import { clearSessionCookie, requireAuth } from "@/server/session";

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/auth/sessions/[sessionId]">,
): Promise<Response> {
  return handle(async () => {
    const { user, sessionId: current } = await requireAuth();
    const { sessionId } = await params;

    // Завершать можно только свои сессии: без этой проверки чужой
    // идентификатор в адресе выкидывал бы из кабинета другого человека.
    const own = sessionRepository
      .listByUser(user.id, current)
      .some((session) => session.id === sessionId);
    if (!own) throw ApiError.notFound("Сессия не найдена");

    sessionRepository.remove(sessionId);
    if (sessionId === current) await clearSessionCookie();

    return new Response(null, { status: 204 });
  });
}
