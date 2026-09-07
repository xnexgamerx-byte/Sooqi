import type { ImageSourcePropType } from "react-native";

/**
 * رموز الأقسام.
 *
 * التصميم المرجعي في Figma يستخدم إيموجي لا رسومات مخصّصة، فنستخدم
 * الإيموجي نفسه: النظام يرسمه، فلا ملفات في الحزمة، ولا سؤال عن حقوق،
 * ولا تشوّش عند أي حجم. ٢٦ ملف PNG كانت ستزن أكثر وتبدو أسوأ.
 *
 * لكل قسم رمز واحد صريح: الاشتقاق التلقائي من الاسم يعطي رموزاً غريبة
 * لأقسام مثل «أرقام مميزة»، والقائمة الصريحة تُقرأ وتُصحَّح بسهولة.
 */
export const categoryEmoji: Record<string, string> = {
  stores: "🏪",

  cars: "🚗",
  "cars-for-sale": "🚙",
  "cars-for-rent": "🔑",
  trucks: "🚚",
  "car-parts": "⚙️",
  "car-accessories": "🧰",
  motorcycles: "🏍️",

  "real-estate-sale": "🏢",
  "real-estate-rent": "🏠",
  "home-garden": "🛋️",
  appliances: "🧺",

  jobs: "💼",
  "job-seekers": "🧑‍💼",
  services: "🔨",
  "business-equipment": "🗄️",
  education: "🎓",

  "mobiles-tablets": "📱",
  mobiles: "📲",
  tablets: "📟",
  "mobile-accessories": "🎧",
  "special-numbers": "🔢",
  laptops: "💻",
  electronics: "📺",
  games: "🎮",

  "sports-fitness": "🏋️",
  "fashion-kids": "👕",
  "beauty-health": "💄",
  pets: "🐕",
  food: "🍔",
  "entertainment-books": "📚",
};

/** رمز احتياطي لقسم يُضاف لاحقاً قبل أن يُسنَد له رمز. */
const FALLBACK = "🏷️";

export function categoryGlyph(slug: string): string {
  return categoryEmoji[slug] ?? FALLBACK;
}

/**
 * صور مخصّصة تسبق الإيموجي إن وُضعت.
 *
 * تبقى المسار مفتوحاً لو أردت رسومات خاصة بك لاحقاً: ضع الملف في
 * assets/categories/ وأضف سطراً هنا، والبطاقة تعرضه بدل الرمز.
 */
export const categoryImages: Record<string, ImageSourcePropType> = {};

export function categoryImage(slug: string): ImageSourcePropType | null {
  return categoryImages[slug] ?? null;
}

/**
 * خلفية هادئة لكل قسم، مشتقّة من اسمه فلا تتغيّر بين الجلسات.
 *
 * تشبّع منخفض عمداً: الإيموجي ملوّن أصلاً، وخلفية صارخة خلفه تجعل الشبكة
 * تصرخ كلها فلا يبرز شيء.
 */
export function categoryTint(slug: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 360;
  }
  return {
    bg: `hsl(${hash}, 55%, 96%)`,
    fg: `hsl(${hash}, 40%, 40%)`,
  };
}
