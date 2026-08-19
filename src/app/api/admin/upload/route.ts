import { NextRequest } from "next/server";
import { handle } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { recordAdminAction } from "@/server/services/admin";
import { uuid } from "@/server/lib/util";
import { ApiError } from "@/server/lib/errors";
import fs from "node:fs";
import path from "node:path";

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 2 * 1024 * 1024;

/** Thumbnail upload for game cards — admins only, 2MB image cap. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "NO_FILE", "Choose an image file first.");
    const ext = ALLOWED[file.type];
    if (!ext) throw new ApiError(400, "BAD_TYPE", "Only PNG, JPEG, WebP or GIF images are allowed.");
    if (file.size > MAX_BYTES) throw new ApiError(400, "TOO_LARGE", "Image must be smaller than 2MB.");

    const name = `${uuid()}.${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
    const url = `/uploads/${name}`;
    recordAdminAction(admin.id, "UPLOAD", { type: "ASSET", id: name, label: url });
    return { ok: true, url };
  });
}
