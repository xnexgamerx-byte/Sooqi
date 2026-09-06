import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/api";
import { ErrorState, Loading } from "../../src/components/StateView";
import { arNumber, conditionLabel, priceLabel, timeAgo } from "../../src/format";
import { cardShadow, colors, radius, space } from "../../src/theme";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const listing = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api.listing(id),
    enabled: Boolean(id),
  });

  /**
   * الرقم لا يصل مع بيانات الإعلان. يُطلب بضغطة، والخادم يسجّل كل طلب.
   * هذا ما يمنع كشط الأرقام بالجملة.
   */
  const reveal = useMutation({
    mutationFn: () => api.revealPhone(id),
    onSuccess: (phone) => {
      Alert.alert("رقم البائع", phone, [
        { text: "إغلاق", style: "cancel" },
        {
          text: "اتصال",
          onPress: () => void Linking.openURL(`tel:${phone}`),
        },
        {
          text: "واتساب",
          onPress: () =>
            void Linking.openURL(
              `https://wa.me/${phone.replace(/[^0-9]/g, "")}`,
            ),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert(
        "تعذّر جلب الرقم",
        error instanceof ApiError ? error.message : "حاول مرة ثانية",
      );
    },
  });

  if (listing.isPending) {
    return (
      <SafeAreaView style={styles.screen}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (listing.isError || !listing.data) {
    return (
      <SafeAreaView style={styles.screen}>
        <ErrorState
          message={
            listing.error instanceof ApiError
              ? listing.error.message
              : "تعذّر تحميل الإعلان"
          }
          onRetry={() => void listing.refetch()}
        />
      </SafeAreaView>
    );
  }

  const data = listing.data;
  const cover = data.images[0]?.url ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.gallery}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <Text style={styles.noImage}>لا توجد صورة</Text>
          )}

          <Pressable
            style={styles.back}
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="رجوع"
          >
            <Ionicons name="arrow-forward" size={20} color={colors.ink} />
          </Pressable>

          {data.images.length > 1 ? (
            <View style={styles.count}>
              <Text style={styles.countText}>
                {arNumber(data.images.length)} صور
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.price}>{priceLabel(data.priceIqd)}</Text>
          <Text style={styles.title}>{data.title}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.muted} />
            <Text style={styles.meta}>{data.cityNameAr}</Text>
            <Text style={styles.meta}>·</Text>
            <Text style={styles.meta}>{timeAgo(data.publishedAt)}</Text>
            <Text style={styles.meta}>·</Text>
            <Ionicons name="eye-outline" size={13} color={colors.muted} />
            <Text style={styles.meta}>{arNumber(data.viewCount)}</Text>
          </View>

          {data.condition ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {conditionLabel(data.condition)}
              </Text>
            </View>
          ) : null}
        </View>

        {data.attributes.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.section}>المواصفات</Text>
            <View style={styles.specs}>
              {data.attributes.map((attribute) => (
                <View key={attribute.key} style={styles.spec}>
                  <Text style={styles.specKey}>{attribute.labelAr}</Text>
                  <Text style={styles.specValue}>
                    {attribute.valueAr ?? "—"}
                    {attribute.unitAr ? ` ${attribute.unitAr}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {data.description ? (
          <View style={styles.card}>
            <Text style={styles.section}>الوصف</Text>
            <Text style={styles.body}>{data.description}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.seller}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={colors.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.sellerName}>
                <Text style={styles.sellerNameText}>{data.seller.name}</Text>
                {data.seller.isVerified ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={15}
                    color={colors.blue}
                  />
                ) : null}
              </View>
              <Text style={styles.meta}>
                رقم الحساب {data.seller.publicId}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.warning]}>
          <Ionicons name="bulb-outline" size={18} color="#A9720E" />
          <Text style={styles.warningText}>
            لا تدفع أي مبلغ قبل المعاينة. سوقنا لا يتوسّط في الدفع ولا يضمن
            أي صفقة.
          </Text>
        </View>

        <View style={{ height: space.xxl }} />
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={[styles.action, styles.actionGhost]}
          accessibilityRole="button"
          accessibilityLabel="دردشة"
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.ink} />
        </Pressable>
        <Pressable
          style={[styles.action, styles.actionPrimary]}
          onPress={() => reveal.mutate()}
          disabled={reveal.isPending}
          accessibilityRole="button"
        >
          <Ionicons name="call" size={18} color={colors.white} />
          <Text style={styles.actionText}>
            {reveal.isPending ? "لحظة…" : "أظهر الرقم"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  gallery: {
    height: 260,
    backgroundColor: "#DDE2EA",
    alignItems: "center",
    justifyContent: "center",
  },
  noImage: { color: colors.muted },
  back: {
    position: "absolute",
    top: space.md,
    right: space.lg,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    position: "absolute",
    bottom: space.md,
    left: space.lg,
    backgroundColor: "rgba(20,22,28,0.62)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: { color: colors.white, fontSize: 11 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: space.lg,
    marginTop: space.md,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    ...cardShadow,
  },
  price: { fontSize: 24, fontWeight: "700", color: colors.blue },
  title: { fontSize: 16, fontWeight: "600", color: colors.ink, lineHeight: 24 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { fontSize: 12.5, color: colors.muted },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.blueSoft,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: colors.blue, fontSize: 12, fontWeight: "600" },
  section: { fontSize: 16, fontWeight: "600", color: colors.ink },
  body: { fontSize: 14, color: colors.ink2, lineHeight: 24 },
  specs: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.line,
    gap: StyleSheet.hairlineWidth,
  },
  spec: {
    width: "49.9%",
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  specKey: { fontSize: 11, color: colors.muted, marginBottom: 2 },
  specValue: { fontSize: 13, fontWeight: "600", color: colors.ink },
  seller: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerName: { flexDirection: "row", alignItems: "center", gap: 5 },
  sellerNameText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    backgroundColor: "#FFF7E8",
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 21,
    color: "#7A5410",
  },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  actionGhost: {
    width: 52,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionPrimary: { flex: 1, backgroundColor: colors.blue },
  actionText: { color: colors.white, fontWeight: "600", fontSize: 14.5 },
});
