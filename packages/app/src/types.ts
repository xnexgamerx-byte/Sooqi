/** أنواع ردود الخادم. تطابق ما ترجعه packages/server/src/routes. */

export type Category = {
  id: number;
  slug: string;
  nameAr: string;
  iconAsset: string | null;
  isActive: boolean;
  children?: { id: number; slug: string; nameAr: string; isActive: boolean }[];
};

export type City = {
  id: number;
  slug: string;
  nameAr: string;
  areas: { id: number; slug: string; nameAr: string }[];
};

export type CategoryField = {
  key: string;
  labelAr: string;
  type: "text" | "number" | "select" | "boolean";
  options: { value: string; labelAr: string }[];
  unitAr: string | null;
  isRequired: boolean;
  isFilterable: boolean;
};

export type ListingSummary = {
  id: string;
  refNo: number;
  title: string;
  priceIqd: number | null;
  condition: string | null;
  categorySlug: string;
  categoryNameAr: string;
  cityNameAr: string;
  coverImage: string | null;
};

export type MyListing = {
  id: string;
  refNo: number;
  title: string;
  priceIqd: number | null;
  status: string;
  viewCount: number;
  chatCount: number;
  createdAt: string;
  categoryNameAr: string;
  coverImage: string | null;
};

export type ListingDetail = {
  id: string;
  refNo: number;
  title: string;
  description: string | null;
  priceIqd: number | null;
  condition: string | null;
  viewCount: number;
  publishedAt: string | null;
  categorySlug: string;
  categoryNameAr: string;
  cityNameAr: string;
  images: {
    url: string | null;
    storageKey: string;
    width: number | null;
    height: number | null;
  }[];
  attributes: { key: string; labelAr: string; unitAr: string | null; valueAr: string | null }[];
  seller: {
    id: string;
    name: string;
    publicId: string;
    isVerified: boolean;
    memberSince: string;
  };
};
