import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
  /** النطاق العام الذي يقدّم صور R2. فارغ يعني أن الصور تُعاد كمفاتيح فقط. */
  R2_PUBLIC_URL: z.string().url().optional(),
  /**
   * مصادقة التطوير: تقبل ترويسة x-user-id بدل تسجيل دخول حقيقي.
   * ترفض الخادم الإقلاع إذا فُعّلت في الإنتاج.
   */
  DEV_AUTH: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("إعدادات البيئة ناقصة أو غير صالحة:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === "production" && env.DEV_AUTH) {
  console.error(
    "DEV_AUTH مفعّل مع NODE_ENV=production. هذا يسمح لأي أحد بانتحال أي حساب.",
  );
  process.exit(1);
}
