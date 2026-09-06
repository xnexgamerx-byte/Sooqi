import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "../../src/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * الجزء الذي نستعمله فعلاً من خصائص شريط التبويب.
 *
 * نعرّفه هنا بدل استيراده من @react-navigation/bottom-tabs: تلك الحزمة
 * تفصيل داخلي في expo-router، والاعتماد المباشر عليها يربطنا بنسخة قد
 * تتغيّر تحتنا.
 */
type TabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: {
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

const TABS: { name: string; label: string; icon: IoniconName }[] = [
  { name: "index", label: "الرئيسية", icon: "home" },
  { name: "chats", label: "دردشاتي", icon: "chatbubble-ellipses" },
  { name: "my-ads", label: "إعلاناتي", icon: "reader" },
  { name: "account", label: "حسابي", icon: "person" },
];

/**
 * شريط تنقّل مخصّص.
 *
 * الشريط الافتراضي لا يستطيع رسم الزر البرتقالي المرتفع في الوسط، وهو
 * أبرز عنصر في التصميم، فبنيناه بأنفسنا. الزر ليس تبويباً: يفتح رحلة
 * «أضف إعلان» فوق التبويب الحالي.
 */
function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const items = TABS.map((tab) => ({
    ...tab,
    index: state.routes.findIndex((route) => route.name === tab.name),
  })).filter((tab) => tab.index !== -1);

  const middle = Math.ceil(items.length / 2);
  const before = items.slice(0, middle);
  const after = items.slice(middle);

  const renderTab = (tab: (typeof items)[number]) => {
    const focused = state.index === tab.index;
    const route = state.routes[tab.index];

    return (
      <Pressable
        key={tab.name}
        style={styles.tab}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={tab.label}
        onPress={() => {
          if (!route) return;
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }}
      >
        <Ionicons
          name={focused ? tab.icon : (`${tab.icon}-outline` as IoniconName)}
          size={22}
          color={focused ? colors.blue : colors.muted}
        />
        <Text style={[styles.label, focused && styles.labelActive]}>
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
      {before.map(renderTab)}

      <View style={styles.tab}>
        <Pressable
          style={styles.fab}
          onPress={() => router.push("/post")}
          accessibilityRole="button"
          accessibilityLabel="أضف إعلان"
        >
          <Ionicons name="camera" size={25} color={colors.white} />
        </Pressable>
        <Text style={styles.fabLabel}>أضف إعلان</Text>
      </View>

      {after.map(renderTab)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 9,
    paddingHorizontal: space.sm,
  },
  tab: { flex: 1, alignItems: "center", gap: 4 },
  label: { fontSize: 10, fontWeight: "600", color: colors.muted },
  labelActive: { color: colors.blue },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.surface,
    shadowColor: colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  fabLabel: { fontSize: 10, fontWeight: "600", color: colors.muted },
});
