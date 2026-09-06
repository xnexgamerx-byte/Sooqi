import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { categoryImage, categoryTint } from "../categoryImages";
import { cardShadow, colors, radius, space } from "../theme";

/**
 * بطاقة قسم في الشبكة الرباعية. الأقسام غير المفعّلة تظهر باهتة مع شارة
 * «قريباً» بدل إخفائها — شبكة ممتلئة تبدو أفضل من شبكة فيها بطاقتان.
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

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        !isActive && styles.dim,
        pressed && isActive && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isActive ? nameAr : `${nameAr}، قريباً`}
    >
      <View style={[styles.icon, { backgroundColor: tint.bg }]}>
        {source ? (
          <Image source={source} style={styles.image} contentFit="contain" />
        ) : (
          <Text style={[styles.glyph, { color: tint.fg }]}>
            {nameAr.slice(0, 1)}
          </Text>
        )}
      </View>

      <Text style={styles.label} numberOfLines={2}>
        {nameAr}
      </Text>

      {isActive ? null : <Text style={styles.soon}>قريباً</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: space.sm,
    minHeight: 104,
    ...cardShadow,
  },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: 30, height: 30 },
  glyph: { fontSize: 20, fontWeight: "700" },
  label: {
    fontSize: 10.5,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
    lineHeight: 15,
  },
  soon: { fontSize: 9, color: colors.muted, fontWeight: "600" },
});
