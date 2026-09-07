import { loadRootEnv } from "@souqna/db";
import { z } from "zod";

loadRootEnv();

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
  /** النطاق العام الذي يقدّم صور R2. فارغ يعني أن الصور تُعاد كمفاتيح فقط. */
  R2_PUBLIC_URL: z.string().url().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  /** معرّف عميل Google. فارغ يعطّل تسجيل الدخول بحساب Google. */
  GOOGLE_CLIENT_ID: z.string().optional(),

  /** "console" يطبع الرمز ولا يرسل. "http" يرسل عبر بوابة. */
  SMS_PROVIDER: z.enum(["console", "http"]).default("console"),
  SMS_API_URL: z.string().url().optional(),
  SMS_API_KEY: z.string().optional(),
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

/**
 * إعدادات R2 تُقبل كاملةً أو لا تُقبل. مجموعة ناقصة تعني خادماً يبدو أنه
 * يدعم رفع الصور ثم يفشل عند أول محاولة.
 */
const r2Keys = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

const r2Present = r2Keys.filter((key) => Boolean(env[key]));

if (r2Present.length > 0 && r2Present.length < r2Keys.length) {
  const missing = r2Keys.filter((key) => !env[key]);
  console.error(
    `إعدادات R2 ناقصة: ${missing.join("، ")}. عبّئها كلها أو اتركها كلها فارغة.`,
  );
  process.exit(1);
}

if (r2Present.length === r2Keys.length && !env.R2_PUBLIC_URL) {
  console.error(
    "R2_PUBLIC_URL مطلوب مع إعدادات R2، وإلا لن يعرف التطبيق من أين يقرأ الصور.",
  );
  process.exit(1);
}

/**
 * غياب R2 ليس خطأً يوقف الإقلاع — الخادم يعمل للتصفّح والدردشة بدونه —
 * لكنه يعطّل نشر الإعلانات كلها، فلا يُترك بلا تنبيه صريح.
 */
if (r2Present.length === 0) {
  console.warn(
    "تنبيه: إعدادات R2 فارغة. رفع الصور معطّل، ولا يمكن نشر أي إعلان (النشر يتطلب صورة).",
  );
}

if (env.SMS_PROVIDER === "http" && !env.SMS_API_URL) {
  console.error("SMS_API_URL مطلوب مع SMS_PROVIDER=http");
  process.exit(1);
}

if (env.NODE_ENV === "production" && env.SMS_PROVIDER === "console") {
  console.warn(
    "تحذير: SMS_PROVIDER=console في الإنتاج. رموز التحقق ستُطبع في السجلّ ولن تصل لأحد.",
  );
}

if (env.NODE_ENV === "production" && env.DEV_AUTH) {
  console.error(
    "DEV_AUTH مفعّل مع NODE_ENV=production. هذا يسمح لأي أحد بانتحال أي حساب.",
  );
  process.exit(1);
}
