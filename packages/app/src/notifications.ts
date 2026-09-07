import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "./api";

/**
 * إشعارات الجهاز.
 *
 * نستخدم Expo push لا FCM مباشرة: مجانية، بلا مفاتيح، وتوصل إلى أندرويد
 * و iOS من واجهة واحدة. راجع packages/server/src/push.ts للطرف الآخر.
 */

/**
 * هل نحن داخل تطبيق Expo Go؟
 *
 * منذ SDK 53 أُخرجت الإشعارات البعيدة من Expo Go، ومجرّد تحميل الوحدة
 * expo-notifications هناك يرمي خطأ يوقف التطبيق كلّه قبل أول شاشة.
 */
const inExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * تُحمَّل الوحدة عند الحاجة لا عند بدء التطبيق.
 *
 * الاستيراد الساكن في أعلى الملف يُنفَّذ مع أول شاشة، وأثره الجانبي هو
 * ما ينهار في Expo Go. الاستيراد الديناميكي يؤجّله إلى ما بعد الفحص.
 */
type NotificationsModule = typeof import("expo-notifications");

let modulePromise: Promise<NotificationsModule> | null = null;
let handlerSet = false;

async function loadNotifications(): Promise<NotificationsModule> {
  modulePromise ??= import("expo-notifications");
  const Notifications = await modulePromise;

  if (!handlerSet) {
    handlerSet = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }

  return Notifications;
}

let registered = false;

/**
 * يطلب الإذن ويسجّل رمز الجهاز عند الخادم.
 *
 * لا يرمي أبداً: رفض الإذن أو غياب الإنترنت يجب ألا يمنع استخدام التطبيق.
 * يعيد سبب الفشل لمن يريد عرضه.
 */
export async function registerForPush(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (registered) return { ok: true };

  if (inExpoGo) {
    return {
      ok: false,
      reason: "الإشعارات تحتاج نسخة مبنيّة من التطبيق، لا تعمل في Expo Go",
    };
  }

  // المحاكي لا يصدر رموز إشعارات؛ لا داعي لإزعاج المطوّر بنافذة إذن
  if (!Device.isDevice) {
    return { ok: false, reason: "الإشعارات تعمل على جهاز حقيقي فقط" };
  }

  try {
    const Notifications = await loadNotifications();

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "الإشعارات",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }

    if (status !== "granted") {
      return { ok: false, reason: "لم يُمنح إذن الإشعارات" };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await api.registerPushToken(token.data, Platform.OS);
    registered = true;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "تعذّر تسجيل الإشعارات",
    };
  }
}

/** يُنسي التسجيل عند الخروج، فيُعاد للحساب التالي. */
export function resetPushRegistration() {
  registered = false;
}
