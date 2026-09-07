import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  blocks,
  conversations,
  listingImages,
  listings,
  messages,
  users,
} from "@souqna/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashToken, requireUserId } from "../auth.js";
import { imageUrl, type AppContext } from "../context.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { preview, pushToUser } from "../push.js";
import { sessions } from "@souqna/db";

/* ---------------------------------------------------------------- بث حيّ */

/**
 * الاتصالات المفتوحة، مفهرسة بالمستخدم.
 *
 * في الذاكرة لا في Redis عن قصد: خادم واحد يكفي حتى عشرات آلاف المستخدمين،
 * وإضافة Redis الآن تعقيد بلا عائد. حين تصير الخوادم اثنين، هذا هو الموضع
 * الوحيد الذي يتغيّر — استبدل الخريطة بقناة نشر واشتراك.
 */
const live = new Map<string, Set<{ send: (data: string) => void }>>();

function join(userId: string, socket: { send: (data: string) => void }) {
  const set = live.get(userId) ?? new Set();
  set.add(socket);
  live.set(userId, set);
}

function leave(userId: string, socket: { send: (data: string) => void }) {
  const set = live.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) live.delete(userId);
}

export function isOnline(userId: string): boolean {
  return (live.get(userId)?.size ?? 0) > 0;
}

/** يبثّ حدثاً لكل أجهزة مستخدم المتصلة. يعيد عدد من وصلهم. */
function emit(userId: string, event: string, payload: unknown): number {
  const set = live.get(userId);
  if (!set) return 0;

  const frame = JSON.stringify({ event, payload });
  let delivered = 0;

  for (const socket of set) {
    try {
      socket.send(frame);
      delivered += 1;
    } catch {
      // اتصال ميت؛ يُنظَّف عند إغلاقه
    }
  }

  return delivered;
}

/* --------------------------------------------------------------- schemas */

const startBody = z.object({
  listingId: z.string().uuid(),
  message: z.string().min(1).max(2000).optional(),
});

const sendBody = z.object({
  body: z.string().min(1).max(2000),
});

/* ---------------------------------------------------------------- routes */

