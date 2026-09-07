import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { otpCodes, pushTokens, sessions, users } from "@souqna/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  bearerToken,
  findOrCreateUserByEmail,
  findOrCreateUserByPhone,
  hashSecret,
  issueSession,
  randomCode,
  requireUserId,
  revokeAllSessions,
  revokeSession,
  safeEqual,
  viewerHash,
} from "../auth.js";
import type { AppContext } from "../context.js";
import { badRequest, unauthorized } from "../errors.js";
import { otpMessage, sms, smsDelivers } from "../sms.js";

/* ---------------------------------------------------------------- limits */

/** صلاحية الرمز. عشر دقائق تكفي لوصول رسالة وإدخالها بلا عجلة. */
const OTP_TTL_MS = 10 * 60 * 1000;

/** محاولات خاطئة قبل حرق الرمز. تخمين ستة أرقام بلا حدّ مسألة وقت. */
const OTP_MAX_ATTEMPTS = 5;

/**
 * حدود المعدّل. هذه ليست تجميلاً: كل طلب رمز رسالة مدفوعة، ومهاجم بلا
 * حدّ يستطيع تحويل فاتورتك إلى آلاف الدولارات في ليلة.
 */
const MAX_PER_PHONE_HOUR = 3;
const MAX_PER_REQUESTER_HOUR = 10;

/** ثوانٍ قبل السماح بإعادة الإرسال لنفس الرقم. */
const RESEND_COOLDOWN_MS = 60 * 1000;

/* ------------------------------------------------------------- normalize */

/**
 * يوحّد أرقام الهاتف العراقية إلى الشكل الدولي.
 *
 * الناس يكتبون ٠٧٧٠… و ٧٧٠… و ٩٦٤٧٧٠… و +٩٦٤ ٧٧٠…، وكلها نفس الرقم.
 * بدون التوحيد يصير للمستخدم الواحد عدة حسابات.
 */
