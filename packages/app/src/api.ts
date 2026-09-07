import type {
  Category,
  ChatMessage,
  Conversation,
  CurrentUser,
  CategoryField,
  City,
  ListingDetail,
  ListingSummary,
  MyListing,
} from "./types";

/**
 * على المحاكي أو جهاز حقيقي، localhost يشير إلى الجهاز نفسه لا إلى حاسوبك.
 * اضبط EXPO_PUBLIC_API_URL على عنوان حاسوبك في الشبكة، مثل http://192.168.1.5:5000
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5000";

/** رمز الجلسة. يضبطه src/session.ts بعد القراءة من التخزين الآمن. */
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.body) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "تعذّر الاتصال بالخادم. تحقق من الإنترنت.", "offline");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; code?: string } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.message ?? "صار خطأ. حاول مرة ثانية.",
      error?.code ?? "unknown",
    );
  }

  return payload as T;
}

/* ------------------------------------------------------------- endpoints */

export const api = {
  /* ------------------------------------------------------------ المصادقة */

  authMethods: () =>
    request<{ phone: boolean; smsDelivers: boolean; google: boolean }>(
      "/api/auth/methods",
    ),

  requestOtp: (phone: string) =>
    request<{
      ok: boolean;
      phone: string;
      expiresInSeconds: number;
      delivers: boolean;
    }>("/api/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, code: string, deviceName?: string) =>
    request<{ token: string; expiresAt: string; user: CurrentUser }>(
      "/api/auth/otp/verify",
      {
        method: "POST",
        body: JSON.stringify({ phone, code, deviceName }),
      },
    ),

  signInWithGoogle: (idToken: string, deviceName?: string) =>
    request<{ token: string; expiresAt: string; user: CurrentUser }>(
      "/api/auth/google",
      { method: "POST", body: JSON.stringify({ idToken, deviceName }) },
    ),

  me: () => request<{ user: CurrentUser }>("/api/auth/me"),

  updateProfile: (name: string) =>
    request<{ user: CurrentUser }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  logoutAll: () =>
    request<{ ok: boolean }>("/api/auth/logout-all", { method: "POST" }),

  deleteAccount: () =>
    request<{ ok: boolean }>("/api/auth/me", { method: "DELETE" }),

  registerPushToken: (token: string, platform: string) =>
    request<{ ok: boolean }>("/api/auth/push-token", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    }),

  /* -------------------------------------------------------------- الدردشة */

  conversations: () =>
    request<{ conversations: Conversation[] }>("/api/conversations").then(
      (data) => data.conversations,
    ),

  startConversation: (listingId: string, message?: string) =>
    request<{ conversationId: string }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ listingId, message }),
    }).then((data) => data.conversationId),

  thread: (id: string) =>
    request<{
      conversation: {
        id: string;
        listing: {
          id: string;
          title: string;
          priceIqd: number | null;
          status: string;
        } | null;
        otherId: string;
        otherName: string;
        otherOnline: boolean;
      };
      messages: ChatMessage[];
    }>(`/api/conversations/${id}/messages`),

  sendMessage: (id: string, body: string) =>
    request<{ message: ChatMessage }>(`/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }).then((data) => data.message),

  markRead: (id: string) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/read`, {
      method: "POST",
    }),

  blockUser: (id: string) =>
    request<{ ok: boolean }>(`/api/users/${id}/block`, { method: "POST" }),

  /* ------------------------------------------------------ مفضلة وبلاغات */

  addFavorite: (id: string) =>
    request<{ isFavorite: boolean }>(`/api/listings/${id}/favorite`, {
      method: "POST",
    }),

  removeFavorite: (id: string) =>
    request<{ isFavorite: boolean }>(`/api/listings/${id}/favorite`, {
      method: "DELETE",
    }),

  favorites: () =>
    request<{ listings: (ListingSummary & { isAvailable: boolean })[] }>(
      "/api/me/favorites",
    ).then((data) => data.listings),

  reportReasons: () =>
    request<{ reasons: { value: string; labelAr: string }[] }>(
      "/api/reports/reasons",
    ).then((data) => data.reasons),

  report: (body: {
    targetType: "listing" | "user" | "message";
    targetId: string;
    reason: string;
    note?: string;
  }) =>
    request<{ ok: boolean; alreadyReported: boolean }>("/api/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /* ------------------------------------------------------------- المحتوى */

  categories: () =>
    request<{ categories: Category[] }>("/api/categories").then(
      (data) => data.categories,
    ),

  postableCategories: () =>
    request<{ categories: Category[] }>("/api/categories/postable").then(
      (data) => data.categories,
    ),

  category: (slug: string) =>
    request<{
      category: Category & { isRoot: boolean };
      children: Category["children"];
    }>(`/api/categories/${slug}`),

  categoryFields: (slug: string) =>
    request<{ fields: CategoryField[] }>(
      `/api/categories/${slug}/fields`,
    ).then((data) => data.fields),

  cities: () =>
    request<{ cities: City[] }>("/api/cities").then((data) => data.cities),

  listings: (params: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    return request<{
      listings: ListingSummary[];
      nextCursor: string | null;
      nextOffset: number | null;
    }>(`/api/listings?${query.toString()}`);
  },

  listing: (id: string) =>
    request<{ listing: ListingDetail }>(`/api/listings/${id}`).then(
      (data) => data.listing,
    ),

  revealPhone: (id: string) =>
    request<{ phone: string }>(`/api/listings/${id}/phone`, {
      method: "POST",
    }).then((data) => data.phone),

  myListings: () =>
    request<{ listings: MyListing[] }>("/api/me/listings").then(
      (data) => data.listings,
    ),

  /** يوقّع رابطي رفع لصورة واحدة: الكاملة ومصغّرتها. */
  signUpload: (body: { contentType: string; sizeBytes: number }) =>
    request<{
      full: { key: string; uploadUrl: string };
      thumb: { key: string; uploadUrl: string };
      expiresIn: number;
    }>("/api/uploads/sign", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  uploadLimits: () =>
    request<{
      enabled: boolean;
      maxBytes: number;
      allowedTypes: string[];
      maxImagesPerListing: number;
    }>("/api/uploads/limits"),

  createListing: (body: {
    categorySlug: string;
    citySlug: string;
    title: string;
    description?: string;
    priceIqd?: number | null;
    condition?: "new" | "used" | "imported";
    contactPhone?: string;
    attributes?: Record<string, string>;
    images?: {
      storageKey: string;
      thumbKey?: string;
      width?: number;
      height?: number;
    }[];
  }) =>
    request<{ listing: { id: string; refNo: number } }>("/api/listings", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((data) => data.listing),

  publishListing: (id: string) =>
    request<{ ok: boolean; status: string; message: string }>(
      `/api/listings/${id}/publish`,
      { method: "POST" },
    ),
};
