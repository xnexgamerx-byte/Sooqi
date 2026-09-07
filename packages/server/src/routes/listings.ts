import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  categories,
  categoryFields,
  cities,
  favorites,
  listingAttributes,
  listingImages,
  listingViews,
  listings,
  phoneReveals,
  users,
} from "@souqna/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUserId, requireUserId, viewerHash } from "../auth.js";
import { imageUrl, type AppContext } from "../context.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { isOwnKey } from "../storage.js";

/** حدّ الصور لكل إعلان. يطابق ما تعلنه /uploads/limits. */
const MAX_IMAGES = 12;

/* --------------------------------------------------------------- schemas */

const browseQuery = z.object({
  category: z.string().max(64).optional(),
  city: z.string().max(64).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  condition: z.enum(["new", "used", "imported"]).optional(),
  q: z.string().max(80).optional(),
  sort: z.enum(["recent", "cheap", "expensive"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  /** مؤشر الصفحة التالية للترتيب «الأحدث»: "<تاريخ>_<معرّف>" */
  cursor: z.string().max(80).optional(),
  /** إزاحة الصفحة لترتيبي السعر فقط. */
  offset: z.coerce.number().int().min(0).max(2000).default(0),
});

const createBody = z.object({
  categorySlug: z.string().min(1).max(64),
  citySlug: z.string().min(1).max(64),
  title: z.string().min(6).max(70),
  description: z.string().max(4000).optional(),
  priceIqd: z.number().int().nonnegative().nullable().optional(),
  condition: z.enum(["new", "used", "imported"]).optional(),
  contactPhone: z.string().min(8).max(20).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  images: z
    .array(
      z.object({
        storageKey: z.string().min(1).max(400),
        thumbKey: z.string().min(1).max(400).optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(MAX_IMAGES)
    .optional(),
});

const updateBody = createBody.partial().omit({ categorySlug: true });

/* --------------------------------------------------------------- helpers */

/** القسم المطلوب مع أبنائه، حتى يشمل «سيارات» كل ما تحته. */
async function resolveCategoryIds(ctx: AppContext, slug: string) {
  const [parent] = await ctx.db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  if (!parent) throw notFound("القسم غير موجود", "category_not_found");

  const children = await ctx.db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, parent.id));

  return [parent.id, ...children.map((row) => row.id)];
}

/** المدينة المطلوبة مع مناطقها. */
async function resolveCityIds(ctx: AppContext, slug: string) {
  const [parent] = await ctx.db
    .select({ id: cities.id })
    .from(cities)
    .where(eq(cities.slug, slug))
    .limit(1);

  if (!parent) throw notFound("المدينة غير موجودة", "city_not_found");

  const children = await ctx.db
    .select({ id: cities.id })
    .from(cities)
    .where(eq(cities.parentId, parent.id));

  return [parent.id, ...children.map((row) => row.id)];
}

function encodeCursor(bumpedAt: Date, id: string) {
  return `${bumpedAt.toISOString()}_${id}`;
}

function decodeCursor(cursor: string): { bumpedAt: Date; id: string } {
  const separator = cursor.indexOf("_");
  if (separator === -1) throw badRequest("مؤشر الصفحة غير صالح", "bad_cursor");

  const iso = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  const bumpedAt = new Date(iso);

  if (Number.isNaN(bumpedAt.getTime()) || id.length === 0) {
    throw badRequest("مؤشر الصفحة غير صالح", "bad_cursor");
  }

  return { bumpedAt, id };
}

/** صور الغلاف لمجموعة إعلانات، باستعلام واحد بدل استعلام لكل صف. */
async function coverImages(ctx: AppContext, listingIds: string[]) {
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
    .orderBy(asc(listingImages.listingId), asc(listingImages.sortOrder));

  const covers = new Map<string, string>();
  for (const row of rows) {
    // المصغّرة أولاً: الشبكة الثلاثية تعرض ثلاث صور في الصف، وتحميل
    // الأصل فيها يهدر بيانات المستخدم بلا فائدة بصرية.
    if (!covers.has(row.listingId)) {
      covers.set(row.listingId, row.thumbKey ?? row.storageKey);
    }
  }
  return covers;
}

/** أي من هذه الإعلانات محفوظ عند هذا المستخدم، باستعلام واحد. */
async function favoriteSet(
  ctx: AppContext,
  userId: string | null,
  listingIds: string[],
): Promise<Set<string>> {
  if (!userId || listingIds.length === 0) return new Set();

  const rows = await ctx.db
    .select({ listingId: favorites.listingId })
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, userId),
        inArray(favorites.listingId, listingIds),
      ),
    );

  return new Set(rows.map((row) => row.listingId));
}

