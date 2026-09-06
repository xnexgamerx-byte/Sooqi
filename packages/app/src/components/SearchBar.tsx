import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "../theme";

/** شريط بحث للعرض فقط؛ الضغط عليه يفتح شاشة البحث. */
export function SearchBar({
  placeholder = "ابحث في سوقنا…",
  onPress,
}: {
  placeholder?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={styles.bar}
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
    >
      <Text style={styles.text}>{placeholder}</Text>
      <View style={styles.flag}>
        <View style={[styles.stripe, { backgroundColor: "#CE1126" }]} />
        <View style={[styles.stripe, { backgroundColor: "#FFFFFF" }]} />
        <View style={[styles.stripe, { backgroundColor: "#000000" }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
  },
  text: { color: colors.muted, fontSize: 14.5 },
  flag: {
    width: 26,
    height: 18,
    borderRadius: 3,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
  },
  stripe: { flex: 1 },
});
