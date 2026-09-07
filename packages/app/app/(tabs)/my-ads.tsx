import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/api";
import { AppHeader } from "../../src/components/AppHeader";
import { EmptyState, ErrorState, Loading } from "../../src/components/StateView";
import { arNumber, priceLabel, statusColor, statusLabel } from "../../src/format";
import { useSession } from "../../src/session";
import { cardShadow, colors, radius, space } from "../../src/theme";
import type { MyListing } from "../../src/types";

export default function MyAdsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useSession();

  const listings = useQuery({
    queryKey: ["my-listings"],
    queryFn: api.myListings,
    enabled: isSignedIn,
  });

  const publish = useMutation({
    mutationFn: (id: string) => api.publishListing(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      Alert.alert("تم", result.message);
    },
    onError: (error) => {
      Alert.alert(
        "تعذّر النشر",
        error instanceof ApiError ? error.message : "حاول مرة ثانية",
      );
    },
  });

  const rows = listings.data ?? [];
  const totalViews = rows.reduce((sum, row) => sum + row.viewCount, 0);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader title="إعلاناتي" />

      {!isSignedIn ? (
        <View style={styles.gate}>
          <EmptyState
            title="سجّل الدخول لتشوف إعلاناتك"
            hint="تحتاج حساباً لنشر الإعلانات ومتابعة مشاهداتها."
          />
          <Pressable style={styles.gateCta} onPress={() => router.push("/login")}>
            <Text style={styles.gateCtaText}>سجّل دخولك</Text>
          </Pressable>
        </View>
      ) : listings.isPending ? (
        <Loading />
      ) : listings.isError ? (
        <ErrorState
          message="تعذّر تحميل إعلاناتك"
          onRetry={() => void listings.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tiles}>
            <Tile icon="reader-outline" value={rows.length} label="الإعلانات" />
            <Tile icon="eye-outline" value={totalViews} label="المشاهدات" />
          </View>

          <Pressable
            style={styles.addCard}
            onPress={() => router.push("/post")}
            accessibilityRole="button"
          >
            <Ionicons name="camera" size={22} color={colors.orange} />
            <Text style={styles.addText}>أضف إعلانك الآن</Text>
            <Ionicons name="chevron-back" size={18} color={colors.muted} />
          </Pressable>

          {rows.length === 0 ? (
            <EmptyState
              title="ما عندك إعلانات"
              hint="اضغط «أضف إعلانك الآن» وابدأ."
            />
          ) : (
            rows.map((listing) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                onOpen={() => router.push(`/listing/${listing.id}`)}
                onPublish={() => publish.mutate(listing.id)}
                publishing={publish.isPending}
              />
            ))
          )}

          <View style={{ height: space.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ListingRow({
  listing,
  onOpen,
  onPublish,
  publishing,
}: {
  listing: MyListing;
  onOpen: () => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  const canPublish = listing.status === "draft" || listing.status === "rejected";

  return (
    <View style={styles.card}>
      <Pressable style={styles.cardMain} onPress={onOpen}>
        <View style={styles.thumb}>
          {listing.coverImage ? (
            <Image
              source={{ uri: listing.coverImage }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <Ionicons name="image-outline" size={22} color={colors.muted} />
          )}
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {listing.title}
          </Text>
          <Text style={styles.cardPrice}>{priceLabel(listing.priceIqd)}</Text>
          <View style={styles.cardMeta}>
            <Ionicons name="eye-outline" size={12} color={colors.muted} />
            <Text style={styles.metaText}>{arNumber(listing.viewCount)}</Text>
            <View
              style={[
                styles.status,
                { backgroundColor: statusColor(listing.status) },
              ]}
            >
              <Text style={styles.statusText}>
                {statusLabel(listing.status)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      {canPublish ? (
        <Pressable
          style={[styles.publish, publishing && styles.publishBusy]}
          onPress={onPublish}
          disabled={publishing}
          accessibilityRole="button"
        >
          <Text style={styles.publishText}>
            {publishing ? "لحظة…" : "انشر الإعلان"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Tile({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileTop}>
        <Ionicons name={icon} size={20} color={colors.ink} />
        <Text style={styles.tileValue}>{arNumber(value)}</Text>
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  gate: { flex: 1, justifyContent: "center", paddingHorizontal: space.xxl },
  gateCta: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  gateCtaText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  content: { padding: space.lg, gap: space.md },
  tiles: { flexDirection: "row", gap: space.md },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    ...cardShadow,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileValue: { fontSize: 23, fontWeight: "700", color: colors.blue },
  tileLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },
  addCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    ...cardShadow,
  },
  addText: { flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
    ...cardShadow,
  },
  cardMain: { flexDirection: "row", gap: space.md, alignItems: "center" },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 13.5, fontWeight: "600", color: colors.ink, lineHeight: 20 },
  cardPrice: { fontSize: 13, fontWeight: "700", color: colors.blue },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 11, color: colors.muted },
  status: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  publish: {
    backgroundColor: colors.blue,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: "center",
  },
  publishBusy: { opacity: 0.6 },
  publishText: { color: colors.white, fontWeight: "600", fontSize: 13.5 },
});
