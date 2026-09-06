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
  listingAttributes,
  listingImages,
  listingViews,
  listings,
  phoneReveals,
  users,
} from "@souqna/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId, viewerHash } from "../auth.js";
import { imageUrl, type AppContext } from "../context.js";
import { badRequest, forbidden, notFound } from "../errors.js";

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
    .array(z.object({ storageKey: z.string().min(1).max(400) }))
    .max(12)
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
      sortOrder: listingImages.sortOrder,
    })
    .from(listingImages)
    .where(inArray(listingImages.listingId, listingIds))
    .orderBy(asc(listingImages.listingId), asc(listingImages.sortOrder));

  const covers = new Map<string, string>();
  for (const row of rows) {
    if (!covers.has(row.listingId)) covers.set(row.listingId, row.storageKey);
  }
  return covers;
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
      filters.push(
        sql`(${listings.bumpedAt}, ${listings.id}) < (${bumpedAt}, ${id})`,
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

    const covers = await coverImages(
      ctx,
      rows.map((row) => row.id),
    );

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

    const [images, attributes] = await Promise.all([
      ctx.db
        .select({
          storageKey: listingImages.storageKey,
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
        publishedAt: row.publishedAt,
        categorySlug: row.categorySlug,
        categoryNameAr: row.categoryNameAr,
        cityNameAr: row.cityNameAr,
        images: images.map((image) => ({
          url: imageUrl(ctx, image.storageKey),
          storageKey: image.storageKey,
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
    const userId = requireUserId(ctx, request);

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
    const userId = requireUserId(ctx, request);
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
      await ctx.db.insert(listingImages).values(
        body.images.map((image, index) => ({
          listingId: created.id,
          storageKey: image.storageKey,
          sortOrder: index,
        })),
      );
    }

    if (body.attributes) {
      await saveAttributes(ctx, created.id, category.id, body.attributes);
    }

    return reply.status(201).send({ listing: created });
  });

  app.patch<{ Params: { id: string } }>(
    "/listings/:id",
    async (request) => {
      const userId = requireUserId(ctx, request);
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
      const userId = requireUserId(ctx, request);

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
