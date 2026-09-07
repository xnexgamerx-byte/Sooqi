import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
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
import { api, API_URL, ApiError } from "../../src/api";
import { AppHeader } from "../../src/components/AppHeader";
import { arDigits, arNumber } from "../../src/format";
import { useSession } from "../../src/session";
import { cardShadow, colors, radius, space } from "../../src/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { isSignedIn, isLoading, user, signOut } = useSession();

  const remove = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: async () => {
      await signOut();
      Alert.alert("انحذف الحساب", "انحذف حسابك وكل إعلاناتك نهائياً.");
    },
    onError: (error) => {
      Alert.alert(
        "تعذّر حذف الحساب",
        error instanceof ApiError ? error.message : "حاول مرة ثانية",
      );
    },
  });

  const confirmDelete = () => {
    Alert.alert(
      "حذف الحساب نهائياً",
      "راح تنحذف إعلاناتك ومحادثاتك كلها. ما تكدر ترجعها.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "احذف",
          style: "destructive",
          onPress: () => remove.mutate(),
        },
      ],
    );
  };

  const confirmSignOut = () => {
    Alert.alert("خروج", "متأكد تريد تسجّل خروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader
        title="حسابي"
        right={
          <Ionicons name="settings-outline" size={22} color={colors.ink} />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isSignedIn && user ? (
          <View style={styles.card}>
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={34} color={colors.muted} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{user.name}</Text>
                  {user.isVerified ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color={colors.blue}
                    />
                  ) : null}
                </View>
                <Text style={styles.meta}>
                  رقم الحساب {arDigits(user.publicId)}
                </Text>
                {user.phone ? (
                  <Text style={styles.meta}>{user.phone}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.limitBox}>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>حدّ الإعلانات الفعّالة</Text>
                <Text style={styles.limitValue}>
                  {arNumber(user.activeListingLimit)}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.section}>ما سجّلت دخول</Text>
            <Text style={styles.body}>
              تكدر تتصفّح كل الإعلانات بدون حساب. تحتاج حساباً بس لنشر إعلان
              أو حفظ المفضلة.
            </Text>
            <Pressable
              style={styles.primary}
              onPress={() => router.push("/login")}
              disabled={isLoading}
            >
              <Text style={styles.primaryText}>
                {isLoading ? "لحظة…" : "سجّل دخولك"}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.section}>تحتاج مساعدة؟</Text>
          <Row icon="call-outline" label="اتصل بنا" />
          <Row icon="chatbubble-outline" label="أضف اقتراح" />
          <Row icon="document-text-outline" label="شروط الاستخدام" />
          <Row icon="shield-checkmark-outline" label="سياسة الخصوصية" />
        </View>

        {isSignedIn ? (
          <View style={styles.card}>
            <Row icon="log-out-outline" label="خروج" onPress={confirmSignOut} />
            <Row
              icon="trash-outline"
              label={remove.isPending ? "جاري الحذف…" : "حذف الحساب نهائياً"}
              danger
              onPress={remove.isPending ? undefined : confirmDelete}
            />
            <Text style={styles.note}>
              حذف الحساب من داخل التطبيق شرط إلزامي لقبول التطبيق في Google
              Play.
            </Text>
          </View>
        ) : null}

        <Text style={styles.server}>{API_URL}</Text>
        <View style={{ height: space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
      accessibilityRole="button"
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={19}
        color={danger ? colors.red : colors.blue}
      />
      <Text style={[styles.listLabel, danger && styles.danger]}>{label}</Text>
      <Ionicons name="chevron-back" size={17} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    ...cardShadow,
  },
  profile: { flexDirection: "row", alignItems: "center", gap: space.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 19, fontWeight: "600", color: colors.ink },
  meta: { fontSize: 12.5, color: colors.muted },
  limitBox: {
    borderWidth: 1.4,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  limitLabel: { fontSize: 13.5, fontWeight: "600", color: colors.ink },
  limitValue: { fontSize: 15, fontWeight: "700", color: colors.blue },
  section: { fontSize: 16, fontWeight: "600", color: colors.ink },
  body: { fontSize: 13, color: colors.ink2, lineHeight: 23 },
  primary: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 11,
  },
  pressed: { opacity: 0.6 },
  listLabel: { flex: 1, fontSize: 14.5, fontWeight: "500", color: colors.ink },
  danger: { color: colors.red },
  note: { fontSize: 11, color: colors.muted, lineHeight: 19 },
  server: { fontSize: 10.5, color: colors.muted, textAlign: "center" },
});
