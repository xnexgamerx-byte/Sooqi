import { and, eq, inArray, ne } from "drizzle-orm";
import { categories, cities, listings, savedSearches } from "@souqna/db";
import type { AppContext } from "./context.js";
import { preview, pushToUser, pushToUsers } from "./push.js";

/**
 * إشعارات المحتوى.
 *
 * كلها تُستدعى بلا انتظار (`void`) ولا ترمي: تأخّر إشعار أو فشله يجب ألا
 * يمنع موافقة مشرف أو نشر إعلان.
 */

/** يخبر الناشر أن إعلانه صار منشوراً. */
export async function notifyApproved(ctx: AppContext, listingId: string) {
  const [row] = await ctx.db
    .select({ userId: listings.userId, title: listings.title })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!row) return;

  await pushToUser(ctx, row.userId, {
    title: "اننشر إعلانك",
    body: preview(row.title),
    data: { type: "listing", listingId },
  });
}

/** يخبر الناشر برفض إعلانه وسببه، فيعرف ما يصلحه. */
export async function notifyRejected(
  ctx: AppContext,
  listingId: string,
  reason: string,
) {
  const [row] = await ctx.db
    .select({ userId: listings.userId, title: listings.title })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!row) return;

  await pushToUser(ctx, row.userId, {
    title: "إعلانك محتاج تعديل",
    body: `${preview(row.title, 40)} — ${preview(reason, 60)}`,
    data: { type: "listing", listingId },
  });
}

/**
 * ينبّه أصحاب البحوث المحفوظة المطابقة لإعلان جديد.
 *
 * يقارن في الذاكرة لا باستعلام لكل بحث: البحوث المحفوظة قليلة نسبياً
 * (بحث أو اثنان لكل مستخدم مهتم)، وقراءتها دفعة واحدة أرخص من ألف استعلام.
 * حين تصير عشرات الآلاف، انقل هذا إلى مهمة في طابور.
 */
export async function notifySavedSearches(
  ctx: AppContext,
  listingId: string,
) {
  const [listing] = await ctx.db
    .select({
      id: listings.id,
      userId: listings.userId,
      title: listings.title,
      priceIqd: listings.priceIqd,
      condition: listings.condition,
      categoryId: listings.categoryId,
      cityId: listings.cityId,
      categoryParentId: categories.parentId,
      cityParentId: cities.parentId,
    })
    .from(listings)
    .innerJoin(categories, eq(categories.id, listings.categoryId))
    .innerJoin(cities, eq(cities.id, listings.cityId))
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!listing) return;

  const watchers = await ctx.db
    .select({
      userId: savedSearches.userId,
      query: savedSearches.query,
    })
    .from(savedSearches)
    .where(
      and(
        eq(savedSearches.notify, true),
        // لا ننبّه الناشر على إعلانه هو
        ne(savedSearches.userId, listing.userId),
      ),
    );

  const matched = new Set<string>();

  for (const watcher of watchers) {
    const query = watcher.query;

    // القسم: يطابق القسم نفسه أو أباه، فبحث «سيارات» يلتقط «سيارات للبيع»
    if (
      query.categoryId !== undefined &&
      query.categoryId !== listing.categoryId &&
      query.categoryId !== listing.categoryParentId
    ) {
      continue;
    }

    if (
      query.cityId !== undefined &&
      query.cityId !== listing.cityId &&
      query.cityId !== listing.cityParentId
    ) {
      continue;
    }

    if (query.condition && query.condition !== listing.condition) continue;

    if (query.minPrice !== undefined) {
      if (listing.priceIqd === null || listing.priceIqd < query.minPrice) {
        continue;
      }
    }

    if (query.maxPrice !== undefined) {
      if (listing.priceIqd === null || listing.priceIqd > query.maxPrice) {
        continue;
      }
    }

    if (query.q) {
      const needle = query.q.trim().toLowerCase();
      if (needle && !listing.title.toLowerCase().includes(needle)) continue;
    }

    matched.add(watcher.userId);
  }

  if (matched.size === 0) return;

  await pushToUsers(ctx, [...matched], {
    title: "إعلان جديد يطابق بحثك",
    body: preview(listing.title),
    data: { type: "listing", listingId: listing.id },
  });

  await ctx.db
    .update(savedSearches)
    .set({ lastNotifiedAt: new Date() })
    .where(
      and(
        eq(savedSearches.notify, true),
        inArray(savedSearches.userId, [...matched]),
      ),
    );
}
