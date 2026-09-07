import { env } from "./env.js";

/**
 * إرسال الرسائل القصيرة.
 *
 * الرسالة القصيرة إلى العراق تكلّف بين خمسة وتسعة سنتات عبر مزوّد عالمي،
 * وهي أكبر بند متغيّر في الفاتورة. لهذا لا نطلب تحقّق الهاتف عند التصفّح،
 * بل عند نشر أول إعلان فقط — راجع القسم السادس من docs/plan.html.
 *
 * الناقل الافتراضي يطبع الرمز في السجلّ ولا يرسل شيئاً، فالتطوير والبيتا
 * لا يكلّفان ديناراً. حين تحصل على عرض من بوابة عراقية، اضبط
 * SMS_PROVIDER=http وعبّئ SMS_API_URL و SMS_API_KEY.
 */

export type SmsResult = { delivered: boolean; provider: string };

export interface SmsTransport {
  readonly name: string;
  send(to: string, message: string): Promise<SmsResult>;
}

/**
 * ناقل التطوير. يطبع الرمز بدل إرساله.
 *
 * يطبع في مستوى warn لا info حتى يبرز في السجلّ، ويحمل تحذيراً صريحاً
 * لأن رؤية رمز تحقّق في سجلّ خادم إنتاج مشكلة أمنية لا ميزة.
 */
const consoleTransport: SmsTransport = {
  name: "console",
  async send(to, message) {
    console.warn(
      `[sms:console] لم تُرسَل رسالة فعلية. إلى ${to}: ${message}`,
    );
    return { delivered: false, provider: "console" };
  },
};

/**
 * ناقل عام لبوابة HTTP.
 *
 * يرسل `{ to, message }` كـJSON مع مفتاح في ترويسة Authorization، وهو
 * الشكل الأشيع. إن اختلفت بوابتك، هذه الدالة هي الموضع الوحيد الذي
 * تعدّله.
 */
const httpTransport: SmsTransport = {
  name: "http",
  async send(to, message) {
    if (!env.SMS_API_URL) {
      throw new Error("SMS_API_URL غير معرّف مع SMS_PROVIDER=http");
    }

    const response = await fetch(env.SMS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.SMS_API_KEY
          ? { Authorization: `Bearer ${env.SMS_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({ to, message }),
    });

    if (!response.ok) {
      throw new Error(`بوابة الرسائل ردّت ${response.status}`);
    }

    return { delivered: true, provider: "http" };
  },
};

export const sms: SmsTransport =
  env.SMS_PROVIDER === "http" ? httpTransport : consoleTransport;

/** هل الرموز تصل فعلاً؟ التطبيق يعرض تلميحاً مختلفاً حين لا تصل. */
export const smsDelivers = sms.name !== "console";

export function otpMessage(code: string): string {
  return `رمز التحقق في سوقنا: ${code}\nلا تشاركه مع أحد.`;
}
