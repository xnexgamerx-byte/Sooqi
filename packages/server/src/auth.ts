import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { sessions, users } from "@souqna/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "./context.js";
import { unauthorized } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest {
    /** يملؤه خطّاف المصادقة مرة واحدة لكل طلب. */
    souqUserId: string | null;
  }
}

/** عمر الجلسة. طويل عمداً: إعادة تسجيل الدخول كل أسبوع تطرد المستخدمين. */
const SESSION_DAYS = 90;

/** كم يمرّ قبل أن نحدّث lastUsedAt، حتى لا نكتب صفاً مع كل طلب. */
const TOUCH_AFTER_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** تجزئة الأسرار القصيرة مثل رموز التحقق. */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** مقارنة بزمن ثابت، حتى لا يكشف زمن الرد كم حرفاً طابق. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function randomCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

/** رقم الحساب الظاهر في شاشة «حسابي». ليس المفتاح الداخلي. */
export function generatePublicId(): string {
  return String(randomInt(10_000_000, 99_999_999));
}

export type IssuedSession = { token: string; expiresAt: Date };

/**
 * يفتح جلسة جديدة ويعيد الرمز مرة واحدة فقط.
 *
 * رمز معتم في جدول، لا JWT: الـJWT لا يمكن إبطاله قبل انتهائه، وحين يُسرق
 * جهاز أو يُحظر مستخدم نريد قطع وصوله في الحال.
 *
 * المخزَّن هو تجزئة الرمز لا الرمز، فتسريب نسخة من القاعدة لا يمنح المهاجم
 * جلسات جاهزة.
 */
export async function issueSession(
  ctx: AppContext,
  userId: string,
  deviceName?: string,
): Promise<IssuedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await ctx.db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    deviceName: deviceName ?? null,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function revokeSession(ctx: AppContext, token: string) {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

export async function revokeAllSessions(ctx: AppContext, userId: string) {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * خطّاف يحلّ الجلسة مرة واحدة لكل طلب ويعلّق المستخدم عليه.
 *
 * الحلّ هنا لا داخل كل مسار: استعلام واحد بدل استعلام لكل نداء
 * requireUserId، وسلوك موحّد للمحظورين عبر الواجهة كلها.
 */
export function registerAuth(app: FastifyInstance, ctx: AppContext) {
  app.decorateRequest("souqUserId", null);

  app.addHook("onRequest", async (request) => {
    const token = bearerToken(request);

    if (token) {
      const [row] = await ctx.db
        .select({
          sessionId: sessions.id,
          userId: sessions.userId,
          lastUsedAt: sessions.lastUsedAt,
          isBanned: users.isBanned,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, hashToken(token)),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date()),
          ),
        )
        .limit(1);

      // الحساب المحظور تموت جلساته فوراً لا عند انتهائها
      if (row && !row.isBanned) {
        request.souqUserId = row.userId;

        if (Date.now() - row.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
          await ctx.db
            .update(sessions)
            .set({ lastUsedAt: new Date() })
            .where(eq(sessions.id, row.sessionId));
        }
      }
      return;
    }

    /**
     * منفذ التطوير: ترويسة x-user-id بدل جلسة حقيقية. يعمل فقط حين
     * DEV_AUTH=1، والخادم يرفض الإقلاع بها في الإنتاج (راجع env.ts).
     */
    if (ctx.env.DEV_AUTH) {
      const header = request.headers["x-user-id"];
      const value = Array.isArray(header) ? header[0] : header;
      if (value && value.length > 0) request.souqUserId = value;
    }
  });
}

export function currentUserId(request: FastifyRequest): string | null {
  return request.souqUserId;
}

export function requireUserId(request: FastifyRequest): string {
  const id = request.souqUserId;
  if (!id) throw unauthorized();
  return id;
}

/**
 * بصمة زائر مُجزّأة. تُستخدم لمنع تضخيم عدّاد المشاهدات، ولتحديد معدّل
 * طلبات رموز التحقق، ولكشف كشط الأرقام بالجملة.
 *
 * لا نخزّن عنوان الشبكة كما هو.
 */
export function viewerHash(request: FastifyRequest): string {
  const agent = request.headers["user-agent"] ?? "";
  return createHash("sha256")
    .update(`${request.ip}|${agent}`)
    .digest("hex")
    .slice(0, 64);
}

/** يجلب مستخدماً بالهاتف أو ينشئه. يُستدعى بعد التحقق من الرمز فقط. */
export async function findOrCreateUserByPhone(
  ctx: AppContext,
  phone: string,
): Promise<string> {
  const [existing] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existing) {
    await ctx.db
      .update(users)
      .set({ phoneVerifiedAt: new Date(), lastSeenAt: new Date() })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const [created] = await ctx.db
    .insert(users)
    .values({
      publicId: generatePublicId(),
      name: "مستخدم جديد",
      phone,
      phoneVerifiedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning({ id: users.id });

  if (!created) throw new Error("تعذّر إنشاء الحساب");
  return created.id;
}

/** يجلب مستخدماً بالبريد أو ينشئه. يُستدعى بعد تحقق Google فقط. */
export async function findOrCreateUserByEmail(
  ctx: AppContext,
  email: string,
  name?: string,
): Promise<string> {
  const [existing] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await ctx.db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const [created] = await ctx.db
    .insert(users)
    .values({
      publicId: generatePublicId(),
      name: name?.trim() || "مستخدم جديد",
      email,
      lastSeenAt: new Date(),
    })
    .returning({ id: users.id });

  if (!created) throw new Error("تعذّر إنشاء الحساب");
  return created.id;
}
