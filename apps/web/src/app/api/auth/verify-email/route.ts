import { z } from "zod";
import { authService } from "@/server/auth-service";
import { handle, readBody } from "@/server/http";

const Body = z.object({ token: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { token } = await readBody(request, Body);
    return Response.json({ user: authService.verifyEmail(token) });
  });
}
