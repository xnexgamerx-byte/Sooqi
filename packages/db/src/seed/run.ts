/**
 * يزرع الأقسام والمدن. آمن للتشغيل مرات متعددة: يطابق بـ slug ويحدّث.
 *
 *   pnpm db:seed
 */
import { loadRootEnv } from "../env-file.js";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../index.js";
import { categories, categoryFields, cities } from "../schema.js";
import { categorySeed, type SeedCategory, type SeedField } from "./categories.js";
import { citySeed } from "./cities.js";

loadRootEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL غير معرّف. انسخ .env.example إلى .env وعبّئه.");
  process.exit(1);
}

const { db, client } = createDb(url);

async function seedCities() {
  let governorates = 0;
  let areas = 0;

  for (const [index, gov] of citySeed.entries()) {
    const [row] = await db
      .insert(cities)
      .values({
        slug: gov.slug,
        nameAr: gov.nameAr,
        parentId: null,
        sortOrder: index,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: cities.slug,
        set: { nameAr: gov.nameAr, sortOrder: index },
      })
      .returning({ id: cities.id });

    if (!row) throw new Error(`تعذّر إدراج المحافظة ${gov.slug}`);
    governorates += 1;

    for (const [areaIndex, area] of (gov.children ?? []).entries()) {
      await db
        .insert(cities)
        .values({
          slug: area.slug,
          nameAr: area.nameAr,
          parentId: row.id,
          sortOrder: areaIndex,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: cities.slug,
          set: {
            nameAr: area.nameAr,
            parentId: row.id,
            sortOrder: areaIndex,
          },
        });
      areas += 1;
    }
  }

  return { governorates, areas };
}

async function upsertFields(categoryId: number, fields: SeedField[]) {
  for (const [index, field] of fields.entries()) {
    await db
      .insert(categoryFields)
      .values({
        categoryId,
        key: field.key,
        labelAr: field.labelAr,
        type: field.type,
        options: field.options ?? null,
        unitAr: field.unitAr ?? null,
        isRequired: field.isRequired ?? false,
        isFilterable: field.isFilterable ?? true,
        sortOrder: index,
      })
      .onConflictDoUpdate({
        target: [categoryFields.categoryId, categoryFields.key],
        set: {
          labelAr: field.labelAr,
          type: field.type,
          options: field.options ?? null,
          unitAr: field.unitAr ?? null,
          isRequired: field.isRequired ?? false,
          isFilterable: field.isFilterable ?? true,
          sortOrder: index,
        },
      });
  }
}

async function upsertCategory(
  node: SeedCategory,
  parentId: number | null,
  sortOrder: number,
): Promise<number> {
  const [row] = await db
    .insert(categories)
    .values({
      slug: node.slug,
      nameAr: node.nameAr,
      parentId,
      iconAsset: node.iconAsset ?? null,
      sortOrder,
      isActive: node.isActive ?? false,
    })
    .onConflictDoUpdate({
      target: categories.slug,
      set: {
        nameAr: node.nameAr,
        parentId,
        iconAsset: node.iconAsset ?? null,
        sortOrder,
        isActive: node.isActive ?? false,
      },
    })
    .returning({ id: categories.id });

  if (!row) throw new Error(`تعذّر إدراج القسم ${node.slug}`);

  if (node.fields?.length) await upsertFields(row.id, node.fields);

  return row.id;
}

async function seedCategories() {
  let total = 0;

  for (const [index, node] of categorySeed.entries()) {
    const parentId = await upsertCategory(node, null, index);
    total += 1;

    for (const [childIndex, child] of (node.children ?? []).entries()) {
      // القسم الفرعي يرث حقول أبيه ما لم يعرّف حقوله الخاصة
      await upsertCategory(child, parentId, childIndex);
      total += 1;
    }
  }

  return total;
}

async function main() {
  console.log("زرع المدن…");
  const { governorates, areas } = await seedCities();
  console.log(`  ${governorates} محافظة و ${areas} منطقة`);

  console.log("زرع الأقسام…");
  const categoryCount = await seedCategories();
  console.log(`  ${categoryCount} قسماً`);

  const [{ count: activeCount } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.isActive, true));
  console.log(`  منها ${activeCount} مفعّلة في النسخة الأولى`);

  console.log("\nتم. الخطوة التالية: psql -f packages/db/sql/001_search.sql");
}

main()
  .catch((error) => {
    console.error("فشل الزرع:", error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
