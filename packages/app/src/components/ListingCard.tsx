import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { priceLabel } from "../format";
import { colors, radius, space } from "../theme";
import { usePressScale } from "../usePressScale";
import type { ListingSummary } from "../types";

/**
 * بطاقة إعلان: صورة مربعة، شارة سعر داكنة أسفل اليسار، وقلب أعلى اليسار.
 *
 * الصورة هي المنتَج في سوق مستعمَل — الناس يمرّون على الشبكة بأعينهم لا
 * بقراءة العناوين — فتأخذ كل عرض البطاقة، والنص يخدمها لا العكس.
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
  const press = usePressScale(0.975);

  return (
    <Animated.View
      style={[styles.card, { transform: [{ scale: press.scale }] }]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
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
              size={16}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  thumb: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: "#DDE2EA",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { color: colors.muted, fontSize: 11 },
  fav: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(20,22,28,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  price: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(21,22,26,0.88)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    maxWidth: "92%",
  },
  priceText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  title: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: "500",
    lineHeight: 19,
    marginTop: 7,
  },
  meta: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
});
