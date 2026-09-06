/**
 * تنسيق عربي بلا اعتماد على ICU.
 *
 * Hermes قد يُبنى بدون بيانات المحليات، فـ toLocaleString("ar-IQ") يعطي
 * أرقاماً لاتينية على بعض الأجهزة. هذه الدوال حتمية على كل جهاز.
 */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** يحوّل الأرقام اللاتينية إلى هندية ويضيف فواصل الآلاف. */
export function arNumber(value: number): string {
  const grouped = Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  return grouped.replace(/[0-9]/g, (digit) => AR_DIGITS[Number(digit)] ?? digit);
}

/** السعر بالدينار، أو النص البديل حين لا يوجد سعر معلن. */
export function priceLabel(priceIqd: number | null | undefined): string {
  if (priceIqd === null || priceIqd === undefined) return "السعر عند التواصل";
  return `${arNumber(priceIqd)} د.ع`;
}

const CONDITIONS: Record<string, string> = {
  new: "جديد",
  used: "مستعمل",
  imported: "وارد",
};

export function conditionLabel(condition: string | null | undefined): string {
  return condition ? (CONDITIONS[condition] ?? condition) : "";
}

const STATUSES: Record<string, string> = {
  draft: "مسودة",
  pending: "قيد المراجعة",
  published: "منشور",
  rejected: "مرفوض",
  expired: "منتهي",
  sold: "مباع",
  deleted: "محذوف",
};

export function statusLabel(status: string): string {
  return STATUSES[status] ?? status;
}

export function statusColor(status: string): string {
  if (status === "published") return "#0FBF6A";
  if (status === "pending") return "#F79E1B";
  if (status === "rejected" || status === "deleted") return "#E5352B";
  return "#8E939E";
}

/** «قبل ٣ ساعات» بدل تاريخ كامل. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${arNumber(minutes)} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${arNumber(hours)} ساعة`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${arNumber(days)} يوم`;

  return `قبل ${arNumber(Math.floor(days / 30))} شهر`;
}
