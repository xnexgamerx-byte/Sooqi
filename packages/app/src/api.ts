import type {
  Category,
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

/**
 * معرّف المستخدم في وضع التطوير. يُرسَل في ترويسة x-user-id ويقبله الخادم
 * فقط حين DEV_AUTH=1. يُستبدل بتسجيل الدخول الحقيقي لاحقاً.
 */
let devUserId: string | null = null;

export function setDevUserId(id: string | null) {
  devUserId = id;
}

export function getDevUserId() {
  return devUserId;
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
  if (devUserId) headers["x-user-id"] = devUserId;

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
