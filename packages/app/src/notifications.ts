import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

/**
 * إشعارات الجهاز.
 *
 * نستخدم Expo push لا FCM مباشرة: مجانية، بلا مفاتيح، وتوصل إلى أندرويد
 * و iOS من واجهة واحدة. راجع packages/server/src/push.ts للطرف الآخر.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

  // المحاكي لا يصدر رموز إشعارات؛ لا داعي لإزعاج المطوّر بنافذة إذن
  if (!Device.isDevice) {
    return { ok: false, reason: "الإشعارات تعمل على جهاز حقيقي فقط" };
  }

  try {
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
