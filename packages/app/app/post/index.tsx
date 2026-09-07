import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { categoryGlyph, categoryTint } from "../../src/categoryImages";
import { ErrorState, Loading } from "../../src/components/StateView";
import { cardShadow, colors, radius, space } from "../../src/theme";

/**
 * الخطوة الأولى بعد الزر البرتقالي: اختيار القسم.
 *
 * تعرض الأقسام المفتوحة للنشر فقط. الأقسام «قريباً» لا تظهر هنا إطلاقاً —
 * إظهارها في شبكة التصفّح يملأ الشاشة، لكن إظهارها هنا يوصل المستخدم إلى
 * طريق مسدود.
 */
export default function PostPickerScreen() {
  const router = useRouter();

  const categories = useQuery({
    queryKey: ["categories", "postable"],
    queryFn: api.postableCategories,
  });

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="إغلاق"
        >
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
      </View>

      <Text style={styles.title}>شنو تريد تبيع أو تعلن عنه؟</Text>
      <Text style={styles.subtitle}>اختر القسم المناسب لإضافة الإعلان</Text>

      {categories.isPending ? (
        <Loading />
      ) : categories.isError ? (
        <ErrorState
          message="تعذّر تحميل الأقسام"
          onRetry={() => void categories.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(categories.data ?? []).map((category) => {
            const tint = categoryTint(category.slug);
            return (
              <Pressable
                key={category.slug}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => router.push(`/post/${category.slug}`)}
                accessibilityRole="button"
              >
                <View style={[styles.icon, { backgroundColor: tint.bg }]}>
                  <Text style={styles.glyph}>
                    {categoryGlyph(category.slug)}
                  </Text>
                </View>
                <Text style={styles.rowLabel}>{category.nameAr}</Text>
                <Ionicons name="chevron-back" size={18} color={colors.muted} />
              </Pressable>
            );
          })}

          <Text style={styles.note}>
            بقية الأقسام تُفتح للنشر تباعاً. النسخة الأولى تركّز على السيارات
            والموبايلات حتى يمتلئ السوق فيهما أولاً.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: space.lg, paddingTop: space.md },
  title: {
    fontSize: 23,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    marginTop: space.xl,
    paddingHorizontal: space.xl,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13.5,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: space.xl,
  },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...cardShadow,
  },
  pressed: { opacity: 0.65 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 19, lineHeight: 24 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  note: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 21,
    textAlign: "center",
    marginTop: space.xl,
    paddingHorizontal: space.md,
  },
});
