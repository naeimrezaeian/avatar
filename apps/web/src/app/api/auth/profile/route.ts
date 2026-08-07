import { UpdateProfileInput } from "@avatar/contracts";
import { handle, readBody } from "@/server/http";
import { userRepository } from "@/server/repositories";
import { requireAuth } from "@/server/session";

export async function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const { user } = await requireAuth();
    const input = await readBody(request, UpdateProfileInput);

    // Правится только собственный профиль: идентификатор берётся из сессии, а
    // не из тела запроса — иначе им можно было бы указать чужой.
    const updated = userRepository.update(user.id, {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
    });
    return Response.json({ user: updated });
  });
}
