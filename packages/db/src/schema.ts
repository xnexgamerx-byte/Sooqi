import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

/**
 * الحالات السبع التي يمر بها الإعلان. مفصّلة من اليوم الأول عمداً: إضافة حالة
 * لاحقاً تعني لمس كل استعلام في المشروع.
 */
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "pending",
  "published",
  "rejected",
  "expired",
  "sold",
  "deleted",
]);

export const listingCondition = pgEnum("listing_condition", [
  "new",
  "used",
  "imported",
]);

export const userRole = pgEnum("user_role", ["user", "moderator", "admin"]);

export const fieldType = pgEnum("field_type", [
  "text",
  "number",
  "select",
  "boolean",
]);

export const reportTarget = pgEnum("report_target", [
  "listing",
  "user",
  "message",
]);

export const reportStatus = pgEnum("report_status", [
  "open",
  "reviewing",
  "actioned",
  "dismissed",
]);

export const boostKind = pgEnum("boost_kind", ["bump", "vip", "pin"]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** الرقم الظاهر للمستخدم في شاشة «حسابي». ليس المفتاح الداخلي. */
    publicId: varchar("public_id", { length: 12 }).notNull(),
    name: text("name").notNull(),
    phone: varchar("phone", { length: 20 }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    email: text("email"),
    avatarKey: text("avatar_key"),
    isVerified: boolean("is_verified").notNull().default(false),
    isBanned: boolean("is_banned").notNull().default(false),
    banReason: text("ban_reason"),
    /** حدّ الإعلانات الفعّالة. يرتفع مع باقات التجار لاحقاً. */
    activeListingLimit: integer("active_listing_limit").notNull().default(20),
    role: userRole("role").notNull().default("user"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_public_id_key").on(t.publicId),
    uniqueIndex("users_phone_key").on(t.phone),
    uniqueIndex("users_email_key").on(t.email),
  ],
);

/* ----------------------------------------------------------------- cities */

/** المحافظات في المستوى الأول، والمناطق تحتها عبر parentId. */
export const cities = pgTable(
  "cities",
  {
    id: serial("id").primaryKey(),
    nameAr: text("name_ar").notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    parentId: integer("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("cities_slug_key").on(t.slug),
    index("cities_parent_idx").on(t.parentId),
  ],
);

/* ------------------------------------------------------------- categories */

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    nameAr: text("name_ar").notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    parentId: integer("parent_id"),
    /**
     * اسم ملف الأيقونة في assets/categories/. يطابق حقل slug في
     * assets/category-assets.json حتى يمكن ربط صور Figma آلياً.
     */
    iconAsset: varchar("icon_asset", { length: 64 }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** النسخة الأولى تطلق بقسمين فقط؛ الباقي معطّل ويظهر «قريباً». */
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_slug_key").on(t.slug),
    index("categories_parent_idx").on(t.parentId),
  ],
);

/** خيار واحد في حقل من نوع select. */
export type FieldOption = { value: string; labelAr: string };

/** الحقول التي تتغير حسب القسم: ماركة وموديل للسيارات، غرف ومساحة للعقار. */
export const categoryFields = pgTable(
  "category_fields",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 48 }).notNull(),
    labelAr: text("label_ar").notNull(),
    type: fieldType("type").notNull(),
    options: jsonb("options").$type<FieldOption[]>(),
    unitAr: text("unit_ar"),
    isRequired: boolean("is_required").notNull().default(false),
    isFilterable: boolean("is_filterable").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("category_fields_key").on(t.categoryId, t.key)],
);

/* --------------------------------------------------------------- listings */

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** الرقم القصير الذي يذكره المستخدم عند التواصل مع الدعم. */
    refNo: bigserial("ref_no", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    cityId: integer("city_id")
      .notNull()
      .references(() => cities.id),
    title: varchar("title", { length: 70 }).notNull(),
    description: text("description"),
    /** بالدينار العراقي. null تعني «السعر عند التواصل». */
    priceIqd: bigint("price_iqd", { mode: "number" }),
    condition: listingCondition("condition"),
    status: listingStatus("status").notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    /** رقم التواصل لهذا الإعلان تحديداً؛ قد يختلف عن رقم الحساب. */
    contactPhone: varchar("contact_phone", { length: 20 }),
    viewCount: integer("view_count").notNull().default(0),
    chatCount: integer("chat_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** يُستخدم للترتيب. التمييز المدفوع لاحقاً يحدّثه فقط. */
    bumpedAt: timestamp("bumped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("listings_ref_no_key").on(t.refNo),
    index("listings_browse_idx").on(t.status, t.categoryId, t.bumpedAt),
    index("listings_city_idx").on(t.status, t.cityId, t.bumpedAt),
    index("listings_user_idx").on(t.userId, t.status),
    index("listings_price_idx").on(t.status, t.priceIqd),
  ],
);

export const listingImages = pgTable(
  "listing_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** المفتاح داخل حاوية R2، لا رابطاً كاملاً. النطاق يتغير، المفتاح لا. */
    storageKey: text("storage_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** الترتيب صفر هو صورة الغلاف. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("listing_images_listing_idx").on(t.listingId, t.sortOrder)],
);

export const listingAttributes = pgTable(
  "listing_attributes",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    fieldId: integer("field_id")
      .notNull()
      .references(() => categoryFields.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    valueNumber: bigint("value_number", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.fieldId] }),
    index("listing_attr_text_idx").on(t.fieldId, t.valueText),
    index("listing_attr_num_idx").on(t.fieldId, t.valueNumber),
  ],
);

