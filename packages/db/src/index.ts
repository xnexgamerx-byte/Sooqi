import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";

/**
 * ينشئ اتصالاً بقاعدة البيانات.
 *
 * `prepare: false` مطلوب مع مجمّع الجلسات في Supabase (PgBouncer في وضع
 * transaction لا يدعم العبارات المُحضّرة). لا تحذفه.
 */
export function createDb(url: string) {
  const client = postgres(url, { prepare: false, max: 10 });
  return { db: drizzle(client, { schema, casing: "snake_case" }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
export { schema };
