import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../src/api";
import { Wordmark } from "../src/components/AppHeader";
import { arNumber } from "../src/format";
import { useSession } from "../src/session";
import { colors, radius, space } from "../src/theme";

/** كم ننتظر قبل السماح بإعادة إرسال الرمز. يطابق حدّ الخادم. */
const RESEND_SECONDS = 60;

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<TextInput>(null);

  const methods = useQuery({
    queryKey: ["auth-methods"],
    queryFn: api.authMethods,
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const requestCode = useMutation({
    mutationFn: () => api.requestOtp(phone),
    onSuccess: () => {
      setError(null);
      setStep("code");
      setCooldown(RESEND_SECONDS);
      setTimeout(() => codeInput.current?.focus(), 250);
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : "صار خطأ");
    },
  });

  const verify = useMutation({
    mutationFn: () => api.verifyOtp(phone, code, Platform.OS),
    onSuccess: async (result) => {
      await signIn(result.token);
      router.back();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : "صار خطأ");
      setCode("");
    },
  });

  const phoneReady = phone.replace(/[^0-9٠-٩]/g, "").length >= 10;
  const codeReady = code.trim().length >= 4;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Wordmark />
          </View>

          {step === "phone" ? (
            <>
              <Text style={styles.title}>سجّل دخولك</Text>
              <Text style={styles.subtitle}>
                نرسل لك رمز تحقق برسالة قصيرة. رقمك لا يظهر لأحد إلا حين تنشر
                إعلاناً وتختار إظهاره.
              </Text>

              <View style={styles.phoneRow}>
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>٩٦٤+</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    setError(null);
                  }}
                  keyboardType="phone-pad"
                  placeholder="٧٧٠ ١٢٣ ٤٥٦٧"
                  placeholderTextColor={colors.muted}
                  textAlign="right"
                  autoFocus
                  maxLength={20}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {methods.data && !methods.data.smsDelivers ? (
                <View style={styles.notice}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={colors.orangeDark}
                  />
                  <Text style={styles.noticeText}>
                    الخادم في وضع التطوير: الرمز يُطبع في سجلّ الخادم ولن تصل
                    رسالة إلى هاتفك.
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[styles.cta, !phoneReady && styles.ctaOff]}
                disabled={!phoneReady || requestCode.isPending}
                onPress={() => requestCode.mutate()}
              >
                {requestCode.isPending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.ctaText}>أرسل الرمز</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>اكتب الرمز</Text>
              <Text style={styles.subtitle}>
                أرسلنا رمزاً من ستة أرقام إلى {phone}
              </Text>

              <TextInput
                ref={codeInput}
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(value) => {
                  setCode(value.replace(/[^0-9]/g, ""));
                  setError(null);
                }}
                keyboardType="number-pad"
                placeholder="——————"
                placeholderTextColor={colors.line}
                textAlign="center"
                maxLength={6}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.cta, !codeReady && styles.ctaOff]}
                disabled={!codeReady || verify.isPending}
                onPress={() => verify.mutate()}
              >
                {verify.isPending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.ctaText}>دخول</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.link}
                disabled={cooldown > 0 || requestCode.isPending}
                onPress={() => requestCode.mutate()}
              >
                <Text
                  style={[styles.linkText, cooldown > 0 && styles.linkOff]}
                >
                  {cooldown > 0
                    ? `أعد الإرسال بعد ${arNumber(cooldown)} ثانية`
                    : "أعد إرسال الرمز"}
                </Text>
              </Pressable>

              <Pressable
                style={styles.link}
                onPress={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
              >
                <Text style={styles.linkText}>غيّر الرقم</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.legal}>
            بدخولك توافق على شروط الاستخدام وسياسة الخصوصية.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: space.lg, paddingTop: space.md },
  body: { padding: space.xl, gap: space.md },
  brand: { alignItems: "center", marginVertical: space.xxl },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13.5,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 23,
    marginBottom: space.md,
  },
  phoneRow: { flexDirection: "row", gap: space.sm },
  prefix: {
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  prefixText: { fontSize: 15, fontWeight: "600", color: colors.ink2 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  phoneInput: { flex: 1 },
  codeInput: { fontSize: 26, letterSpacing: 8, fontWeight: "700" },
  error: { color: colors.red, fontSize: 13, textAlign: "center" },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    backgroundColor: "#FFF7E8",
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 21,
    color: "#7A5410",
  },
  cta: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: space.sm,
  },
  ctaOff: { backgroundColor: colors.muted },
  ctaText: { color: colors.white, fontSize: 15.5, fontWeight: "700" },
  link: { alignItems: "center", paddingVertical: space.sm },
  linkText: { color: colors.blue, fontSize: 13.5, fontWeight: "600" },
  linkOff: { color: colors.muted },
  legal: {
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
    marginTop: space.xl,
    lineHeight: 19,
  },
});
