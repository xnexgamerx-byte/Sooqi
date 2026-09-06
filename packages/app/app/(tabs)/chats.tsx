import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../src/components/AppHeader";
import { colors, radius, space } from "../../src/theme";

/**
 * الدردشة لم تُبنَ بعد على الخادم (الأسبوعان السابع والثامن في الخطة).
 * نعرض حالة صادقة بدل شاشة تبدو معطّلة.
 */
export default function ChatsScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader
        title="دردشاتي"
        right={
          <Ionicons name="settings-outline" size={22} color={colors.ink} />
        }
      />

      <View style={styles.center}>
        <View style={styles.icon}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={30}
            color={colors.blue}
          />
        </View>
        <Text style={styles.title}>الدردشة قريباً</Text>
        <Text style={styles.body}>
          لهسّه تقدر توصل البائع بزر «أظهر الرقم» في صفحة الإعلان، وتتصل بيه
          أو ترسل له واتساب.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
    gap: space.md,
  },
  icon: {
    width: 66,
    height: 66,
    borderRadius: radius.xl,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.ink },
  body: {
    fontSize: 13.5,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 23,
    maxWidth: 300,
  },
});
