import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, I18nManager, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadStoredToken } from "../src/session";
import { colors } from "../src/theme";

/**
 * فرض الاتجاه من اليمين لليسار.
 *
 * يجب أن يُنفَّذ قبل أول رسم للواجهة. على أندرويد يحتاج التغيير إعادة
 * تشغيل كاملة للتطبيق ليأخذ مفعوله في أول تثبيت — هذا سلوك النظام لا خطأ.
 */
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  // عميل واحد لكامل عمر التطبيق؛ إنشاؤه داخل useState يمنع إعادة بنائه
  // مع كل إعادة رسم في وضع التطوير السريع.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // الشبكة في العراق متقطّعة؛ محاولتان إضافيتان أفضل من رسالة خطأ
            retry: 2,
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  /**
   * الرمز يُقرأ قبل رسم أي شاشة.
   *
   * بدون هذه البوابة ينطلق أول استعلام بلا ترويسة مصادقة، فيرى المستخدم
   * المسجّل شاشة «سجّل الدخول» للحظة قبل أن تُصحّح نفسها.
   */
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    void loadStoredToken().then(() => setTokenReady(true));
  }, []);

  if (!tokenReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: Platform.OS === "android" ? "fade_from_bottom" : "default",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="listing/[id]" />
            <Stack.Screen name="browse/[slug]" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen
              name="post/index"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen
              name="post/[slug]"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen name="login" options={{ presentation: "modal" }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
