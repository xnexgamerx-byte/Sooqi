import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { unauthorized } from "./errors.js";
import type { AppContext } from "./context.js";

/**
 * مصادقة مؤقتة للتطوير.
 *
 * تقرأ معرّف المستخدم من ترويسة x-user-id حين يكون DEV_AUTH مفعّلاً.
 * الخادم يرفض الإقلاع إذا كان هذا مفعّلاً في الإنتاج (راجع env.ts).
 *
 * الخطوة القادمة: استبدل جسم الدالة بالتحقق من رمز الجلسة الحقيقي
 * (تسجيل دخول Google، ثم تحقّق الهاتف عند نشر أول إعلان). راجع القسم
 * السادس من docs/plan.html لسبب تأجيل تحقّق الهاتف.
 */
export function currentUserId(
  ctx: AppContext,
  request: FastifyRequest,
): string | null {
  if (!ctx.env.DEV_AUTH) return null;
  const header = request.headers["x-user-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.length > 0 ? value : null;
}

export function requireUserId(
  ctx: AppContext,
  request: FastifyRequest,
): string {
  const id = currentUserId(ctx, request);
  if (!id) throw unauthorized();
  return id;
}

/**
 * بصمة زائر مُجزّأة. تُستخدم لمنع تضخيم عدّاد المشاهدات ولكشف كشط الأرقام
 * بالجملة. لا نخزّن عنوان الشبكة كما هو.
 */
export function viewerHash(request: FastifyRequest): string {
  const agent = request.headers["user-agent"] ?? "";
  return createHash("sha256")
    .update(`${request.ip}|${agent}`)
    .digest("hex")
    .slice(0, 64);
}
