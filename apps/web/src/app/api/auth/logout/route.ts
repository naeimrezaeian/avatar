import { handle } from "@/server/http";
import { sessionRepository } from "@/server/repositories";
import { clearSessionCookie, currentSessionId } from "@/server/session";

export async function POST(): Promise<Response> {
  return handle(async () => {
    const sessionId = await currentSessionId();
    // Сессия удаляется на сервере, а не только забывается в браузере: иначе
    // прежний идентификатор оставался бы действующим для того, кто его успел
    // перехватить.
    if (sessionId) sessionRepository.remove(sessionId);
    await clearSessionCookie();
    return new Response(null, { status: 204 });
  });
}
