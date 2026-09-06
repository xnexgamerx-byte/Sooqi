import { asc, eq, isNull } from "drizzle-orm";
import { cities } from "@souqna/db";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export function registerCityRoutes(app: FastifyInstance, ctx: AppContext) {
  /** المحافظات مع مناطقها، شجرة بمستويين. */
  app.get("/cities", async () => {
    const rows = await ctx.db
      .select()
      .from(cities)
      .where(eq(cities.isActive, true))
      .orderBy(asc(cities.sortOrder), asc(cities.id));

    const areasByParent = new Map<number, typeof rows>();
    for (const row of rows) {
      if (row.parentId === null) continue;
      const bucket = areasByParent.get(row.parentId) ?? [];
      bucket.push(row);
      areasByParent.set(row.parentId, bucket);
    }

    return {
      cities: rows
        .filter((row) => row.parentId === null)
        .map((gov) => ({
          id: gov.id,
          slug: gov.slug,
          nameAr: gov.nameAr,
          areas: (areasByParent.get(gov.id) ?? []).map((area) => ({
            id: area.id,
            slug: area.slug,
            nameAr: area.nameAr,
          })),
        })),
    };
  });

  /** المحافظات فقط، لقوائم الاختيار السريعة. */
  app.get("/cities/governorates", async () => {
    const rows = await ctx.db
      .select({
        id: cities.id,
        slug: cities.slug,
        nameAr: cities.nameAr,
      })
      .from(cities)
      .where(isNull(cities.parentId))
      .orderBy(asc(cities.sortOrder), asc(cities.id));

    return { governorates: rows };
  });
}
