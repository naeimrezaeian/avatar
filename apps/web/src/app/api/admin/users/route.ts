import { handle } from "@/server/http";
import { userRepository } from "@/server/repositories";
import { requirePermission } from "@/server/authorize";

export async function GET(): Promise<Response> {
  return handle(async () => {
    await requirePermission("users.read");
    return Response.json({ users: userRepository.list() });
  });
}