/* --------------------------------------------------- favourites and views */

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.listingId] }),
    index("favorites_listing_idx").on(t.listingId),
  ],
);

/**
 * صفوف خام للمشاهدات. العدّاد على listings هو ما يُقرأ؛ هذا الجدول للتحليل
 * ولمنع تضخيم العدّاد من نفس الجهاز.
 */
export const listingViews = pgTable(
  "listing_views",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    viewerId: uuid("viewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** بصمة جهاز مُجزّأة. لا نخزّن عنوان الشبكة كما هو. */
    viewerHash: varchar("viewer_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("listing_views_dedupe_idx").on(t.listingId, t.viewerHash)],
);

/**
 * كل ضغطة على زر الاتصال. تكشف كشط الأرقام بالجملة قبل أن يصبح مشكلة.
 */
export const phoneReveals = pgTable(
  "phone_reveals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    viewerId: uuid("viewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    viewerHash: varchar("viewer_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("phone_reveals_viewer_idx").on(t.viewerHash, t.createdAt)],
);

/* -------------------------------------------------------------- messaging */

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageText: text("last_message_text"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    buyerUnread: integer("buyer_unread").notNull().default(0),
    sellerUnread: integer("seller_unread").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_pair_key").on(t.listingId, t.buyerId),
    index("conversations_buyer_idx").on(t.buyerId, t.lastMessageAt),
    index("conversations_seller_idx").on(t.sellerId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_thread_idx").on(t.conversationId, t.createdAt)],
);

/* ----------------------------------------------------------- moderation */

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetType: reportTarget("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: varchar("reason", { length: 48 }).notNull(),
    note: text("note"),
    status: reportStatus("status").notNull().default("open"),
    handledBy: uuid("handled_by").references(() => users.id, {
      onDelete: "set null",
    }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reports_queue_idx").on(t.status, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/* ------------------------------------------------------- saved searches */

export type SavedSearchQuery = {
  categoryId?: number;
  cityId?: number;
  minPrice?: number;
  maxPrice?: number;
  condition?: "new" | "used" | "imported";
  q?: string;
  attrs?: Record<string, string>;
};

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nameAr: text("name_ar").notNull(),
    query: jsonb("query").$type<SavedSearchQuery>().notNull(),
    notify: boolean("notify").notNull().default(true),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("saved_searches_user_idx").on(t.userId)],
);

/* ------------------------------------------- wallet and boosts (النسخة ٢) */

/**
 * تُنشأ فارغة من الآن وشاشاتها مخفية. الغرض ألا نهاجر بيانات لاحقاً حين
 * يُفعَّل التمييز المدفوع.
 */
export const wallets = pgTable("wallets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balanceIqd: bigint("balance_iqd", { mode: "number" }).notNull().default(0),
  adCredits: integer("ad_credits").notNull().default(0),
  boostCredits: integer("boost_credits").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const boosts = pgTable(
  "boosts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    kind: boostKind("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("boosts_active_idx").on(t.listingId, t.endsAt)],
);

/* -------------------------------------------------------------- relations */

export const usersRelations = relations(users, ({ many, one }) => ({
  listings: many(listings),
  favorites: many(favorites),
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
}));

export const categoriesRelations = relations(categories, ({ many, one }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_tree",
  }),
  children: many(categories, { relationName: "category_tree" }),
  fields: many(categoryFields),
  listings: many(listings),
}));

export const citiesRelations = relations(cities, ({ many, one }) => ({
  parent: one(cities, {
    fields: [cities.parentId],
    references: [cities.id],
    relationName: "city_tree",
  }),
  children: many(cities, { relationName: "city_tree" }),
}));

export const listingsRelations = relations(listings, ({ many, one }) => ({
  seller: one(users, {
    fields: [listings.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [listings.categoryId],
    references: [categories.id],
  }),
  city: one(cities, {
    fields: [listings.cityId],
    references: [cities.id],
  }),
  images: many(listingImages),
  attributes: many(listingAttributes),
}));

export const listingImagesRelations = relations(listingImages, ({ one }) => ({
  listing: one(listings, {
    fields: [listingImages.listingId],
    references: [listings.id],
  }),
}));

export const listingAttributesRelations = relations(
  listingAttributes,
  ({ one }) => ({
    listing: one(listings, {
      fields: [listingAttributes.listingId],
      references: [listings.id],
    }),
    field: one(categoryFields, {
      fields: [listingAttributes.fieldId],
      references: [categoryFields.id],
    }),
  }),
);

export const conversationsRelations = relations(
  conversations,
  ({ many, one }) => ({
    listing: one(listings, {
      fields: [conversations.listingId],
      references: [listings.id],
    }),
    buyer: one(users, {
      fields: [conversations.buyerId],
      references: [users.id],
      relationName: "conversation_buyer",
    }),
    seller: one(users, {
      fields: [conversations.sellerId],
      references: [users.id],
      relationName: "conversation_seller",
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

/** يُستخدم في استعلامات البحث النصي؛ الفهرس نفسه في sql/001_search.sql */
export const titleSearchExpression = sql`to_tsvector('simple', ${listings.title})`;
