import { Image } from "expo-image";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { categoryGlyph, categoryImage, categoryTint } from "../categoryImages";
import { colors, radius, space } from "../theme";
import { usePressScale } from "../usePressScale";

/**
 * بطاقة قسم في الشبكة الرباعية.
 *
 * التخطيط مأخوذ من التصميم المرجعي: الاسم في الأعلى والرمز أسفله في الجهة
 * المقابلة. توسيط كل شيء يبدو أنظف في لقطة واحدة، لكن العين تقرأ عشرين
 * بطاقة أسرع حين تكون الأسماء كلها على خط واحد.
 *
 * الأقسام غير المفعّلة تبقى ظاهرة باهتة: شبكة ممتلئة تعد بسوق كامل، وشبكة
 * فيها بطاقتان تبدو مهجورة. ولا شارة «قريباً» على كل بطاقة — تسعة عشر
 * تكراراً للكلمة نفسها ضجيج، وسطر واحد تحت العنوان يقولها مرة.
 */
export function CategoryTile({
  slug,
  nameAr,
  isActive,
  onPress,
}: {
  slug: string;
  nameAr: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const source = categoryImage(slug);
  const tint = categoryTint(slug);
  const press = usePressScale();

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        style={[styles.tile, !isActive && styles.dim]}
        onPress={onPress}
        onPressIn={isActive ? press.onPressIn : undefined}
        onPressOut={isActive ? press.onPressOut : undefined}
        android_ripple={
          isActive ? { color: "rgba(11,95,217,0.10)", borderless: false } : null
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: !isActive }}
        accessibilityLabel={isActive ? nameAr : `${nameAr}، قريباً`}
      >
        <Text style={styles.label} numberOfLines={2}>
          {nameAr}
        </Text>

        <View style={styles.bottom}>
          <View style={[styles.badge, { backgroundColor: tint.bg }]}>
            {source ? (
              <Image source={source} style={styles.image} contentFit="contain" />
            ) : (
              <Text style={styles.glyph}>{categoryGlyph(slug)}</Text>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 9,
    minHeight: 96,
    justifyContent: "space-between",
    // حدّ شعرة بدل ظل: عشرون ظلاً متجاوراً يصنعان ضبابة رمادية
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: "hidden",
  },
  dim: { opacity: 0.5 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.ink,
    lineHeight: 16,
    textAlign: "right",
  },
  bottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: space.sm,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    // الرمز في الجهة المقابلة للاسم، كما في التصميم المرجعي
    marginStart: "auto",
  },
  glyph: { fontSize: 19, lineHeight: 24 },
  image: { width: 24, height: 24 },
});
