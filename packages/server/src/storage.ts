import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";
import { badRequest } from "./errors.js";

/**
 * تخزين الصور على Cloudflare R2.
 *
 * الصورة لا تمرّ عبر خادمنا إطلاقاً: نوقّع رابط رفع مؤقتاً، والتطبيق يرفع
 * مباشرة إلى R2. هذا يبقي خادم الأربعة دولارات خارج مسار البيانات، ويعني
 * أن مئة رفع متزامن لا تشغل شيئاً عندنا.
 */

/** الصيغ المقبولة. لا نقبل غيرها حتى لا يُستعمل التخزين كمستضيف ملفات. */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** ٨ ميغابايت. الصورة بعد التصغير على الجهاز أقل من نصف ميغابايت عادة. */
const MAX_BYTES = 8 * 1024 * 1024;

/** صلاحية رابط الرفع. قصيرة عمداً — الرفع يبدأ فوراً بعد التوقيع. */
const SIGN_TTL_SECONDS = 300;

export const uploadsEnabled = Boolean(
  env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET,
);

const client = uploadsEnabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      },
    })
  : null;

export type SignedUpload = {
  /** المفتاح الذي يُخزَّن في قاعدة البيانات. */
  key: string;
  /** رابط PUT مؤقت يرفع إليه التطبيق مباشرة. */
  url: string;
  expiresIn: number;
};

/**
 * يوقّع رابطي رفع: الصورة الكاملة ونسختها المصغّرة.
 *
 * المفتاح مقسّم بالسنة والشهر لأن سرد حاوية فيها مئة ألف كائن في مجلد
 * واحد بطيء، ولأنه يجعل حذف أرشيف قديم عملية بادئة واحدة.
 */
export async function signImageUpload(contentType: string): Promise<{
  full: SignedUpload;
  thumb: SignedUpload;
}> {
  if (!client) {
    throw badRequest(
      "رفع الصور غير مفعّل على هذا الخادم",
      "uploads_disabled",
    );
  }

  const extension = ALLOWED_TYPES[contentType];
  if (!extension) {
    throw badRequest(
      "صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.",
      "unsupported_type",
    );
  }

  const now = new Date();
  const prefix = `listings/${now.getUTCFullYear()}/${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  const id = randomUUID();

  const sign = async (key: string): Promise<SignedUpload> => {
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: env.R2_BUCKET as string,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: SIGN_TTL_SECONDS },
    );
    return { key, url, expiresIn: SIGN_TTL_SECONDS };
  };

  const [full, thumb] = await Promise.all([
    sign(`${prefix}/${id}.${extension}`),
    sign(`${prefix}/${id}_t.${extension}`),
  ]);

  return { full, thumb };
}

/**
 * يتحقق أن المفتاح من الشكل الذي نوقّعه نحن.
 *
 * العميل يعيد المفتاح إلينا عند إنشاء الإعلان، فلا نثق به: بدون هذا الفحص
 * يستطيع أي مستخدم ربط إعلانه بأي كائن في الحاوية.
 */
const KEY_PATTERN =
  /^listings\/\d{4}\/\d{2}\/[0-9a-f-]{36}(_t)?\.(jpg|png|webp)$/;

export function isOwnKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export const uploadLimits = {
  maxBytes: MAX_BYTES,
  allowedTypes: Object.keys(ALLOWED_TYPES),
};
