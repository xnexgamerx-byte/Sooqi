import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, getDevUserId, setDevUserId } from "../../src/api";
import { AppHeader } from "../../src/components/AppHeader";
import { cardShadow, colors, radius, space } from "../../src/theme";

export default function AccountScreen() {
  const queryClient = useQueryClient();
  const [draftId, setDraftId] = useState(getDevUserId() ?? "");
  const [signedInAs, setSignedInAs] = useState(getDevUserId());

  const apply = (id: string | null) => {
    setDevUserId(id);
    setSignedInAs(id);
    void queryClient.invalidateQueries();
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
        <View style={styles.card}>
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={34} color={colors.muted} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.name}>
                {signedInAs ? "مستخدم تجريبي" : "زائر"}
              </Text>
              <Text style={styles.meta}>
                {signedInAs ? `المعرّف ${signedInAs.slice(0, 8)}…` : "غير مسجّل"}
              </Text>
            </View>
          </View>
        </View>

        {/*
          تسجيل الدخول الحقيقي لم يُبنَ بعد. هذه البطاقة تسمح بتجربة مسارات
          النشر مقابل خادم يعمل بـ DEV_AUTH=1، وتُحذف كاملة حين يصل تسجيل
          الدخول بحساب Google.
        */}
        <View style={styles.card}>
          <Text style={styles.section}>دخول تجريبي</Text>
          <Text style={styles.body}>
            تسجيل الدخول لم يُبنَ بعد. الصق معرّف مستخدم من قاعدة البيانات
            لتجربة النشر. يعمل فقط مع خادم مضبوط على DEV_AUTH=1.
          </Text>

          <TextInput
            style={styles.input}
            value={draftId}
            onChangeText={setDraftId}
            placeholder="00000000-0000-0000-0000-000000000000"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="right"
          />

          <View style={styles.row}>
            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => apply(draftId.trim() || null)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonPrimaryText}>فعّل</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonGhost]}
              onPress={() => {
                setDraftId("");
                apply(null);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.buttonGhostText}>خروج</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>الخادم</Text>
          <Text style={styles.mono}>{API_URL}</Text>
          <Text style={styles.body}>
            على جهاز حقيقي، localhost يشير إلى الجهاز نفسه. اضبط
            EXPO_PUBLIC_API_URL على عنوان حاسوبك في الشبكة.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>تحتاج مساعدة؟</Text>
          <Row icon="call-outline" label="اتصل بنا" />
          <Row icon="chatbubble-outline" label="أضف اقتراح" />
          <Row icon="document-text-outline" label="شروط الاستخدام" />
          <Row icon="shield-checkmark-outline" label="سياسة الخصوصية" />
        </View>

        <View style={styles.card}>
          <Row icon="trash-outline" label="حذف الحساب نهائياً" danger />
          <Text style={styles.note}>
            حذف الحساب من داخل التطبيق شرط إلزامي لقبول التطبيق في Google Play.
          </Text>
        </View>

        <View style={{ height: space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.listRow} accessibilityRole="button">
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
  name: { fontSize: 19, fontWeight: "600", color: colors.ink },
  meta: { fontSize: 12.5, color: colors.muted },
  section: { fontSize: 16, fontWeight: "600", color: colors.ink },
  body: { fontSize: 12.5, color: colors.ink2, lineHeight: 22 },
  mono: { fontSize: 13, color: colors.blue, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 12.5,
    color: colors.ink,
  },
  row: { flexDirection: "row", gap: space.sm },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: radius.sm,
  },
  buttonPrimary: { backgroundColor: colors.blue },
  buttonPrimaryText: { color: colors.white, fontWeight: "600", fontSize: 14 },
  buttonGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonGhostText: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 11,
  },
  listLabel: { flex: 1, fontSize: 14.5, fontWeight: "500", color: colors.ink },
  danger: { color: colors.red },
  note: { fontSize: 11, color: colors.muted, lineHeight: 19 },
});