/* ---------------------------------------------------------------- routes */

export function registerListingRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  /**
   * تصفّح الإعلانات المنشورة.
   *
   * الترتيب «الأحدث» يستخدم مؤشراً (keyset) لأنه الافتراضي وأكثر ما يُمرّر
   * فيه المستخدم؛ الإزاحة تكرّر الصفوف حين ينشر أحدهم إعلاناً أثناء التمرير.
   * ترتيبا السعر يستخدمان الإزاحة لأنهما أقل استخداماً بكثير.
   */
  app.get("/listings", async (request) => {
    const query = browseQuery.parse(request.query);

    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw badRequest("أدنى سعر أكبر من أعلى سعر", "bad_price_range");
    }

    const filters = [eq(listings.status, "published")];

    if (query.category) {
      filters.push(
        inArray(listings.categoryId, await resolveCategoryIds(ctx, query.category)),
      );
    }
    if (query.city) {
      filters.push(inArray(listings.cityId, await resolveCityIds(ctx, query.city)));
    }
    if (query.condition) filters.push(eq(listings.condition, query.condition));
    if (query.minPrice !== undefined) {
      filters.push(gte(listings.priceIqd, query.minPrice));
    }
    if (query.maxPrice !== undefined) {
      filters.push(lte(listings.priceIqd, query.maxPrice));
    }
    if (query.q) {
      const pattern = `%${query.q}%`;
      const match = or(
        ilike(listings.title, pattern),
        ilike(listings.description, pattern),
      );
      if (match) filters.push(match);
    }

    if (query.sort === "recent" && query.cursor) {
      const { bumpedAt, id } = decodeCursor(query.cursor);
      /**
       * مقارنة صفّية للترقيم بالمؤشر.
       *
       * القيم تُمرَّر كنصوص مع صبّ صريح: قالب sql في Drizzle لا يعرف نوع
       * العمود، فتمرير كائن Date خام يصل إلى برنامج التشغيل كما هو ويفشل
       * الاستعلام كله.
       */
      filters.push(
        sql`(${listings.bumpedAt}, ${listings.id}) < (${bumpedAt.toISOString()}::timestamptz, ${id}::uuid)`,
      );
    }

    const orderBy =
      query.sort === "cheap"
        ? [asc(listings.priceIqd), asc(listings.id)]
        : query.sort === "expensive"
          ? [desc(listings.priceIqd), desc(listings.id)]
          : [desc(listings.bumpedAt), desc(listings.id)];

    const rows = await ctx.db
      .select({
        id: listings.id,
        refNo: listings.refNo,
        title: listings.title,
        priceIqd: listings.priceIqd,
        condition: listings.condition,
        bumpedAt: listings.bumpedAt,
        categorySlug: categories.slug,
        categoryNameAr: categories.nameAr,
        cityNameAr: cities.nameAr,
      })
      .from(listings)
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .where(and(...filters))
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(query.sort === "recent" ? 0 : query.offset);

    const ids = rows.map((row) => row.id);
    const [covers, saved] = await Promise.all([
      coverImages(ctx, ids),
      favoriteSet(ctx, currentUserId(request), ids),
    ]);

    const last = rows.at(-1);
    const nextCursor =
      query.sort === "recent" && rows.length === query.limit && last?.bumpedAt
        ? encodeCursor(last.bumpedAt, last.id)
        : null;

    return {
      listings: rows.map((row) => {
        const key = covers.get(row.id);
        return {
          id: row.id,
          refNo: row.refNo,
          title: row.title,
          priceIqd: row.priceIqd,
          condition: row.condition,
          categorySlug: row.categorySlug,
          categoryNameAr: row.categoryNameAr,
          cityNameAr: row.cityNameAr,
          coverImage: key ? imageUrl(ctx, key) : null,
          isFavorite: saved.has(row.id),
        };
      }),
      nextCursor,
      nextOffset:
        query.sort === "recent" || rows.length < query.limit
          ? null
          : query.offset + rows.length,
    };
  });

  /**
   * تفاصيل إعلان. لا يُعاد رقم الهاتف هنا إطلاقاً — يُجلب بضغطة منفصلة
   * على /listings/:id/phone حتى لا يمكن كشط الأرقام بالجملة.
   */
  app.get<{ Params: { id: string } }>("/listings/:id", async (request) => {
    const [row] = await ctx.db
      .select({
        id: listings.id,
        refNo: listings.refNo,
        title: listings.title,
        description: listings.description,
        priceIqd: listings.priceIqd,
        condition: listings.condition,
        status: listings.status,
        viewCount: listings.viewCount,
        publishedAt: listings.publishedAt,
        categoryId: listings.categoryId,
        categorySlug: categories.slug,
        categoryNameAr: categories.nameAr,
        cityNameAr: cities.nameAr,
        sellerId: users.id,
        sellerName: users.name,
        sellerPublicId: users.publicId,
        sellerVerified: users.isVerified,
        sellerSince: users.createdAt,
      })
      .from(listings)
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .innerJoin(users, eq(users.id, listings.userId))
      .where(eq(listings.id, request.params.id))
      .limit(1);

    if (!row || row.status !== "published") {
      throw notFound("الإعلان غير موجود أو غير منشور", "listing_not_found");
    }

    const [images, attributes, saved] = await Promise.all([
      ctx.db
        .select({
          id: listingImages.id,
          storageKey: listingImages.storageKey,
          thumbKey: listingImages.thumbKey,
          width: listingImages.width,
          height: listingImages.height,
        })
        .from(listingImages)
        .where(eq(listingImages.listingId, row.id))
        .orderBy(asc(listingImages.sortOrder)),
      ctx.db
        .select({
          key: categoryFields.key,
          labelAr: categoryFields.labelAr,
          type: categoryFields.type,
          options: categoryFields.options,
          unitAr: categoryFields.unitAr,
          valueText: listingAttributes.valueText,
          valueNumber: listingAttributes.valueNumber,
          sortOrder: categoryFields.sortOrder,
        })
        .from(listingAttributes)
        .innerJoin(
          categoryFields,
          eq(categoryFields.id, listingAttributes.fieldId),
        )
        .where(eq(listingAttributes.listingId, row.id))
        .orderBy(asc(categoryFields.sortOrder)),
      favoriteSet(ctx, currentUserId(request), [row.id]),
    ]);

    // عدّاد المشاهدات: صف خام + زيادة العدّاد. التجميع الدوري لاحقاً.
    const hash = viewerHash(request);
    await ctx.db
      .insert(listingViews)
      .values({ listingId: row.id, viewerHash: hash });
    await ctx.db
      .update(listings)
      .set({ viewCount: sql`${listings.viewCount} + 1` })
      .where(eq(listings.id, row.id));

    return {
      listing: {
        id: row.id,
        refNo: row.refNo,
        title: row.title,
        description: row.description,
        priceIqd: row.priceIqd,
        condition: row.condition,
        viewCount: row.viewCount + 1,
        isFavorite: saved.has(row.id),
        publishedAt: row.publishedAt,
        categorySlug: row.categorySlug,
        categoryNameAr: row.categoryNameAr,
        cityNameAr: row.cityNameAr,
        images: images.map((image) => ({
          id: image.id,
          url: imageUrl(ctx, image.storageKey),
          thumbUrl: image.thumbKey ? imageUrl(ctx, image.thumbKey) : null,
          width: image.width,
          height: image.height,
        })),
        attributes: attributes.map((attribute) => ({
          key: attribute.key,
          labelAr: attribute.labelAr,
          unitAr: attribute.unitAr,
          // نعرض النص العربي للخيار لا القيمة اللاتينية المخزّنة
          valueAr:
            attribute.options?.find(
              (option) => option.value === attribute.valueText,
            )?.labelAr ??
            attribute.valueText ??
            (attribute.valueNumber !== null
              ? String(attribute.valueNumber)
              : null),
        })),
        seller: {
          id: row.sellerId,
          name: row.sellerName,
          publicId: row.sellerPublicId,
          isVerified: row.sellerVerified,
          memberSince: row.sellerSince,
        },
      },
    };
  });

  /**
   * كشف رقم البائع. كل ضغطة تُسجَّل مع بصمة الزائر، فيظهر الكشط بالجملة
   * في السجلّ قبل أن يصبح مشكلة.
   */
  app.post<{ Params: { id: string } }>(
    "/listings/:id/phone",
    async (request) => {
      const [row] = await ctx.db
        .select({
          id: listings.id,
          status: listings.status,
          contactPhone: listings.contactPhone,
          sellerPhone: users.phone,
        })
        .from(listings)
        .innerJoin(users, eq(users.id, listings.userId))
        .where(eq(listings.id, request.params.id))
        .limit(1);

      if (!row || row.status !== "published") {
        throw notFound("الإعلان غير موجود", "listing_not_found");
      }

      const phone = row.contactPhone ?? row.sellerPhone;
      if (!phone) {
        throw notFound("لا يوجد رقم لهذا الإعلان", "no_phone");
      }

      await ctx.db.insert(phoneReveals).values({
        listingId: row.id,
        viewerHash: viewerHash(request),
      });

      return { phone };
    },
  );

  /** إعلاناتي، بكل الحالات. تستخدمها شاشة «إعلاناتي». */
  app.get("/me/listings", async (request) => {
    const userId = requireUserId(request);

    const rows = await ctx.db
      .select({
        id: listings.id,
        refNo: listings.refNo,
        title: listings.title,
        priceIqd: listings.priceIqd,
        status: listings.status,
        viewCount: listings.viewCount,
        chatCount: listings.chatCount,
        createdAt: listings.createdAt,
        categoryNameAr: categories.nameAr,
      })
      .from(listings)
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .where(eq(listings.userId, userId))
      .orderBy(desc(listings.createdAt));

    const covers = await coverImages(
      ctx,
      rows.map((row) => row.id),
    );

    return {
      listings: rows.map((row) => {
        const key = covers.get(row.id);
        return { ...row, coverImage: key ? imageUrl(ctx, key) : null };
      }),
    };
  });

  /** ينشئ مسودة. النشر خطوة منفصلة تتحقق من الحدّ. */
  app.post("/listings", async (request, reply) => {
    const userId = requireUserId(request);
    const body = createBody.parse(request.body);

    const [category] = await ctx.db
      .select({ id: categories.id, isActive: categories.isActive })
      .from(categories)
      .where(eq(categories.slug, body.categorySlug))
      .limit(1);

    if (!category) throw notFound("القسم غير موجود", "category_not_found");
    if (!category.isActive) {
      throw badRequest("هذا القسم غير مفتوح للنشر بعد", "category_inactive");
    }

    const [city] = await ctx.db
      .select({ id: cities.id })
      .from(cities)
      .where(eq(cities.slug, body.citySlug))
      .limit(1);

    if (!city) throw notFound("المدينة غير موجودة", "city_not_found");

    const [created] = await ctx.db
      .insert(listings)
      .values({
        userId,
        categoryId: category.id,
        cityId: city.id,
        title: body.title,
        description: body.description ?? null,
        priceIqd: body.priceIqd ?? null,
        condition: body.condition ?? null,
        contactPhone: body.contactPhone ?? null,
        status: "draft",
      })
      .returning({ id: listings.id, refNo: listings.refNo });

    if (!created) throw badRequest("تعذّر إنشاء الإعلان", "create_failed");

    if (body.images?.length) {
      await attachImages(ctx, created.id, body.images, 0);
    }

    if (body.attributes) {
      await saveAttributes(ctx, created.id, category.id, body.attributes);
    }

    return reply.status(201).send({ listing: created });
  });

  app.patch<{ Params: { id: string } }>(
    "/listings/:id",
    async (request) => {
      const userId = requireUserId(request);
      const body = updateBody.parse(request.body);

      const [existing] = await ctx.db
        .select({
          id: listings.id,
          userId: listings.userId,
          categoryId: listings.categoryId,
          status: listings.status,
        })
        .from(listings)
        .where(eq(listings.id, request.params.id))
        .limit(1);

      if (!existing) throw notFound("الإعلان غير موجود", "listing_not_found");
      if (existing.userId !== userId) throw forbidden();
      if (existing.status === "deleted") {
        throw badRequest("الإعلان محذوف", "listing_deleted");
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (body.title !== undefined) patch.title = body.title;
      if (body.description !== undefined) patch.description = body.description;
      if (body.priceIqd !== undefined) patch.priceIqd = body.priceIqd;
      if (body.condition !== undefined) patch.condition = body.condition;
      if (body.contactPhone !== undefined) {
        patch.contactPhone = body.contactPhone;
      }

      if (body.citySlug) {
        const [city] = await ctx.db
          .select({ id: cities.id })
          .from(cities)
          .where(eq(cities.slug, body.citySlug))
          .limit(1);
        if (!city) throw notFound("المدينة غير موجودة", "city_not_found");
        patch.cityId = city.id;
      }

      // التعديل بعد النشر يعيد الإعلان إلى المراجعة
      if (existing.status === "published") patch.status = "pending";

      await ctx.db
        .update(listings)
        .set(patch)
        .where(eq(listings.id, existing.id));

      if (body.attributes) {
        await saveAttributes(
          ctx,
          existing.id,
          existing.categoryId,
          body.attributes,
        );
      }

      return { ok: true, status: patch.status ?? existing.status };
    },
  );

  /**
   * ينشر الإعلان. المراجعة اليدوية مفعّلة في أول ثلاثين يوماً، فالحالة
   * تصير «بانتظار المراجعة» لا «منشور» — راجع القسم العاشر من الخطة.
   */
  app.post<{ Params: { id: string } }>(
    "/listings/:id/publish",
    async (request) => {
      const userId = requireUserId(request);

      const [existing] = await ctx.db
        .select({
          id: listings.id,
          userId: listings.userId,
          status: listings.status,
          title: listings.title,
        })
        .from(listings)
        .where(eq(listings.id, request.params.id))
        .limit(1);

      if (!existing) throw notFound("الإعلان غير موجود", "listing_not_found");
      if (existing.userId !== userId) throw forbidden();

      const [imageCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listingImages)
        .where(eq(listingImages.listingId, existing.id));

      if (!imageCount || imageCount.count === 0) {
        throw badRequest("أضف صورة واحدة على الأقل", "images_required");
      }

      const [user] = await ctx.db
        .select({ limit: users.activeListingLimit })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const [active] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listings)
        .where(
          and(
            eq(listings.userId, userId),
            inArray(listings.status, ["published", "pending"]),
          ),
        );

      if (user && active && active.count >= user.limit) {
        throw badRequest(
          `وصلت حدّ ${user.limit} إعلاناً فعّالاً. احذف إعلاناً أو ارفع الحدّ.`,
          "limit_reached",
        );
      }

      const now = new Date();
      const expires = new Date(now);
      expires.setDate(expires.getDate() + 30);

      await ctx.db
        .update(listings)
        .set({
          status: "pending",
          publishedAt: now,
          bumpedAt: now,
          expiresAt: expires,
          updatedAt: now,
        })
        .where(eq(listings.id, existing.id));

      return {
        ok: true,
        status: "pending",
        message: "إعلانك قيد المراجعة وينشر خلال ساعات.",
      };
    },
  );

  /** يضيف صوراً إلى إعلان قائم، بعد رفعها إلى R2 بالروابط الموقّعة. */
  app.post<{ Params: { id: string } }>(
    "/listings/:id/images",
    async (request, reply) => {
      const userId = requireUserId(request);
      const body = z
        .object({
          images: z
            .array(
              z.object({
                storageKey: z.string().min(1).max(400),
                thumbKey: z.string().min(1).max(400).optional(),
                width: z.number().int().positive().optional(),
                height: z.number().int().positive().optional(),
              }),
            )
            .min(1)
            .max(MAX_IMAGES),
        })
        .parse(request.body);

      const listing = await ownedListing(ctx, request.params.id, userId);

      const [existing] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listingImages)
        .where(eq(listingImages.listingId, listing.id));

      const already = existing?.count ?? 0;
      if (already + body.images.length > MAX_IMAGES) {
        throw badRequest(
          `الحد ${MAX_IMAGES} صور للإعلان الواحد`,
          "too_many_images",
        );
      }

      await attachImages(ctx, listing.id, body.images, already);

      return reply.status(201).send({ ok: true, count: body.images.length });
    },
  );

  /** يحذف صورة من إعلان. لا يحذف الكائن من R2 — انظر التعليق في attachImages. */
  app.delete<{ Params: { id: string; imageId: string } }>(
    "/listings/:id/images/:imageId",
    async (request) => {
      const userId = requireUserId(request);
      const listing = await ownedListing(ctx, request.params.id, userId);

      const deleted = await ctx.db
        .delete(listingImages)
        .where(
          and(
            eq(listingImages.id, request.params.imageId),
            eq(listingImages.listingId, listing.id),
          ),
        )
        .returning({ id: listingImages.id });

      if (deleted.length === 0) {
        throw notFound("الصورة غير موجودة", "image_not_found");
      }

      return { ok: true };
    },
  );
}

