import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { api } from "../../src/api";
import { AppHeader } from "../../src/components/AppHeader";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../src/components/StateView";
import { arNumber, priceLabel, timeAgo } from "../../src/format";
import { useSession } from "../../src/session";
import { cardShadow, colors, radius, space } from "../../src/theme";
import { useRealtime } from "../../src/ws";
import type { Conversation } from "../../src/types";

type Filter = "all" | "buying" | "selling" | "unread";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "selling", label: "البيع" },
  { key: "buying", label: "الشراء" },
  { key: "unread", label: "غير مقروء" },
];

export default function ChatsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useSession();
  const [filter, setFilter] = useState<Filter>("all");

  const chats = useQuery({
    queryKey: ["conversations"],
    queryFn: api.conversations,
    enabled: isSignedIn,
  });

  // رسالة جديدة تصل حيّة: نحدّث الصندوق بدل انتظار سحب دوري
  useRealtime(isSignedIn, (event) => {
    if (event.event === "message:new") {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  const rows = (chats.data ?? []).filter((chat) => {
    if (filter === "unread") return chat.unread > 0;
    if (filter === "all") return true;
    return chat.side === filter;
  });

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader title="دردشاتي" />

      {!isSignedIn ? (
        <View style={styles.gate}>
          <EmptyState
            title="سجّل الدخول لتشوف دردشاتك"
            hint="المحادثات مربوطة بحسابك."
          />
          <Pressable
            style={styles.gateCta}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.gateCtaText}>سجّل دخولك</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.chips}>
            {FILTERS.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.chip, filter === option.key && styles.chipOn]}
                onPress={() => setFilter(option.key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    filter === option.key && styles.chipTextOn,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {chats.isPending ? (
            <Loading />
          ) : chats.isError ? (
            <ErrorState
              message="تعذّر تحميل الدردشات"
              onRetry={() => void chats.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="ما في دردشات"
              hint="افتح إعلاناً واضغط زر الدردشة لتبدأ."
            />
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <ChatRow
                  chat={item}
                  onPress={() => router.push(`/chat/${item.id}`)}
                />
              )}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function ChatRow({
  chat,
  onPress,
}: {
  chat: Conversation;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.thumb}>
        {chat.listingImage ? (
          <Image
            source={{ uri: chat.listingImage }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <Ionicons name="image-outline" size={20} color={colors.muted} />
        )}
        {chat.otherOnline ? <View style={styles.online} /> : null}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {chat.otherName}
          </Text>
          <Text style={styles.time}>{timeAgo(chat.lastMessageAt)}</Text>
        </View>

        <Text style={styles.listing} numberOfLines={1}>
          {chat.listingTitle} · {priceLabel(chat.listingPrice)}
        </Text>

        <View style={styles.rowTop}>
          <Text style={styles.preview} numberOfLines={1}>
            {chat.lastMessageText ?? "ما في رسائل بعد"}
          </Text>
          {chat.unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{arNumber(chat.unread)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  gate: { flex: 1, justifyContent: "center", paddingHorizontal: space.xxl },
  gateCta: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  gateCtaText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  chips: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.surface,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontSize: 13, fontWeight: "500", color: colors.ink2 },
  chipTextOn: { color: colors.white, fontWeight: "600" },
  list: { padding: space.md, gap: space.sm },
  row: {
    flexDirection: "row",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    alignItems: "center",
    ...cardShadow,
  },
  pressed: { opacity: 0.7 },
  thumb: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  online: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: { flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.ink },
  time: { fontSize: 10.5, color: colors.muted },
  listing: { fontSize: 11.5, color: colors.blue, fontWeight: "500" },
  preview: { flex: 1, fontSize: 12.5, color: colors.muted },
  badge: {
    backgroundColor: colors.red,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "700" },
});
