import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/api";
import { Wordmark } from "../../src/components/AppHeader";
import { CategoryTile } from "../../src/components/CategoryTile";
import { ListingCard } from "../../src/components/ListingCard";
import { SearchBar } from "../../src/components/SearchBar";
import { EmptyState, ErrorState, Loading } from "../../src/components/StateView";
import { colors, radius, space } from "../../src/theme";

export default function HomeScreen() {
  const router = useRouter();

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories,
  });

  const trending = useQuery({
    queryKey: ["listings", "trending"],
    queryFn: () => api.listings({ sort: "recent", limit: 9 }),
  });

  if (categories.isPending) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (categories.isError) {
    const error = categories.error;
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ErrorState
          message={
            error instanceof ApiError
              ? error.message
              : "تعذّر تحميل الأقسام"
          }
          onRetry={() => void categories.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <View style={styles.topRow}>
            <Wordmark />
            <View style={styles.topIcons}>
              <Ionicons name="call-outline" size={22} color={colors.ink} />
              <Ionicons
                name="notifications-outline"
                size={22}
                color={colors.ink}
              />
              <Ionicons name="heart" size={22} color={colors.red} />
            </View>
          </View>
          <SearchBar />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>قسم السيارات صار متوفر</Text>
          <Text style={styles.bannerBody}>
            تصفّح السيارات المعروضة في بغداد
          </Text>
          <Pressable
            style={styles.bannerCta}
            onPress={() => router.push("/browse/cars")}
          >
            <Text style={styles.bannerCtaText}>تصفّح الآن</Text>
          </Pressable>
        </View>

        <SectionHeader title="الأقسام" hint="الباهتة تُفتح قريباً" />
        <View style={styles.grid}>
          {(categories.data ?? []).map((category) => (
            <View key={category.slug} style={styles.gridCell}>
              <CategoryTile
                slug={category.slug}
                nameAr={category.nameAr}
                isActive={category.isActive}
                onPress={() => {
                  if (category.isActive) router.push(`/browse/${category.slug}`);
                }}
              />
            </View>
          ))}
        </View>

        <SectionHeader
          title="الرائجة الآن"
          onMore={() => router.push("/browse/cars")}
        />

        {trending.isPending ? (
          <View style={styles.block}>
            <Loading label="جاري تحميل الإعلانات…" />
          </View>
        ) : trending.isError ? (
          <View style={styles.block}>
            <ErrorState
              message="تعذّر تحميل الإعلانات"
              onRetry={() => void trending.refetch()}
            />
          </View>
        ) : (trending.data?.listings.length ?? 0) === 0 ? (
          <View style={styles.block}>
            <EmptyState
              title="ما في إعلانات بعد"
              hint="كن أول من ينشر. اضغط الزر البرتقالي بالأسفل."
            />
          </View>
        ) : (
          <View style={styles.listGrid}>
            {(trending.data?.listings ?? []).map((listing) => (
              <View key={listing.id} style={styles.listCell}>
                <ListingCard
                  listing={listing}
                  onPress={() => router.push(`/listing/${listing.id}`)}
                />
              </View>
            ))}
          </View>
        )}

        <View style={{ height: space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  hint,
  onMore,
}: {
  title: string;
  hint?: string;
  onMore?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {onMore ? (
        <Pressable onPress={onMore} accessibilityRole="button">
          <Text style={styles.more}>المزيد</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xl },
  head: {
    backgroundColor: colors.surface,
    paddingTop: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  topIcons: { flexDirection: "row", alignItems: "center", gap: space.lg },
  banner: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    backgroundColor: colors.blue,
    borderRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg + 2,
    gap: 5,
    overflow: "hidden",
  },
  bannerTitle: { color: colors.white, fontSize: 17.5, fontWeight: "700" },
  bannerBody: { color: "rgba(255,255,255,0.82)", fontSize: 12.5, lineHeight: 19 },
  bannerCta: {
    alignSelf: "flex-start",
    backgroundColor: colors.orange,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    marginTop: 6,
  },
  bannerCtaText: { color: "#231301", fontWeight: "700", fontSize: 12.5 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.md,
  },
  sectionTitle: {
    fontSize: 16.5,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  sectionHint: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
  more: { color: colors.blue, fontSize: 13.5, fontWeight: "600" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: space.lg - 4,
  },
  gridCell: { width: "33.333%", padding: 4 },
  listGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: space.lg - 4,
  },
  listCell: { width: "50%", padding: 5 },
  block: { minHeight: 160 },
});
