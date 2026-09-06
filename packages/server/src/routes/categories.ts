import { asc, eq, isNull } from "drizzle-orm";
import { categories, categoryFields } from "@souqna/db";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { notFound } from "../errors.js";

export function registerCategoryRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  /**
   * شجرة الأقسام كاملة.
   *
   * الأقسام المعطّلة تُعاد أيضاً مع `isActive: false` حتى تعرضها الشبكة
   * بحالة «قريباً» بدل إخفائها: شبكة ممتلئة فيها قسمان يعملان تبدو أفضل
   * بكثير من شبكة فيها بطاقتان. راجع القسم الأول من docs/plan.html.
   */
  app.get("/categories", async () => {
    const rows = await ctx.db
      .select({
        id: categories.id,
        slug: categories.slug,
        nameAr: categories.nameAr,
        parentId: categories.parentId,
        iconAsset: categories.iconAsset,
        isActive: categories.isActive,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id));

    const childrenByParent = new Map<number, typeof rows>();
    for (const row of rows) {
      if (row.parentId === null) continue;
      const bucket = childrenByParent.get(row.parentId) ?? [];
      bucket.push(row);
      childrenByParent.set(row.parentId, bucket);
    }

    return {
      categories: rows
        .filter((row) => row.parentId === null)
        .map((parent) => ({
          id: parent.id,
          slug: parent.slug,
          nameAr: parent.nameAr,
          iconAsset: parent.iconAsset,
          isActive: parent.isActive,
          children: (childrenByParent.get(parent.id) ?? []).map((child) => ({
            id: child.id,
            slug: child.slug,
            nameAr: child.nameAr,
            isActive: child.isActive,
          })),
        })),
    };
  });

  /**
   * حقول قسم واحد. التطبيق يستدعيها عند اختيار القسم في نموذج الإعلان
   * وعند فتح شاشة الفلاتر.
   *
   * القسم الفرعي يرث حقول أبيه ما لم يعرّف حقوله الخاصة.
   */
  app.get<{ Params: { slug: string } }>(
    "/categories/:slug/fields",
    async (request) => {
      const [category] = await ctx.db
        .select({
          id: categories.id,
          slug: categories.slug,
          nameAr: categories.nameAr,
          parentId: categories.parentId,
        })
        .from(categories)
        .where(eq(categories.slug, request.params.slug))
        .limit(1);

      if (!category) throw notFound("القسم غير موجود", "category_not_found");

      let fields = await ctx.db
        .select()
        .from(categoryFields)
        .where(eq(categoryFields.categoryId, category.id))
        .orderBy(asc(categoryFields.sortOrder), asc(categoryFields.id));

      if (fields.length === 0 && category.parentId !== null) {
        fields = await ctx.db
          .select()
          .from(categoryFields)
          .where(eq(categoryFields.categoryId, category.parentId))
          .orderBy(asc(categoryFields.sortOrder), asc(categoryFields.id));
      }

      return {
        category: {
          id: category.id,
          slug: category.slug,
          nameAr: category.nameAr,
        },
        fields: fields.map((field) => ({
          key: field.key,
          labelAr: field.labelAr,
          type: field.type,
          options: field.options ?? [],
          unitAr: field.unitAr,
          isRequired: field.isRequired,
          isFilterable: field.isFilterable,
        })),
      };
    },
  );

  /** الأقسام الجذرية المفعّلة فقط — تستخدمها شاشة «أضف إعلان». */
  app.get("/categories/postable", async () => {
    const rows = await ctx.db
      .select({
        id: categories.id,
        slug: categories.slug,
        nameAr: categories.nameAr,
        iconAsset: categories.iconAsset,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.id));

    return { categories: rows };
  });

  /** يُستخدم داخلياً في الفلاتر: القسم + أبناؤه. */
  app.get<{ Params: { slug: string } }>(
    "/categories/:slug",
    async (request) => {
      const [category] = await ctx.db
        .select()
        .from(categories)
        .where(eq(categories.slug, request.params.slug))
        .limit(1);

      if (!category) throw notFound("القسم غير موجود", "category_not_found");

      const children = await ctx.db
        .select({
          id: categories.id,
          slug: categories.slug,
          nameAr: categories.nameAr,
          isActive: categories.isActive,
        })
        .from(categories)
        .where(eq(categories.parentId, category.id))
        .orderBy(asc(categories.sortOrder));

      return {
        category: {
          id: category.id,
          slug: category.slug,
          nameAr: category.nameAr,
          iconAsset: category.iconAsset,
          isActive: category.isActive,
          isRoot: category.parentId === null,
        },
        children,
      };
    },
  );

  /** أقسام الجذر فقط، بدون أبناء — للشبكة في الشاشة الأولى. */
  app.get("/categories/roots", async () => {
    const rows = await ctx.db
      .select({
        id: categories.id,
        slug: categories.slug,
        nameAr: categories.nameAr,
        iconAsset: categories.iconAsset,
        isActive: categories.isActive,
      })
      .from(categories)
      .where(isNull(categories.parentId))
      .orderBy(asc(categories.sortOrder), asc(categories.id));

    return { categories: rows };
  });
}
