import { z } from "zod";
import { authService } from "@/server/auth-service";
import { handle, readBody } from "@/server/http";

const Body = z.object({ email: z.email() });

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { email } = await readBody(request, Body);
    return Response.json({ email: authService.requestPasswordReset(email) });
  });
}
