import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  categories,
  cities,
  listingImages,
  listings,
  reports,
  users,
} from "@souqna/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireModerator, revokeAllSessions } from "../auth.js";
import { imageUrl, type AppContext } from "../context.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import {
  notifyApproved,
  notifyRejected,
  notifySavedSearches,
} from "../notify.js";
import { REPORT_REASON_LABELS } from "./engagement.js";

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

const rejectBody = z.object({
  reason: z.string().min(3).max(300),
});

const banBody = z.object({
  reason: z.string().min(3).max(300),
});

const resolveBody = z.object({
  action: z.enum(["actioned", "dismissed"]),
});

/**
 * لوحة الإشراف.
 *
 * المراجعة اليدوية مفعّلة في أول ثلاثين يوماً، فكل إعلان منشور يمرّ من هنا.
 * راجع القسم العاشر من docs/plan.html: الاحتيال يبدأ من اليوم الأول، وطابور
 * مراجعة بسيط أرخص بكثير من استرجاع سمعة سوق امتلأ بالإعلانات الوهمية.
 */
export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext) {
  /** أرقام سريعة لأعلى اللوحة. */
  app.get("/admin/overview", async (request) => {
    await requireModerator(ctx, request);

    const [pending] = await ctx.db
      .select({ value: count() })
      .from(listings)
      .where(eq(listings.status, "pending"));

    const [openReports] = await ctx.db
      .select({ value: count() })
      .from(reports)
      .where(eq(reports.status, "open"));

    const [published] = await ctx.db
      .select({ value: count() })
      .from(listings)
      .where(eq(listings.status, "published"));

    const [banned] = await ctx.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.isBanned, true));

    return {
      pendingListings: pending?.value ?? 0,
      openReports: openReports?.value ?? 0,
      publishedListings: published?.value ?? 0,
      bannedUsers: banned?.value ?? 0,
    };
  });

  /** طابور المراجعة: الأقدم أولاً، فلا يبقى إعلان معلّقاً للأبد. */
  app.get("/admin/listings/pending", async (request) => {
    await requireModerator(ctx, request);
    const query = pageQuery.parse(request.query);

    const rows = await ctx.db
      .select({
        id: listings.id,
        refNo: listings.refNo,
        title: listings.title,
        description: listings.description,
        priceIqd: listings.priceIqd,
        condition: listings.condition,
        createdAt: listings.createdAt,
        categoryNameAr: categories.nameAr,
        cityNameAr: cities.nameAr,
        sellerId: users.id,
        sellerName: users.name,
        sellerPhone: users.phone,
        sellerPublicId: users.publicId,
      })
      .from(listings)
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .innerJoin(users, eq(users.id, listings.userId))
      .where(eq(listings.status, "pending"))
      .orderBy(asc(listings.publishedAt))
      .limit(query.limit)
      .offset(query.offset);

    const images = await listingImageMap(
      ctx,
      rows.map((row) => row.id),
    );

    return {
      listings: rows.map((row) => ({
        ...row,
        images: images.get(row.id) ?? [],
      })),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/admin/listings/:id/approve",
    async (request) => {
      await requireModerator(ctx, request);

      const now = new Date();
      const updated = await ctx.db
        .update(listings)
        .set({
          status: "published",
          rejectionReason: null,
          // bumpedAt وقت الموافقة لا وقت الإرسال، وإلا دُفن إعلان انتظر يوماً
          bumpedAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(listings.id, request.params.id), eq(listings.status, "pending")),
        )
        .returning({ id: listings.id });

      if (updated.length === 0) {
        throw notFound("الإعلان غير موجود أو ليس في الطابور", "not_pending");
      }

      // بلا انتظار: المشرف لا ينتظر شبكة Expo ليوافق على الإعلان التالي
      void notifyApproved(ctx, request.params.id);
      void notifySavedSearches(ctx, request.params.id);

      return { ok: true, status: "published" };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/listings/:id/reject",
    async (request) => {
      await requireModerator(ctx, request);
      const body = rejectBody.parse(request.body);

      const updated = await ctx.db
        .update(listings)
        .set({
          status: "rejected",
          rejectionReason: body.reason,
          updatedAt: new Date(),
        })
        .where(eq(listings.id, request.params.id))
        .returning({ id: listings.id, userId: listings.userId });

      if (updated.length === 0) {
        throw notFound("الإعلان غير موجود", "listing_not_found");
      }

      void notifyRejected(ctx, request.params.id, body.reason);

      return { ok: true, status: "rejected" };
    },
  );

  /** إخفاء إعلان منشور فوراً، للحالات التي لا تحتمل انتظاراً. */
  app.post<{ Params: { id: string } }>(
    "/admin/listings/:id/takedown",
    async (request) => {
      await requireModerator(ctx, request);
      const body = rejectBody.parse(request.body);

      await ctx.db
        .update(listings)
        .set({
          status: "rejected",
          rejectionReason: body.reason,
          updatedAt: new Date(),
        })
        .where(eq(listings.id, request.params.id));

      return { ok: true };
    },
  );

  /* ------------------------------------------------------------ البلاغات */

  app.get("/admin/reports", async (request) => {
    await requireModerator(ctx, request);
    const query = pageQuery.parse(request.query);

    const rows = await ctx.db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        targetId: reports.targetId,
        reason: reports.reason,
        note: reports.note,
        status: reports.status,
        createdAt: reports.createdAt,
        reporterName: users.name,
        reporterPublicId: users.publicId,
      })
      .from(reports)
      .leftJoin(users, eq(users.id, reports.reporterId))
      .where(eq(reports.status, "open"))
      .orderBy(asc(reports.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    // عدد البلاغات على كل هدف: خمسة بلاغات على إعلان واحد أهم من خمسة متفرقة
    const targetIds = [...new Set(rows.map((row) => row.targetId))];
    const counts = new Map<string, number>();

    if (targetIds.length > 0) {
      const tallies = await ctx.db
        .select({ targetId: reports.targetId, value: count() })
        .from(reports)
        .where(inArray(reports.targetId, targetIds))
        .groupBy(reports.targetId);

      for (const tally of tallies) counts.set(tally.targetId, tally.value);
    }

    return {
      reports: rows.map((row) => ({
        ...row,
        reasonAr: REPORT_REASON_LABELS[row.reason] ?? row.reason,
        reportsOnTarget: counts.get(row.targetId) ?? 1,
      })),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/admin/reports/:id/resolve",
    async (request) => {
      const { userId } = await requireModerator(ctx, request);
      const body = resolveBody.parse(request.body);

      const updated = await ctx.db
        .update(reports)
        .set({
          status: body.action,
          handledBy: userId,
          handledAt: new Date(),
        })
        .where(eq(reports.id, request.params.id))
        .returning({ id: reports.id, targetId: reports.targetId });

      if (updated.length === 0) {
        throw notFound("البلاغ غير موجود", "report_not_found");
      }

      return { ok: true };
    },
  );

  /* ---------------------------------------------------------- المستخدمون */

  app.get("/admin/users", async (request) => {
    await requireModerator(ctx, request);
    const query = z
      .object({
        q: z.string().max(60).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query);

    const rows = await ctx.db
      .select({
        id: users.id,
        publicId: users.publicId,
        name: users.name,
        phone: users.phone,
        email: users.email,
        isBanned: users.isBanned,
        banReason: users.banReason,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        query.q
          ? sql`(${users.name} ILIKE ${`%${query.q}%`} OR ${users.phone} ILIKE ${`%${query.q}%`} OR ${users.publicId} = ${query.q})`
          : sql`true`,
      )
      .orderBy(desc(users.createdAt))
      .limit(query.limit);

    return { users: rows };
  });

  /**
   * حظر مستخدم.
   *
   * الحظر يسحب جلساته فوراً ويخفي إعلاناته المنشورة. بدون الخطوتين معاً
   * يبقى المحتال داخل التطبيق حتى تنتهي جلسته، وتبقى إعلاناته معروضة.
   */
  app.post<{ Params: { id: string } }>(
    "/admin/users/:id/ban",
    async (request) => {
      const { userId: actorId, role } = await requireModerator(ctx, request);
      const body = banBody.parse(request.body);

      if (request.params.id === actorId) {
        throw badRequest("لا تستطيع حظر نفسك", "self_ban");
      }

      const [target] = await ctx.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, request.params.id))
        .limit(1);

      if (!target) throw notFound("المستخدم غير موجود", "user_not_found");

      // المشرف لا يحظر مشرفاً؛ ذلك للمدير وحده
      if (target.role !== "user" && role !== "admin") {
        throw forbidden("حظر المشرفين للمدير فقط", "needs_admin");
      }

      await ctx.db
        .update(users)
        .set({
          isBanned: true,
          banReason: body.reason,
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id));

      await revokeAllSessions(ctx, target.id);

      await ctx.db
        .update(listings)
        .set({ status: "rejected", rejectionReason: "حساب محظور" })
        .where(
          and(
            eq(listings.userId, target.id),
            inArray(listings.status, ["published", "pending"]),
          ),
        );

      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/users/:id/unban",
    async (request) => {
      await requireModerator(ctx, request);

      await ctx.db
        .update(users)
        .set({ isBanned: false, banReason: null, updatedAt: new Date() })
        .where(eq(users.id, request.params.id));

      // الإعلانات لا تُعاد تلقائياً: تُراجَع كأي إعلان جديد
      return { ok: true, note: "إعلاناته تبقى مرفوضة حتى يعيد نشرها" };
    },
  );
}

/** كل صور مجموعة إعلانات، للمراجعة البصرية في الطابور. */
async function listingImageMap(ctx: AppContext, listingIds: string[]) {
  const map = new Map<string, string[]>();
  if (listingIds.length === 0) return map;

  const rows = await ctx.db
    .select({
      listingId: listingImages.listingId,
      storageKey: listingImages.storageKey,
      sortOrder: listingImages.sortOrder,
    })
    .from(listingImages)
    .where(inArray(listingImages.listingId, listingIds))
    .orderBy(listingImages.listingId, listingImages.sortOrder);

  for (const row of rows) {
    const url = imageUrl(ctx, row.storageKey);
    if (!url) continue;
    const bucket = map.get(row.listingId) ?? [];
    bucket.push(url);
    map.set(row.listingId, bucket);
  }

  return map;
}