/** يجلب إعلاناً ويتأكد أن الطالب صاحبه. */
async function ownedListing(
  ctx: AppContext,
  listingId: string,
  userId: string,
) {
  const [listing] = await ctx.db
    .select({ id: listings.id, userId: listings.userId })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!listing) throw notFound("الإعلان غير موجود", "listing_not_found");
  if (listing.userId !== userId) throw forbidden();

  return listing;
}

/**
 * يربط مفاتيح صور مرفوعة بإعلان.
 *
 * المفاتيح تصل من العميل، فنتحقق أنها من الشكل الذي يوقّعه خادمنا. بدون
 * هذا الفحص يستطيع أي مستخدم ربط إعلانه بأي كائن في الحاوية.
 *
 * الحذف هنا يزيل الصف فقط ويترك الكائن في R2. الكائنات اليتيمة تكلّف
 * ٠٫٠١٥ دولار للغيغابايت شهرياً، أي لا شيء عملياً، ومطاردتها الآن تعقيد
 * بلا عائد. مهمة مطابقة دورية مدرجة في «ما زال ناقصاً».
 */
async function attachImages(
  ctx: AppContext,
  listingId: string,
  images: {
    storageKey: string;
    thumbKey?: string;
    width?: number;
    height?: number;
  }[],
  startOrder: number,
) {
  for (const image of images) {
    if (!isOwnKey(image.storageKey)) {
      throw badRequest("مفتاح صورة غير صالح", "bad_image_key");
    }
    if (image.thumbKey && !isOwnKey(image.thumbKey)) {
      throw badRequest("مفتاح مصغّرة غير صالح", "bad_image_key");
    }
  }

  await ctx.db.insert(listingImages).values(
    images.map((image, index) => ({
      listingId,
      storageKey: image.storageKey,
      thumbKey: image.thumbKey ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      sortOrder: startOrder + index,
    })),
  );
}

/** يستبدل قيم الحقول الديناميكية لإعلان. */
async function saveAttributes(
  ctx: AppContext,
  listingId: string,
  categoryId: number,
  values: Record<string, string>,
) {
  const fields = await ctx.db
    .select({
      id: categoryFields.id,
      key: categoryFields.key,
      type: categoryFields.type,
    })
    .from(categoryFields)
    .where(eq(categoryFields.categoryId, categoryId));

  const byKey = new Map(fields.map((field) => [field.key, field]));

  for (const [key, raw] of Object.entries(values)) {
    const field = byKey.get(key);
    if (!field) continue;

    const asNumber = field.type === "number" ? Number(raw) : null;
    if (asNumber !== null && Number.isNaN(asNumber)) {
      throw badRequest(`قيمة غير رقمية للحقل ${key}`, "bad_attribute");
    }

    await ctx.db
      .insert(listingAttributes)
      .values({
        listingId,
        fieldId: field.id,
        valueText: field.type === "number" ? null : raw,
        valueNumber: asNumber,
      })
      .onConflictDoUpdate({
        target: [listingAttributes.listingId, listingAttributes.fieldId],
        set: {
          valueText: field.type === "number" ? null : raw,
          valueNumber: asNumber,
        },
      });
  }
}
