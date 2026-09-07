import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { priceLabel } from "../format";
import { colors, radius, space } from "../theme";
import type { ListingSummary } from "../types";

/**
 * بطاقة إعلان في الشبكة الثلاثية: صورة مربعة، شارة سعر داكنة أسفل اليسار،
 * وقلب أعلى اليسار. مطابقة لـ docs/screens.html.
 */
export function ListingCard({
  listing,
  onPress,
  onToggleFavorite,
}: {
  listing: ListingSummary;
  onPress: () => void;
  /** يُترك فارغاً حيث لا معنى للحفظ، مثل قائمة إعلاناتي. */
  onToggleFavorite?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}، ${priceLabel(listing.priceIqd)}`}
    >
      <View style={styles.thumb}>
        {listing.coverImage ? (
          <Image
            source={{ uri: listing.coverImage }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Text style={styles.placeholder}>لا توجد صورة</Text>
        )}

        {onToggleFavorite ? (
          <Pressable
            style={styles.fav}
            onPress={onToggleFavorite}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              listing.isFavorite ? "أزل من المفضلة" : "احفظ الإعلان"
            }
          >
            <Ionicons
              name={listing.isFavorite ? "heart" : "heart-outline"}
              size={14}
              color={listing.isFavorite ? "#FF5A52" : "#FFFFFF"}
            />
          </Pressable>
        ) : null}

        <View style={styles.price}>
          <Text style={styles.priceText} numberOfLines={1}>
            {priceLabel(listing.priceIqd)}
          </Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {listing.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {listing.cityNameAr}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 5 },
  pressed: { opacity: 0.7 },
  thumb: {
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: "#DDE2EA",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { color: colors.muted, fontSize: 11 },
  fav: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(20,22,28,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  price: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: colors.dark,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 3.5,
    maxWidth: "92%",
  },
  priceText: { color: colors.white, fontSize: 10.5, fontWeight: "600" },
  title: {
    fontSize: 11.5,
    color: colors.ink,
    fontWeight: "500",
    lineHeight: 17,
  },
  meta: { fontSize: 10.5, color: colors.muted },
});
