import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "../theme";

export function Loading({ label = "جاري التحميل…" }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.blue} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

/**
 * رسالة خطأ تقول ما الذي حصل وكيف يُصلَح، لا مجرد «حدث خطأ».
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.retry} onPress={onRetry}>
          <Text style={styles.retryText}>حاول مرة ثانية</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
    gap: space.md,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 24,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  retry: {
    backgroundColor: colors.blue,
    paddingHorizontal: space.xl,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  retryText: { color: colors.white, fontWeight: "600", fontSize: 14 },
});
