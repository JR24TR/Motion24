import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { broadcastAnnouncement } from "@/server/services/admin";
import { announceSchema } from "@/server/lib/validation";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { title, body: message } = await body(req, announceSchema);
    const recipients = broadcastAnnouncement(admin.id, title, message);
    return { ok: true, recipients };
  });
}
