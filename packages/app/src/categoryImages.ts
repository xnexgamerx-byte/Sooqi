import type { ImageSourcePropType } from "react-native";

/**
 * صور الأقسام المصدَّرة من Figma.
 *
 * فارغة الآن عن قصد: الصور لم تُصدَّر بعد. راجع assets/README.md في جذر
 * المستودع لخطوات التصدير. بعد وضع الملفات في packages/app/assets/categories/
 * أضف سطراً لكل قسم هنا، والمفتاح هو نفسه slug القسم:
 *
 *   cars: require("../assets/categories/cars@3x.png"),
 *
 * ما دام القسم غير مذكور هنا، تعرض الشبكة بديلاً ملوّناً بدل صورة مكسورة.
 */
export const categoryImages: Record<string, ImageSourcePropType> = {};

export function categoryImage(slug: string): ImageSourcePropType | null {
  return categoryImages[slug] ?? null;
}

/** لون ثابت لكل قسم، يُشتق من اسمه حتى لا يتغيّر بين الجلسات. */
export function categoryTint(slug: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 360;
  }
  return {
    bg: `hsl(${hash}, 62%, 94%)`,
    fg: `hsl(${hash}, 48%, 38%)`,
  };
}
