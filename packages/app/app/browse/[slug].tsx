import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { ListingCard } from "../../src/components/ListingCard";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../src/components/StateView";
import { colors, radius, space } from "../../src/theme";

type Sort = "recent" | "cheap" | "expensive";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "الأحدث" },
  { key: "cheap", label: "الأرخص" },
  { key: "expensive", label: "الأغلى" },
];

export default function BrowseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const [sort, setSort] = useState<Sort>("recent");
  const [city, setCity] = useState<string | undefined>(undefined);
  const [child, setChild] = useState<string | undefined>(undefined);

  const category = useQuery({
    queryKey: ["category", slug],
    queryFn: () => api.category(slug),
    enabled: Boolean(slug),
  });

  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities });

  const listings = useInfiniteQuery({
    queryKey: ["listings", child ?? slug, sort, city],
    initialPageParam: { cursor: undefined, offset: 0 } as {
      cursor?: string;
      offset: number;
    },
    queryFn: ({ pageParam }) =>
      api.listings({
        category: child ?? slug,
        city,
        sort,
        limit: 24,
        cursor: pageParam.cursor,
        offset: pageParam.offset,
      }),
    getNextPageParam: (last) => {
      // الترتيب «الأحدث» يستخدم مؤشراً، وترتيبا السعر إزاحة
      if (last.nextCursor) return { cursor: last.nextCursor, offset: 0 };
      if (last.nextOffset !== null) return { offset: last.nextOffset };
      return undefined;
    },
    enabled: Boolean(slug),
  });

  const rows = listings.data?.pages.flatMap((page) => page.listings) ?? [];
  const title = category.data?.category.nameAr ?? "تصفّح";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Ionicons name="arrow-forward" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {SORTS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            active={sort === option.key}
            onPress={() => setSort(option.key)}
          />
        ))}
        <View style={styles.divider} />
        <Chip
          label="كل المدن"
          active={city === undefined}
          onPress={() => setCity(undefined)}
        />
        {(cities.data ?? []).slice(0, 6).map((option) => (
          <Chip
            key={option.slug}
            label={option.nameAr}
            active={city === option.slug}
            onPress={() => setCity(option.slug)}
          />
        ))}
      </ScrollView>

      {(category.data?.children?.length ?? 0) > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          <Chip
            label="الكل"
            active={child === undefined}
            onPress={() => setChild(undefined)}
          />
          {(category.data?.children ?? []).map((option) => (
            <Chip
              key={option.slug}
              label={option.nameAr}
              active={child === option.slug}
              onPress={() => setChild(option.slug)}
            />
          ))}
        </ScrollView>
      ) : null}

      {listings.isPending ? (
        <Loading label="جاري تحميل الإعلانات…" />
      ) : listings.isError ? (
        <ErrorState
          message="تعذّر تحميل الإعلانات"
          onRetry={() => void listings.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="ما في إعلانات بهذا القسم"
          hint="جرّب مدينة ثانية، أو كن أول من ينشر هنا."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (listings.hasNextPage && !listings.isFetchingNextPage) {
              void listings.fetchNextPage();
            }
          }}
          ListFooterComponent={
            listings.isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} color={colors.blue} />
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <ListingCard
                listing={item}
                onPress={() => router.push(`/listing/${item.id}`)}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  title: { fontSize: 18, fontWeight: "600", color: colors.ink },
  chipRow: {
    backgroundColor: colors.surface,
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  chipRowContent: {
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    gap: space.sm,
    alignItems: "center",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: colors.line,
    marginHorizontal: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontSize: 13, fontWeight: "500", color: colors.ink2 },
  chipTextActive: { color: colors.white, fontWeight: "600" },
  list: { padding: space.md, paddingBottom: space.xxl },
  column: { gap: space.sm },
  cell: { flex: 1, marginBottom: space.md },
  footer: { paddingVertical: space.xl },
});
