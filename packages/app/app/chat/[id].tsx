import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/api";
import { ErrorState, Loading } from "../../src/components/StateView";
import { priceLabel } from "../../src/format";
import { useSession } from "../../src/session";
import { colors, radius, space } from "../../src/theme";
import { useRealtime } from "../../src/ws";
import type { ChatMessage } from "../../src/types";

/** ردود سريعة. أكثر ما يُكتب في محادثة بيع، فلا داعي لكتابته كل مرة. */
const QUICK_REPLIES = [
  "متوفرة؟",
  "آخر سعر شكد؟",
  "وين موقعك؟",
  "أقدر أشوفها؟",
];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useSession();
  const [draft, setDraft] = useState("");

  const thread = useQuery({
    queryKey: ["thread", id],
    queryFn: () => api.thread(id),
    enabled: Boolean(id) && isSignedIn,
  });

  /**
   * تصفير غير المقروء عند الفتح.
   *
   * مرة واحدة عند التركيب لا مع كل رسالة: النداء مع كل رسالة يعني طلباً
   * شبكياً لكل ضغطة إرسال بلا فائدة.
   */
  useEffect(() => {
    if (!id || !isSignedIn) return;
    void api
      .markRead(id)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .catch(() => {
        // تصفير العدّاد ليس حرجاً؛ يُعاد عند الفتح القادم
      });
  }, [id, isSignedIn, queryClient]);

  useRealtime(isSignedIn, (event) => {
    if (event.event === "message:new" && event.payload.conversationId === id) {
      void thread.refetch();
      void api.markRead(id).catch(() => {});
    }
  });

  const send = useMutation({
    mutationFn: (body: string) => api.sendMessage(id, body),
    onSuccess: () => {
      setDraft("");
      void thread.refetch();
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      Alert.alert(
        "ما انرسلت",
        error instanceof ApiError ? error.message : "حاول مرة ثانية",
      );
    },
  });

  const block = useMutation({
    mutationFn: (userId: string) => api.blockUser(userId),
    onSuccess: () => {
      Alert.alert("انحظر", "ما راح يقدر يراسلك بعد الآن.");
      router.back();
    },
  });

  if (thread.isPending) {
    return (
      <SafeAreaView style={styles.screen}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (thread.isError || !thread.data) {
    return (
      <SafeAreaView style={styles.screen}>
        <ErrorState
          message={
            thread.error instanceof ApiError
              ? thread.error.message
              : "تعذّر فتح المحادثة"
          }
          onRetry={() => void thread.refetch()}
        />
      </SafeAreaView>
    );
  }

  const { conversation, messages } = thread.data;

  const confirmBlock = () => {
    Alert.alert("حظر المستخدم", `تريد تحظر ${conversation.otherName}؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احظر",
        style: "destructive",
        onPress: () => block.mutate(conversation.otherId),
      },
    ]);
  };

  const reportUser = () => {
    void api
      .report({
        targetType: "user",
        targetId: conversation.otherId,
        reason: "scam",
      })
      .then(() => Alert.alert("وصل البلاغ", "راح يراجعه فريق الإشراف."))
      .catch(() => Alert.alert("ما وصل البلاغ", "حاول مرة ثانية"));
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-forward" size={24} color={colors.ink} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{conversation.otherName}</Text>
          {conversation.otherOnline ? (
            <Text style={styles.online}>متصل الآن</Text>
          ) : null}
        </View>

        <Pressable
          onPress={() =>
            Alert.alert("خيارات", undefined, [
              { text: "إلغاء", style: "cancel" },
              { text: "بلّغ عن المستخدم", onPress: reportUser },
              {
                text: "احظر المستخدم",
                style: "destructive",
                onPress: confirmBlock,
              },
            ])
          }
          hitSlop={12}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {conversation.listing ? (
        <Pressable
          style={styles.context}
          onPress={() => router.push(`/listing/${conversation.listing?.id}`)}
        >
          <View style={styles.contextThumb}>
            <Ionicons name="pricetag-outline" size={18} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.contextTitle} numberOfLines={1}>
              {conversation.listing.title}
            </Text>
            <Text style={styles.contextPrice}>
              {priceLabel(conversation.listing.priceIqd)}
            </Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          // مقلوبة: تبقى آخر رسالة ظاهرة بلا حساب تمرير يدوي
          inverted
          contentContainerStyle={styles.thread}
          renderItem={({ item }) => <Bubble message={item} />}
        />

        {messages.length === 0 ? (
          <View style={styles.quick}>
            {QUICK_REPLIES.map((reply) => (
              <Pressable
                key={reply}
                style={styles.quickChip}
                onPress={() => send.mutate(reply)}
              >
                <Text style={styles.quickText}>{reply}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.warn}>
          <Ionicons name="bulb-outline" size={15} color="#A9720E" />
          <Text style={styles.warnText}>
            لا ترسل مبلغاً مقدماً ولا تشارك رمز التحقق مع أحد.
          </Text>
        </View>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="اكتب رسالة…"
            placeholderTextColor={colors.muted}
            textAlign="right"
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[
              styles.send,
              (!draft.trim() || send.isPending) && styles.sendOff,
            ]}
            disabled={!draft.trim() || send.isPending}
            onPress={() => send.mutate(draft.trim())}
            accessibilityRole="button"
            accessibilityLabel="أرسل"
          >
            <Ionicons name="send" size={17} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const time = new Date(message.createdAt);
  const stamp = `${String(time.getHours()).padStart(2, "0")}:${String(
    time.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <View style={[styles.bubble, message.mine ? styles.mine : styles.theirs]}>
      <Text style={[styles.text, message.mine && styles.textMine]}>
        {message.body}
      </Text>
      <Text style={[styles.stamp, message.mine && styles.stampMine]}>
        {stamp}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink },
  online: { fontSize: 11, color: colors.green, fontWeight: "600" },
  context: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  contextThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  contextTitle: { fontSize: 13, fontWeight: "600", color: colors.ink },
  contextPrice: { fontSize: 12.5, fontWeight: "700", color: colors.blue },
  thread: { padding: space.lg, gap: space.sm },
  bubble: {
    maxWidth: "80%",
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginBottom: space.sm,
  },
  mine: {
    backgroundColor: colors.blue,
    alignSelf: "flex-end",
    borderBottomLeftRadius: 5,
  },
  theirs: {
    backgroundColor: colors.surface,
    alignSelf: "flex-start",
    borderBottomRightRadius: 5,
  },
  text: { fontSize: 13.5, lineHeight: 21, color: colors.ink },
  textMine: { color: colors.white },
  stamp: { fontSize: 9.5, color: colors.muted, marginTop: 3 },
  stampMine: { color: "rgba(255,255,255,0.7)" },
  quick: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  quickChip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  quickText: { fontSize: 12.5, color: colors.ink2 },
  warn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: "#FFF7E8",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  warnText: { flex: 1, fontSize: 11, color: "#7A5410", lineHeight: 18 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    padding: space.md,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13.5,
    color: colors.ink,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { backgroundColor: colors.muted },
});
