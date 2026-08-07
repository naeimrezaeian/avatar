import { RegisterInput } from "@avatar/contracts";
import { authService } from "@/server/auth-service";
import { handle, readBody } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = await readBody(request, RegisterInput);
    const { user, email } = authService.register(input);
    await authService.setPassword(user.id, input.password);
    return Response.json({ user, email }, { status: 201 });
  });
}
