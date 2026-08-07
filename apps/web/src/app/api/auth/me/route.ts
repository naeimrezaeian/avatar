import { handle } from "@/server/http";
import { sessionRepository } from "@/server/repositories";
import { currentAuth } from "@/server/session";

export async function GET(): Promise<Response> {
  return handle(async () => {
    const auth = await currentAuth();
    if (!auth) return Response.json(null);

    const session = sessionRepository
      .listByUser(auth.user.id, auth.sessionId)
      .find((item) => item.id === auth.sessionId);
    if (!session) return Response.json(null);

    return Response.json({ user: auth.user, session });
  });
}
