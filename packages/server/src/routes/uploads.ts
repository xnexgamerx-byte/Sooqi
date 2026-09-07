import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import type { AppContext } from "../context.js";
import { badRequest } from "../errors.js";
import { signImageUpload, uploadLimits, uploadsEnabled } from "../storage.js";

const signBody = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  /** حجم الملف بعد التصغير على الجهاز، للتحقق قبل إهدار رابط موقّع. */
  sizeBytes: z.number().int().positive(),
});

export function registerUploadRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * يوقّع رابطي رفع لصورة واحدة: الكاملة ومصغّرتها.
   *
   * التطبيق يرفع مباشرة إلى R2 بهذين الرابطين، ثم يمرّر المفتاحين عند
   * إنشاء الإعلان. الصورة لا تمرّ عبر خادمنا.
   */
  app.post("/uploads/sign", async (request) => {
    requireUserId(request);

    if (!uploadsEnabled) {
      // رسالة يفهمها البائع؛ سببها التقني يُطبع عند الإقلاع لا هنا
      throw badRequest(
        "رفع الصور غير متاح حالياً. حاول لاحقاً.",
        "uploads_disabled",
      );
    }

    const body = signBody.parse(request.body);

    if (body.sizeBytes > uploadLimits.maxBytes) {
      throw badRequest(
        `حجم الصورة أكبر من ${Math.floor(uploadLimits.maxBytes / 1024 / 1024)} ميغابايت`,
        "file_too_large",
      );
    }

    const { full, thumb } = await signImageUpload(body.contentType);

    return {
      full: { key: full.key, uploadUrl: full.url },
      thumb: { key: thumb.key, uploadUrl: thumb.url },
      expiresIn: full.expiresIn,
    };
  });

  /** يخبر التطبيق بما يقبله الخادم قبل أن يفتح معرض الصور. */
  app.get("/uploads/limits", async () => ({
    enabled: uploadsEnabled,
    maxBytes: uploadLimits.maxBytes,
    allowedTypes: uploadLimits.allowedTypes,
    maxImagesPerListing: 12,
  }));
}
