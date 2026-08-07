import { ChangePasswordInput } from "@avatar/contracts";
import { authService } from "@/server/auth-service";
import { handle, readBody } from "@/server/http";
import { requireAuth } from "@/server/session";

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { user, sessionId } = await requireAuth();
    const input = await readBody(request, ChangePasswordInput);

    await authService.changePassword(
      user.id,
      input.currentPassword,
      input.newPassword,
      sessionId,
    );
    return new Response(null, { status: 204 });
  });
}