export function registerChatRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * قناة البث الحيّ.
   *
   * الإرسال يمرّ عبر REST لا عبر هذه القناة: الرسالة المرسلة بـPOST تُعاد
   * محاولتها تلقائياً وتصل حالتها بوضوح، أما الرسالة المدفوعة في مقبس قد
   * تضيع بلا أثر حين ينقطع الاتصال. القناة للتوصيل فقط.
   */
  app.get("/ws", { websocket: true }, async (socket, request) => {
    const query = request.query as { token?: string };
    const token = query.token;

    if (!token) {
      socket.close(4001, "missing token");
      return;
    }

    const [row] = await ctx.db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      socket.close(4003, "invalid token");
      return;
    }

    const userId = row.userId;
    join(userId, socket);
    socket.send(JSON.stringify({ event: "ready", payload: { userId } }));

    // نبضة تبقي الوسطاء من قطع الاتصال الخامل
    const heartbeat = setInterval(() => {
      try {
        socket.send(JSON.stringify({ event: "ping", payload: {} }));
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    socket.on("close", () => {
      clearInterval(heartbeat);
      leave(userId, socket);
    });

    socket.on("error", () => {
      clearInterval(heartbeat);
      leave(userId, socket);
    });
  });

  /** صندوق المحادثات. */
  app.get("/conversations", async (request) => {
    const userId = requireUserId(request);

    const rows = await ctx.db
      .select({
        id: conversations.id,
        listingId: conversations.listingId,
        buyerId: conversations.buyerId,
        sellerId: conversations.sellerId,
        lastMessageText: conversations.lastMessageText,
        lastMessageAt: conversations.lastMessageAt,
        buyerUnread: conversations.buyerUnread,
        sellerUnread: conversations.sellerUnread,
        listingTitle: listings.title,
        listingPrice: listings.priceIqd,
        listingStatus: listings.status,
      })
      .from(conversations)
      .innerJoin(listings, eq(listings.id, conversations.listingId))
      .where(
        or(
          eq(conversations.buyerId, userId),
          eq(conversations.sellerId, userId),
        ),
      )
      .orderBy(desc(conversations.lastMessageAt));

    const otherIds = rows.map((row) =>
      row.buyerId === userId ? row.sellerId : row.buyerId,
    );

    const others = await namesFor(ctx, otherIds);
    const covers = await coverFor(
      ctx,
      rows.map((row) => row.listingId),
    );

    return {
      conversations: rows.map((row) => {
        const isBuyer = row.buyerId === userId;
        const otherId = isBuyer ? row.sellerId : row.buyerId;
        const cover = covers.get(row.listingId);

        return {
          id: row.id,
          listingId: row.listingId,
          listingTitle: row.listingTitle,
          listingPrice: row.listingPrice,
          listingImage: cover ? imageUrl(ctx, cover) : null,
          /** «البيع» حين أكون البائع، و«الشراء» حين أكون المشتري. */
          side: isBuyer ? "buying" : "selling",
          otherName: others.get(otherId) ?? "مستخدم",
          otherId,
          otherOnline: isOnline(otherId),
          lastMessageText: row.lastMessageText,
          lastMessageAt: row.lastMessageAt,
          unread: isBuyer ? row.buyerUnread : row.sellerUnread,
        };
      }),
    };
  });

  /**
   * يفتح محادثة عن إعلان، أو يعيد القائمة.
   *
   * محادثة واحدة لكل مشترٍ لكل إعلان: بدون هذا القيد يفتح كل ضغط على زر
   * الدردشة خيطاً جديداً ويتبعثر السياق.
   */
  app.post("/conversations", async (request, reply) => {
    const userId = requireUserId(request);
    const body = startBody.parse(request.body);

    const [listing] = await ctx.db
      .select({
        id: listings.id,
        userId: listings.userId,
        status: listings.status,
        title: listings.title,
      })
      .from(listings)
      .where(eq(listings.id, body.listingId))
      .limit(1);

    if (!listing) throw notFound("الإعلان غير موجود", "listing_not_found");
    if (listing.userId === userId) {
      throw badRequest("لا تستطيع مراسلة نفسك", "self_chat");
    }
    if (listing.status !== "published") {
      throw badRequest("هذا الإعلان غير متاح", "listing_unavailable");
    }

    await assertNotBlocked(ctx, userId, listing.userId);

    const [existing] = await ctx.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.listingId, listing.id),
          eq(conversations.buyerId, userId),
        ),
      )
      .limit(1);

    let conversationId = existing?.id;

    if (!conversationId) {
      const [created] = await ctx.db
        .insert(conversations)
        .values({
          listingId: listing.id,
          buyerId: userId,
          sellerId: listing.userId,
        })
        .returning({ id: conversations.id });

      if (!created) throw badRequest("تعذّر فتح المحادثة", "chat_failed");
      conversationId = created.id;

      await ctx.db
        .update(listings)
        .set({ chatCount: sql`${listings.chatCount} + 1` })
        .where(eq(listings.id, listing.id));
    }

    if (body.message) {
      await deliver(ctx, conversationId, userId, body.message);
    }

    return reply.status(201).send({ conversationId });
  });

  /** سجلّ المحادثة، الأقدم أولاً. */
  app.get<{ Params: { id: string } }>(
    "/conversations/:id/messages",
    async (request) => {
      const userId = requireUserId(request);
      const conversation = await memberOf(ctx, request.params.id, userId);

      const rows = await ctx.db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          body: messages.body,
          readAt: messages.readAt,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(asc(messages.createdAt))
        .limit(300);

      const otherId =
        conversation.buyerId === userId
          ? conversation.sellerId
          : conversation.buyerId;

      const [listing] = await ctx.db
        .select({
          id: listings.id,
          title: listings.title,
          priceIqd: listings.priceIqd,
          status: listings.status,
        })
        .from(listings)
        .where(eq(listings.id, conversation.listingId))
        .limit(1);

      const others = await namesFor(ctx, [otherId]);

      return {
        conversation: {
          id: conversation.id,
          listing,
          otherId,
          otherName: others.get(otherId) ?? "مستخدم",
          otherOnline: isOnline(otherId),
        },
        messages: rows.map((row) => ({
          ...row,
          mine: row.senderId === userId,
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const userId = requireUserId(request);
      const body = sendBody.parse(request.body);
      const conversation = await memberOf(ctx, request.params.id, userId);

      const otherId =
        conversation.buyerId === userId
          ? conversation.sellerId
          : conversation.buyerId;

      await assertNotBlocked(ctx, userId, otherId);

      const message = await deliver(ctx, conversation.id, userId, body.body);

      return reply.status(201).send({ message });
    },
  );

  /** يصفّر عدّاد غير المقروء لهذا الطرف. */
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/read",
    async (request) => {
      const userId = requireUserId(request);
      const conversation = await memberOf(ctx, request.params.id, userId);
      const isBuyer = conversation.buyerId === userId;

      await ctx.db
        .update(conversations)
        .set(isBuyer ? { buyerUnread: 0 } : { sellerUnread: 0 })
        .where(eq(conversations.id, conversation.id));

      await ctx.db
        .update(messages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            ne(messages.senderId, userId),
            isNull(messages.readAt),
          ),
        );

      return { ok: true };
    },
  );

  /* -------------------------------------------------------------- الحظر */

  app.post<{ Params: { id: string } }>(
    "/users/:id/block",
    async (request) => {
      const userId = requireUserId(request);
      if (userId === request.params.id) {
        throw badRequest("لا تستطيع حظر نفسك", "self_block");
      }

      await ctx.db
        .insert(blocks)
        .values({ blockerId: userId, blockedId: request.params.id })
        .onConflictDoNothing();

      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/users/:id/block",
    async (request) => {
      const userId = requireUserId(request);

      await ctx.db
        .delete(blocks)
        .where(
          and(
            eq(blocks.blockerId, userId),
            eq(blocks.blockedId, request.params.id),
          ),
        );

      return { ok: true };
    },
  );
}

/* --------------------------------------------------------------- helpers */

/**
 * يكتب الرسالة، يحدّث المحادثة، ثم يوصلها.
 *
 * الترتيب مقصود: الكتابة أولاً. لو بثثنا قبل الحفظ ورأى المستلم رسالة ثم
 * فشلت الكتابة، تختفي الرسالة عند إعادة التحميل.
 */
async function deliver(
  ctx: AppContext,
  conversationId: string,
  senderId: string,
  text: string,
) {
  const body = text.trim();

  const [created] = await ctx.db
    .insert(messages)
    .values({ conversationId, senderId, body })
    .returning({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      senderId: messages.senderId,
    });

  if (!created) throw badRequest("تعذّر إرسال الرسالة", "send_failed");

  const [conversation] = await ctx.db
    .select({
      buyerId: conversations.buyerId,
      sellerId: conversations.sellerId,
      listingId: conversations.listingId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) throw notFound("المحادثة غير موجودة", "chat_not_found");

  const recipientId =
    conversation.buyerId === senderId
      ? conversation.sellerId
      : conversation.buyerId;
  const recipientIsBuyer = recipientId === conversation.buyerId;

  await ctx.db
    .update(conversations)
    .set({
      lastMessageText: preview(body, 120),
      lastMessageAt: created.createdAt,
      ...(recipientIsBuyer
        ? { buyerUnread: sql`${conversations.buyerUnread} + 1` }
        : { sellerUnread: sql`${conversations.sellerUnread} + 1` }),
    })
    .where(eq(conversations.id, conversationId));

  const delivered = emit(recipientId, "message:new", {
    conversationId,
    message: { ...created, mine: false },
  });

  // الإشعار للغائب فقط: من ينظر إلى الشاشة الآن لا يحتاج تنبيهاً
  if (delivered === 0) {
    const [sender] = await ctx.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    await pushToUser(ctx, recipientId, {
      title: sender?.name ?? "رسالة جديدة",
      body: preview(body),
      data: { type: "message", conversationId },
    });
  }

  emit(senderId, "message:sent", { conversationId, message: created });

  return { ...created, mine: true };
}

/** يتأكد أن الطالب طرف في المحادثة. */
async function memberOf(
  ctx: AppContext,
  conversationId: string,
  userId: string,
) {
  const [row] = await ctx.db
    .select({
      id: conversations.id,
      buyerId: conversations.buyerId,
      sellerId: conversations.sellerId,
      listingId: conversations.listingId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!row) throw notFound("المحادثة غير موجودة", "chat_not_found");
  if (row.buyerId !== userId && row.sellerId !== userId) throw forbidden();

  return row;
}

/**
 * يمنع المراسلة في الاتجاهين حين يحظر أحدهما الآخر.
 *
 * الفحص في الاتجاهين مقصود: من حظرته لا يجب أن يصلك منه شيء، ومن حظرك لا
 * يجب أن يصله منك شيء.
 */
async function assertNotBlocked(ctx: AppContext, a: string, b: string) {
  const [row] = await ctx.db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);

  if (row) throw forbidden("لا تستطيع مراسلة هذا المستخدم", "blocked");
}

async function namesFor(ctx: AppContext, userIds: string[]) {
  const map = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;

  const rows = await ctx.db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));

  for (const row of rows) map.set(row.id, row.name);
  return map;
}

async function coverFor(ctx: AppContext, listingIds: string[]) {
  const map = new Map<string, string>();
  const unique = [...new Set(listingIds)];
  if (unique.length === 0) return map;

  const rows = await ctx.db
    .select({
      listingId: listingImages.listingId,
      storageKey: listingImages.storageKey,
      thumbKey: listingImages.thumbKey,
      sortOrder: listingImages.sortOrder,
    })
    .from(listingImages)
    .where(inArray(listingImages.listingId, unique))
    .orderBy(listingImages.listingId, listingImages.sortOrder);

  for (const row of rows) {
    if (!map.has(row.listingId)) {
      map.set(row.listingId, row.thumbKey ?? row.storageKey);
    }
  }
  return map;
}
