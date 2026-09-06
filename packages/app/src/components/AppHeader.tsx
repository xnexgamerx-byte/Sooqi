import { StyleSheet, Text, View } from "react-native";
import { colors, space } from "../theme";

/** شريط العنوان الموحّد. الشعار في اليمين لأن الواجهة من اليمين لليسار. */
export function AppHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

export function Wordmark() {
  return (
    <View style={styles.mark}>
      <Text style={styles.markAr}>
        سوق<Text style={styles.markAccent}>نا</Text>
      </Text>
      <View style={styles.markBadge}>
        <Text style={styles.markLat}>SOUQNA</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 19, fontWeight: "600", color: colors.ink },
  right: { flexDirection: "row", alignItems: "center", gap: space.lg },
  mark: { alignItems: "flex-end", gap: 3 },
  markAr: { fontSize: 19, fontWeight: "700", color: colors.ink },
  markAccent: { color: colors.blue },
  markBadge: {
    backgroundColor: colors.blue,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  markLat: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
});
