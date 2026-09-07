import { eq, inArray } from "drizzle-orm";
import { pushTokens } from "@souqna/db";
import type { AppContext } from "./context.js";

/**
 * إشعارات Expo.
 *
 * مجانية بلا سقف عملي، ولا تحتاج مفاتيح: نرسل إلى واجهة Expo وهي توصل
 * إلى FCM و APNs. هذا هو السبب الوحيد لاختيار Expo push على FCM المباشر
 * في النسخة الأولى.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** واجهة Expo تقبل مئة رسالة في الطلب الواحد. */
const BATCH_SIZE = 100;

export type PushMessage = {
  title: string;
  body: string;
  /** بيانات يقرأها التطبيق ليفتح الشاشة الصحيحة. */
  data?: Record<string, string>;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * يرسل إشعاراً إلى كل أجهزة مستخدم.
 *
 * لا يرمي أبداً: فشل الإشعار يجب ألا يُسقط إرسال رسالة أو نشر إعلان.
 * الفشل يُسجَّل ويُهمَل.
 */
export async function pushToUser(
  ctx: AppContext,
  userId: string,
  message: PushMessage,
): Promise<void> {
  await pushToUsers(ctx, [userId], message);
}

export async function pushToUsers(
  ctx: AppContext,
  userIds: string[],
  message: PushMessage,
): Promise<void> {
  if (userIds.length === 0) return;

  try {
    const rows = await ctx.db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, userIds));

    if (rows.length === 0) return;

    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE);

      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(
          batch.map((row) => ({
            to: row.token,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            sound: "default",
            priority: "high",
          })),
        ),
      });

      if (!response.ok) {
        console.warn(`[push] Expo ردّت ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      await pruneDeadTokens(ctx, batch, payload.data ?? []);
    }
  } catch (error) {
    console.warn("[push] فشل إرسال الإشعار:", error);
  }
}

/**
 * يحذف الرموز التي رفضتها Expo.
 *
 * الرمز يموت حين يحذف المستخدم التطبيق. بدون التنظيف يكبر الجدول بلا حدّ
 * ونرسل إلى أجهزة غير موجودة إلى الأبد.
 */
async function pruneDeadTokens(
  ctx: AppContext,
  batch: { token: string }[],
  tickets: ExpoTicket[],
) {
  const dead: string[] = [];

  tickets.forEach((ticket, index) => {
    if (
      ticket.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered"
    ) {
      const row = batch[index];
      if (row) dead.push(row.token);
    }
  });

  if (dead.length === 0) return;

  for (const token of dead) {
    await ctx.db.delete(pushTokens).where(eq(pushTokens.token, token));
  }
}

/** يقصّ نص الرسالة حتى لا يمتلئ الإشعار. */
export function preview(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
