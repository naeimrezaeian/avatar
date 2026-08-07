import { z } from "zod";
import { authService } from "@/server/auth-service";
import { handle, readBody } from "@/server/http";
import { clearSessionCookie } from "@/server/session";

const Body = z.object({ token: z.string().min(1), password: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { token, password } = await readBody(request, Body);
    await authService.resetPassword(token, password);
    // Сброс закрывает все сессии, включая текущую в этом браузере: кука
    // указывала бы на удалённую запись и всё равно не работала бы.
    await clearSessionCookie();
    return new Response(null, { status: 204 });
  });
}
