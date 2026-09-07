import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  categories,
  cities,
  favorites,
  listingImages,
  listings,
  reports,
  savedSearches,
} from "@souqna/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { imageUrl, type AppContext } from "../context.js";
import { badRequest, notFound } from "../errors.js";

/* --------------------------------------------------------------- schemas */

/**
 * أسباب البلاغ.
 *
 * قائمة مغلقة لا نص حر: النص الحر يعني قراءة كل بلاغ يدوياً، والقائمة
 * تسمح بفرز الطابور وقياس أي مشكلة أكثر تكراراً.
 */
const REPORT_REASONS = [
  "fake",
  "scam",
  "sold",
  "wrong_category",
  "offensive",
  "duplicate",
  "wrong_price",
  "other",
] as const;

export const REPORT_REASON_LABELS: Record<string, string> = {
  fake: "إعلان وهمي",
  scam: "محاولة احتيال",
  sold: "مباع أو غير متوفر",
  wrong_category: "في القسم الخطأ",
  offensive: "محتوى مسيء",
  duplicate: "مكرر",
  wrong_price: "السعر غير حقيقي",
  other: "سبب آخر",
};

const reportBody = z.object({
  targetType: z.enum(["listing", "user", "message"]),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(600).optional(),
});

const savedSearchBody = z.object({
  nameAr: z.string().min(2).max(60),
  query: z.object({
    categoryId: z.number().int().positive().optional(),
    cityId: z.number().int().positive().optional(),
    minPrice: z.number().int().nonnegative().optional(),
    maxPrice: z.number().int().nonnegative().optional(),
    condition: z.enum(["new", "used", "imported"]).optional(),
    q: z.string().max(80).optional(),
  }),
  notify: z.boolean().default(true),
});

/** حدّ يومي للبلاغات لكل مستخدم، حتى لا يُستعمل البلاغ سلاحاً ضد منافس. */
const MAX_REPORTS_PER_DAY = 20;

/* ---------------------------------------------------------------- routes */

export function registerEngagementRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  /* ------------------------------------------------------------ المفضلة */

  app.post<{ Params: { id: string } }>(
    "/listings/:id/favorite",
    async (request) => {
      const userId = requireUserId(request);

      const [listing] = await ctx.db
        .select({ id: listings.id })
        .from(listings)
        .where(eq(listings.id, request.params.id))
        .limit(1);

      if (!listing) throw notFound("الإعلان غير موجود", "listing_not_found");

      await ctx.db
        .insert(favorites)
        .values({ userId, listingId: listing.id })
        .onConflictDoNothing();

      return { ok: true, isFavorite: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/listings/:id/favorite",
    async (request) => {
      const userId = requireUserId(request);

      await ctx.db
        .delete(favorites)
        .where(
          and(
            eq(favorites.userId, userId),
            eq(favorites.listingId, request.params.id),
          ),
        );

      return { ok: true, isFavorite: false };
    },
  );

  app.get("/me/favorites", async (request) => {
    const userId = requireUserId(request);

    const rows = await ctx.db
      .select({
        id: listings.id,
        refNo: listings.refNo,
        title: listings.title,
        priceIqd: listings.priceIqd,
        condition: listings.condition,
        status: listings.status,
        categorySlug: categories.slug,
        categoryNameAr: categories.nameAr,
        cityNameAr: cities.nameAr,
        savedAt: favorites.createdAt,
      })
      .from(favorites)
      .innerJoin(listings, eq(listings.id, favorites.listingId))
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));

    const covers = await coverKeys(
      ctx,
      rows.map((row) => row.id),
    );

    return {
      listings: rows.map((row) => {
        const key = covers.get(row.id);
        return {
          ...row,
          // الإعلان المحفوظ قد يُحذف أو ينتهي؛ التطبيق يعرضه باهتاً لا يخفيه
          isAvailable: row.status === "published",
          coverImage: key ? imageUrl(ctx, key) : null,
        };
      }),
    };
  });

  /* ------------------------------------------------------------ البلاغات */

  app.post("/reports", async (request, reply) => {
    const userId = requireUserId(request);
    const body = reportBody.parse(request.body);

    const dayAgo = new Date(Date.now() - 86_400_000);
    const [today] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reports)
      .where(
        and(eq(reports.reporterId, userId), gt(reports.createdAt, dayAgo)),
      );

    if ((today?.count ?? 0) >= MAX_REPORTS_PER_DAY) {
      throw badRequest(
        "أرسلت بلاغات كثيرة اليوم. جرّب باچر.",
        "report_rate_limited",
      );
    }

    // بلاغ واحد لكل مستخدم على كل هدف: التكرار لا يضيف معلومة ويشوّه الطابور
    const [existing] = await ctx.db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, userId),
          eq(reports.targetType, body.targetType),
          eq(reports.targetId, body.targetId),
        ),
      )
      .limit(1);

    if (existing) {
      return { ok: true, alreadyReported: true };
    }

    await ctx.db.insert(reports).values({
      reporterId: userId,
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason,
      note: body.note ?? null,
    });

    return reply.status(201).send({ ok: true, alreadyReported: false });
  });

  /** أسباب البلاغ بنصوصها العربية، حتى لا تُكرَّر القائمة في التطبيق. */
  app.get("/reports/reasons", async () => ({
    reasons: REPORT_REASONS.map((value) => ({
      value,
      labelAr: REPORT_REASON_LABELS[value] ?? value,
    })),
  }));

  /* ------------------------------------------------------ بحوث محفوظة */

  app.get("/me/searches", async (request) => {
    const userId = requireUserId(request);

    const rows = await ctx.db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(desc(savedSearches.createdAt));

    return { searches: rows };
  });

  app.post("/me/searches", async (request, reply) => {
    const userId = requireUserId(request);
    const body = savedSearchBody.parse(request.body);

    const [created] = await ctx.db
      .insert(savedSearches)
      .values({
        userId,
        nameAr: body.nameAr.trim(),
        query: body.query,
        notify: body.notify,
      })
      .returning({ id: savedSearches.id });

    return reply.status(201).send({ search: created });
  });

  app.delete<{ Params: { id: string } }>(
    "/me/searches/:id",
    async (request) => {
      const userId = requireUserId(request);

      await ctx.db
        .delete(savedSearches)
        .where(
          and(
            eq(savedSearches.id, request.params.id),
            eq(savedSearches.userId, userId),
          ),
        );

      return { ok: true };
    },
  );
}

/** صور الغلاف، بالمصغّرة حين توجد. */
async function coverKeys(ctx: AppContext, listingIds: string[]) {
  if (listingIds.length === 0) return new Map<string, string>();

  const rows = await ctx.db
    .select({
      listingId: listingImages.listingId,
      storageKey: listingImages.storageKey,
      thumbKey: listingImages.thumbKey,
      sortOrder: listingImages.sortOrder,
    })
    .from(listingImages)
    .where(inArray(listingImages.listingId, listingIds))
    .orderBy(listingImages.listingId, listingImages.sortOrder);

  const covers = new Map<string, string>();
  for (const row of rows) {
    if (!covers.has(row.listingId)) {
      covers.set(row.listingId, row.thumbKey ?? row.storageKey);
    }
  }
  return covers;
}