export function normalizeIraqiPhone(input: string): string | null {
  // الأرقام الهندية إلى لاتينية، ثم إسقاط كل ما ليس رقماً
  const latin = input.replace(/[٠-٩]/g, (d) =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
  );
  let digits = latin.replace(/[^0-9]/g, "");

  if (digits.startsWith("00964")) digits = digits.slice(5);
  else if (digits.startsWith("964")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  // شبكات العراق: 7 ثم تسعة أرقام
  if (!/^7\d{9}$/.test(digits)) return null;

  return `+964${digits}`;
}

/* --------------------------------------------------------------- schemas */

const requestBody = z.object({
  phone: z.string().min(6).max(24),
});

const verifyBody = z.object({
  phone: z.string().min(6).max(24),
  code: z.string().min(4).max(8),
  deviceName: z.string().max(80).optional(),
});

const googleBody = z.object({
  idToken: z.string().min(20).max(4000),
  deviceName: z.string().max(80).optional(),
});

const profileBody = z.object({
  name: z.string().min(2).max(60).optional(),
  contactPhone: z.string().max(24).optional(),
});

const pushBody = z.object({
  token: z.string().min(10).max(400),
  platform: z.enum(["android", "ios", "web"]).optional(),
});

/* ---------------------------------------------------------------- routes */

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * يطلب رمز تحقق.
   *
   * الرد واحد سواء كان الرقم مسجّلاً أم لا: الاختلاف يكشف أي الأرقام لها
   * حسابات عندنا.
   */
  app.post("/auth/otp/request", async (request) => {
    const body = requestBody.parse(request.body);
    const phone = normalizeIraqiPhone(body.phone);

    if (!phone) {
      throw badRequest(
        "رقم الهاتف غير صحيح. اكتبه هكذا: ٠٧٧٠١٢٣٤٥٦٧",
        "bad_phone",
      );
    }

    const requester = viewerHash(request);
    const hourAgo = new Date(Date.now() - 3_600_000);

    const [byPhone] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, hourAgo)));

    if ((byPhone?.count ?? 0) >= MAX_PER_PHONE_HOUR) {
      throw badRequest(
        "طلبت رموزاً كثيرة لهذا الرقم. انتظر ساعة وحاول مرة ثانية.",
        "otp_rate_limited",
      );
    }

    const [byRequester] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.requesterHash, requester),
          gt(otpCodes.createdAt, hourAgo),
        ),
      );

    if ((byRequester?.count ?? 0) >= MAX_PER_REQUESTER_HOUR) {
      throw badRequest(
        "طلبات كثيرة من هذا الجهاز. انتظر ساعة.",
        "otp_rate_limited",
      );
    }

    const [recent] = await ctx.db
      .select({ createdAt: otpCodes.createdAt })
      .from(otpCodes)
      .where(eq(otpCodes.phone, phone))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      const wait = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000,
      );
      throw badRequest(
        `انتظر ${wait} ثانية قبل طلب رمز جديد`,
        "otp_cooldown",
      );
    }

    const code = randomCode(6);

    await ctx.db.insert(otpCodes).values({
      phone,
      codeHash: hashSecret(code),
      requesterHash: requester,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    try {
      await sms.send(phone, otpMessage(code));
    } catch (error) {
      request.log.error({ err: error }, "فشل إرسال رمز التحقق");
      throw badRequest(
        "تعذّر إرسال الرمز الآن. حاول بعد قليل.",
        "sms_failed",
      );
    }

    return {
      ok: true,
      phone,
      expiresInSeconds: OTP_TTL_MS / 1000,
      /** حين يكون الناقل هو السجلّ، التطبيق يخبر المستخدم أن الرمز لن يصل. */
      delivers: smsDelivers,
    };
  });

  /** يتحقق من الرمز ويفتح جلسة. */
  app.post("/auth/otp/verify", async (request) => {
    const body = verifyBody.parse(request.body);
    const phone = normalizeIraqiPhone(body.phone);

    if (!phone) throw badRequest("رقم الهاتف غير صحيح", "bad_phone");

    const [row] = await ctx.db
      .select({
        id: otpCodes.id,
        codeHash: otpCodes.codeHash,
        attempts: otpCodes.attempts,
      })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!row) {
      throw badRequest(
        "الرمز منتهي أو غير موجود. اطلب رمزاً جديداً.",
        "otp_expired",
      );
    }

    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      await ctx.db
        .update(otpCodes)
        .set({ consumedAt: new Date() })
        .where(eq(otpCodes.id, row.id));
      throw badRequest(
        "محاولات كثيرة خاطئة. اطلب رمزاً جديداً.",
        "otp_burned",
      );
    }

    if (!safeEqual(row.codeHash, hashSecret(body.code.trim()))) {
      await ctx.db
        .update(otpCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(otpCodes.id, row.id));
      throw badRequest("الرمز غير صحيح", "otp_wrong");
    }

    await ctx.db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(otpCodes.id, row.id));

    const userId = await findOrCreateUserByPhone(ctx, phone);
    const session = await issueSession(ctx, userId, body.deviceName);

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: await publicUser(ctx, userId),
    };
  });

  /**
   * تسجيل الدخول بحساب Google.
   *
   * مجاني بلا رسائل، فهو المسار الافتراضي المقترح: التحقق بالهاتف يُطلب
   * عند نشر أول إعلان فقط، وهذا وحده يقلّص فاتورة الرسائل عشرة أضعاف.
   */
  app.post("/auth/google", async (request) => {
    const body = googleBody.parse(request.body);

    if (!ctx.env.GOOGLE_CLIENT_ID) {
      throw badRequest(
        "تسجيل الدخول بحساب Google غير مفعّل على هذا الخادم",
        "google_disabled",
      );
    }

    let payload: {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
    };

    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.idToken)}`,
      );
      if (!response.ok) throw new Error(`tokeninfo ${response.status}`);
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      request.log.warn({ err: error }, "فشل التحقق من رمز Google");
      throw unauthorized("تعذّر التحقق من حساب Google", "google_failed");
    }

    // بدون فحص aud يقبل الخادم رموزاً صادرة لتطبيق آخر تماماً
    if (payload.aud !== ctx.env.GOOGLE_CLIENT_ID) {
      throw unauthorized("رمز Google لا يخصّ هذا التطبيق", "google_bad_aud");
    }

    const verified =
      payload.email_verified === true || payload.email_verified === "true";

    if (!payload.email || !verified) {
      throw unauthorized("بريد Google غير موثّق", "google_unverified");
    }

    const userId = await findOrCreateUserByEmail(
      ctx,
      payload.email,
      payload.name,
    );
    const session = await issueSession(ctx, userId, body.deviceName);

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: await publicUser(ctx, userId),
    };
  });

  app.get("/auth/me", async (request) => {
    const userId = requireUserId(request);
    return { user: await publicUser(ctx, userId) };
  });

  app.patch("/auth/me", async (request) => {
    const userId = requireUserId(request);
    const body = profileBody.parse(request.body);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name.trim();

    await ctx.db.update(users).set(patch).where(eq(users.id, userId));

    return { user: await publicUser(ctx, userId) };
  });

  app.post("/auth/logout", async (request) => {
    requireUserId(request);
    const token = bearerToken(request);
    if (token) await revokeSession(ctx, token);
    return { ok: true };
  });

  /** يخرج من كل الأجهزة. ما يفعله المستخدم حين يفقد هاتفه. */
  app.post("/auth/logout-all", async (request) => {
    const userId = requireUserId(request);
    await revokeAllSessions(ctx, userId);
    return { ok: true };
  });

  /** الأجهزة المسجّل دخولها، حتى يرى المستخدم جلسة لا يعرفها. */
  app.get("/auth/sessions", async (request) => {
    const userId = requireUserId(request);

    const rows = await ctx.db
      .select({
        id: sessions.id,
        deviceName: sessions.deviceName,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.lastUsedAt));

    return { sessions: rows };
  });

  /**
   * حذف الحساب نهائياً.
   *
   * شرط إلزامي لقبول التطبيق في Google Play: يجب أن يستطيع المستخدم حذف
   * حسابه من داخل التطبيق لا عبر مراسلة الدعم.
   *
   * الحذف يسقط الإعلانات والمحادثات والصور بالتتالي عبر المفاتيح الأجنبية.
   * كائنات R2 تبقى وتلتقطها مهمة المطابقة الدورية.
   */
  app.delete("/auth/me", async (request) => {
    const userId = requireUserId(request);
    await ctx.db.delete(users).where(eq(users.id, userId));
    return { ok: true };
  });

  /** يسجّل رمز إشعارات لهذا الجهاز. */
  app.post("/auth/push-token", async (request) => {
    const userId = requireUserId(request);
    const body = pushBody.parse(request.body);

    await ctx.db
      .insert(pushTokens)
      .values({
        userId,
        token: body.token,
        platform: body.platform ?? null,
      })
      .onConflictDoUpdate({
        target: pushTokens.token,
        // الجهاز نفسه قد ينتقل إلى حساب آخر
        set: { userId, platform: body.platform ?? null },
      });

    return { ok: true };
  });

  app.delete("/auth/push-token", async (request) => {
    requireUserId(request);
    const body = z
      .object({ token: z.string().min(10).max(400) })
      .parse(request.body);

    await ctx.db.delete(pushTokens).where(eq(pushTokens.token, body.token));
    return { ok: true };
  });

  /** يخبر التطبيق بطرق الدخول المتاحة قبل رسم شاشة الدخول. */
  app.get("/auth/methods", async () => ({
    phone: true,
    smsDelivers,
    google: Boolean(ctx.env.GOOGLE_CLIENT_ID),
  }));
}

/** الحقول التي يجوز أن يراها صاحب الحساب. */
async function publicUser(ctx: AppContext, userId: string) {
  const [row] = await ctx.db
    .select({
      id: users.id,
      publicId: users.publicId,
      name: users.name,
      phone: users.phone,
      email: users.email,
      isVerified: users.isVerified,
      phoneVerifiedAt: users.phoneVerifiedAt,
      activeListingLimit: users.activeListingLimit,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) throw unauthorized();
  return row;
}
