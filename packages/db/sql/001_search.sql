-- فهارس البحث النصي. شغّلها مرة واحدة بعد أول drizzle-kit push.
--
-- البحث المدمج في Postgres يكفي حتى نحو ٥٠ ألف إعلان. لا تضف Meilisearch
-- قبل أن يبطؤ هذا فعلاً. راجع القسم الثاني من docs/plan.html.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- بحث جزئي داخل العنوان: يطابق «سول» في «كيا سول ٢٠١٨»
CREATE INDEX IF NOT EXISTS listings_title_trgm_idx
  ON listings USING gin (title gin_trgm_ops);

-- بحث جزئي داخل الوصف، للاستعلامات الأطول
CREATE INDEX IF NOT EXISTS listings_description_trgm_idx
  ON listings USING gin (description gin_trgm_ops);

-- الإعلانات المنشورة فقط هي ما يُتصفَّح؛ فهرس جزئي أصغر وأسرع
CREATE INDEX IF NOT EXISTS listings_published_recent_idx
  ON listings (bumped_at DESC NULLS LAST)
  WHERE status = 'published';
