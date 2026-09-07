import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppContext } from "../context.js";

/**
 * لوحة الإشراف: صفحة ثابتة يقدّمها الخادم نفسه.
 *
 * لا إطار عمل ولا خطوة بناء. المستخدمون هنا مشرف أو اثنان يفتحان متصفحاً،
 * وإضافة Vite وReact إلى المستودع من أجل ثلاث شاشات كلفة بلا مقابل.
 *
 * الحماية ليست في هذه الصفحة بل في ‎/api/admin/*: الصفحة لا تحمل بيانات،
 * وكل ما تعرضه يأتي من نداءات تتحقّق من دور المشرف في القاعدة.
 */

/**
 * جذر الحزمة من هذا الملف.
 *
 * العمق نفسه في الحالتين: src/routes/ أثناء التطوير وdist/routes/ بعد
 * البناء، فمسار واحد يكفي. لا ننسخ الملفات إلى dist لأن tsc لا ينقل غير
 * TypeScript، ولا داعي لخطوة نسخ من أجل ثلاثة ملفات.
 */
const publicDir = new URL("../../public/", import.meta.url);

type Asset = { file: string; type: string };

const assets: Record<string, Asset> = {
  "/admin": { file: "admin.html", type: "text/html; charset=utf-8" },
  "/admin/app.css": { file: "admin.css", type: "text/css; charset=utf-8" },
  "/admin/app.js": {
    file: "admin.js",
    type: "text/javascript; charset=utf-8",
  },
};

export function registerDashboard(app: FastifyInstance, ctx: AppContext) {
  const cache = new Map<string, string>();
  const cacheable = ctx.env.NODE_ENV === "production";

  /**
   * سياسة محتوى صارمة.
   *
   * هذه الصفحة تعرض نصوصاً كتبها مستخدمون: عناوين إعلانات، ملاحظات بلاغات،
   * أسماء. لذلك لا نصوص برمجية داخل الصفحة إطلاقاً — ملفات منفصلة بلا
   * unsafe-inline — والصور محصورة بنطاق R2 وحده.
   */
  const imageOrigin = ctx.env.R2_PUBLIC_URL
    ? new URL(ctx.env.R2_PUBLIC_URL).origin
    : "";

  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data:${imageOrigin ? ` ${imageOrigin}` : ""}`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    // نقر مسروق على زر «احظر» هجوم حقيقي، لا احتمال نظري
    "frame-ancestors 'none'",
  ].join("; ");

  const send = async (reply: FastifyReply, route: string) => {
    const asset = assets[route];
    if (!asset) return reply.callNotFound();

    let body = cache.get(route);
    if (body === undefined) {
      body = await readFile(new URL(asset.file, publicDir), "utf8");
      if (cacheable) cache.set(route, body);
    }

    return reply
      .header("content-type", asset.type)
      .header("content-security-policy", csp)
      .header("x-frame-options", "DENY")
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .header("cache-control", "no-store")
      .header("x-robots-tag", "noindex, nofollow")
      .send(body);
  };

  for (const route of Object.keys(assets)) {
    app.get(route, async (_request, reply) => send(reply, route));
  }
}
