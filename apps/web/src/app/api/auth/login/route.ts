import { LoginInput } from "@avatar/contracts";
import { authService } from "@/server/auth-service";
import { handle, readBody } from "@/server/http";
import { sessionRepository } from "@/server/repositories";
import { startSession } from "@/server/session";

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = await readBody(request, LoginInput);
    const user = await authService.verifyPassword(input);

    const sessionId = await startSession(user.id);
    const session = sessionRepository
      .listByUser(user.id, sessionId)
      .find((item) => item.id === sessionId)!;

    return Response.json({ user, session });
  });
}
