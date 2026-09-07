import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { API_URL, getAuthToken } from "./api";

/**
 * قناة الأحداث الحيّة.
 *
 * تستقبل فقط ولا ترسل: الرسائل تُرسَل بـPOST لأنها تُعاد محاولتها وتصل
 * حالتها بوضوح، أما الدفع في مقبس فيضيع بلا أثر عند انقطاع الاتصال.
 */

export type ServerEvent =
  | { event: "ready"; payload: { userId: string } }
  | { event: "ping"; payload: Record<string, never> }
  | {
      event: "message:new";
      payload: {
        conversationId: string;
        message: {
          id: string;
          senderId: string;
          body: string;
          createdAt: string;
          mine: boolean;
        };
      };
    }
  | { event: "message:sent"; payload: { conversationId: string } };

type Listener = (event: ServerEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wanted = false;

function wsUrl(token: string) {
  const base = API_URL.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/api/ws?token=${encodeURIComponent(token)}`;
}

/**
 * تراجع أسّي مع سقف.
 *
 * بدونه يقصف التطبيق الخادم بمحاولات كل ثانية حين ينقطع الإنترنت، وهو
 * أسوأ ما يمكن فعله بشبكة متقطّعة أصلاً.
 */
function backoffMs() {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

function open() {
  if (!wanted) return;

  const token = getAuthToken();
  if (!token) return;
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  try {
    socket = new WebSocket(wsUrl(token));
  } catch {
    schedule();
    return;
  }

  socket.onopen = () => {
    attempt = 0;
  };

  socket.onmessage = (event) => {
    try {
      const frame = JSON.parse(String(event.data)) as ServerEvent;
      if (frame.event === "ping") return;
      for (const listener of listeners) listener(frame);
    } catch {
      // إطار مشوّه؛ نتجاهله بدل إسقاط الاتصال
    }
  };

  socket.onclose = () => {
    socket = null;
    schedule();
  };

  socket.onerror = () => {
    // onclose سيأتي بعده ويتولّى إعادة المحاولة
  };
}

function schedule() {
  if (!wanted || reconnectTimer) return;
  const delay = backoffMs();
  attempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    open();
  }, delay);
}

export function connectRealtime() {
  wanted = true;
  attempt = 0;
  open();
}

export function disconnectRealtime() {
  wanted = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

export function onServerEvent(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * يبقي القناة مفتوحة ما دام التطبيق في المقدّمة.
 *
 * نغلقها في الخلفية عمداً: نظام التشغيل يقطعها بأي حال، والإشعارات هي
 * القناة الصحيحة للتطبيق الخامل.
 */
export function useRealtime(enabled: boolean, listener?: Listener) {
  const saved = useRef(listener);
  saved.current = listener;

  useEffect(() => {
    if (!enabled) {
      disconnectRealtime();
      return;
    }

    connectRealtime();

    const unsubscribe = onServerEvent((event) => saved.current?.(event));

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") connectRealtime();
      else disconnectRealtime();
    });

    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [enabled]);
}
