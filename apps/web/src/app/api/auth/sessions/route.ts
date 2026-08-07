import { handle } from "@/server/http";
import { sessionRepository } from "@/server/repositories";
import { requireAuth } from "@/server/session";

export async function GET(): Promise<Response> {
  return handle(async () => {
    const { user, sessionId } = await requireAuth();
    return Response.json({ sessions: sessionRepository.listByUser(user.id, sessionId) });
  });
}

/** Выход со всех устройств, кроме текущего (п.3 ТЗ). */
export async function DELETE(): Promise<Response> {
  return handle(async () => {
    const { user, sessionId } = await requireAuth();
    sessionRepository.removeOthers(user.id, sessionId);
    return new Response(null, { status: 204 });
  });
}
