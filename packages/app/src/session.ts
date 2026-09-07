import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { api, setAuthToken } from "./api";
import { registerForPush, resetPushRegistration } from "./notifications";
import type { CurrentUser } from "./types";

/**
 * جلسة المستخدم.
 *
 * الرمز في التخزين الآمن لا في AsyncStorage: على أندرويد يذهب إلى
 * Keystore وعلى iOS إلى Keychain، فلا يُقرأ بنسخ احتياطي أو بجذر بسيط.
 * رمز جلسة عمره تسعون يوماً يستحق ذلك.
 */
const TOKEN_KEY = "souqna.session.token";

let cachedToken: string | null = null;
let loaded = false;

export async function loadStoredToken(): Promise<string | null> {
  if (loaded) return cachedToken;

  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // التخزين الآمن قد يفشل على محاكيات قديمة؛ الزائر يتصفّح بلا حساب
    cachedToken = null;
  }

  loaded = true;
  setAuthToken(cachedToken);
  return cachedToken;
}

export async function storeToken(token: string | null) {
  cachedToken = token;
  loaded = true;
  setAuthToken(token);

  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // لا نُسقط تسجيل الدخول لأن الحفظ فشل؛ الجلسة تعمل حتى إغلاق التطبيق
  }
}

/**
 * حالة الجلسة الحالية.
 *
 * `isLoading` يغطي قراءة الرمز من التخزين ثم التحقق منه عند الخادم، حتى
 * لا تومض شاشة الدخول للمستخدم المسجّل أصلاً.
 */
export function useSession() {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    if (loaded) return;
    void loadStoredToken().then(() => setReady(true));
  }, []);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: ready && Boolean(cachedToken),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const signIn = useCallback(
    async (token: string) => {
      await storeToken(token);
      await queryClient.invalidateQueries();
      // التسجيل بعد الدخول لا قبله: الرمز يُربط بالحساب على الخادم
      void registerForPush();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // الرمز قد يكون منتهياً أصلاً؛ ننظّف محلياً في الحالتين
    }
    await storeToken(null);
    resetPushRegistration();
    queryClient.clear();
  }, [queryClient]);

  // الجلسة المستعادة عند الإقلاع تحتاج تسجيلاً أيضاً؛ الرمز قد يتغيّر
  useEffect(() => {
    if (me.data?.user) void registerForPush();
  }, [me.data?.user]);

  const user: CurrentUser | null = me.data?.user ?? null;

  return {
    ready,
    isLoading: !ready || (Boolean(cachedToken) && me.isPending),
    /** رمز غير صالح: نظّفه بدل إبقاء المستخدم في حالة نصف مسجّلة. */
    isSignedIn: Boolean(cachedToken) && !me.isError,
    user,
    signIn,
    signOut,
    refresh: () => me.refetch(),
  };
}

export function hasToken() {
  return Boolean(cachedToken);
}
