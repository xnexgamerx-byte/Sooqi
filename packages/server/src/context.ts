import type { Db } from "@souqna/db";
import type { env as Env } from "./env.js";

export type AppContext = {
  db: Db;
  env: typeof Env;
};

/** يبني الرابط العام لصورة من مفتاحها في R2. */
export function imageUrl(
  ctx: AppContext,
  storageKey: string,
): string | null {
  if (!ctx.env.R2_PUBLIC_URL) return null;
  return `${ctx.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${storageKey}`;
}
