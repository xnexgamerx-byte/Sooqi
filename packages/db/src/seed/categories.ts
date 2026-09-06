/**
 * شجرة الأقسام وحقولها الديناميكية.
 *
 * حقل `slug` هو نفسه المفتاح في assets/category-assets.json، فصور Figma
 * تُربط آلياً حين تُصدَّر إلى assets/categories/<slug>@3x.png.
 *
 * النسخة الأولى تُطلق بقسمين مفعّلين فقط: السيارات والموبايلات. الباقي
 * موجود في القاعدة ويظهر في الشبكة بحالة «قريباً». راجع القسم الأول من
 * docs/plan.html.
 */

export type SeedFieldType = "text" | "number" | "select" | "boolean";

export type SeedFieldOption = { value: string; labelAr: string };

export type SeedField = {
  key: string;
  labelAr: string;
  type: SeedFieldType;
  options?: SeedFieldOption[];
  unitAr?: string;
  isRequired?: boolean;
  isFilterable?: boolean;
};

export type SeedCategory = {
  slug: string;
  nameAr: string;
  /** اسم ملف الأيقونة بدون اللاحقة. يُترك فارغاً للأقسام الفرعية. */
  iconAsset?: string;
  isActive?: boolean;
  fields?: SeedField[];
  children?: SeedCategory[];
};

/** يبني خيارات select من أزواج قيمة لاتينية ونص عربي. */
const opts = (pairs: [string, string][]): SeedFieldOption[] =>
  pairs.map(([value, labelAr]) => ({ value, labelAr }));

const CAR_BRANDS = opts([
  ["toyota", "تويوتا"],
  ["kia", "كيا"],
  ["hyundai", "هيونداي"],
  ["chevrolet", "شيفروليه"],
  ["nissan", "نيسان"],
  ["dodge", "دودج"],
  ["ford", "فورد"],
  ["mercedes", "مرسيدس"],
  ["bmw", "بي إم دبليو"],
  ["honda", "هوندا"],
  ["lexus", "لكزس"],
  ["genesis", "جينيسيس"],
  ["gmc", "جي إم سي"],
  ["mitsubishi", "ميتسوبيشي"],
  ["changan", "شانجان"],
  ["geely", "جيلي"],
  ["haval", "هافال"],
  ["peugeot", "بيجو"],
  ["renault", "رينو"],
  ["opel", "أوبل"],
  ["skoda", "سكودا"],
  ["volkswagen", "فولكس واجن"],
  ["other", "أخرى"],
]);

const PHONE_BRANDS = opts([
  ["apple", "آيفون"],
  ["samsung", "سامسونج"],
  ["xiaomi", "شاومي"],
  ["oppo", "أوبو"],
  ["realme", "ريلمي"],
  ["vivo", "فيفو"],
  ["huawei", "هواوي"],
  ["honor", "هونر"],
  ["infinix", "انفينكس"],
  ["tecno", "تكنو"],
  ["oneplus", "ون بلس"],
  ["nokia", "نوكيا"],
  ["other", "أخرى"],
]);

const COLORS = opts([
  ["white", "أبيض"],
  ["black", "أسود"],
  ["silver", "فضي"],
  ["grey", "رمادي"],
  ["red", "أحمر"],
  ["blue", "أزرق"],
  ["green", "أخضر"],
  ["gold", "ذهبي"],
  ["brown", "بني"],
  ["other", "أخرى"],
]);

const CAR_FIELDS: SeedField[] = [
  {
    key: "brand",
    labelAr: "الماركة",
    type: "select",
    options: CAR_BRANDS,
    isRequired: true,
  },
  { key: "model", labelAr: "الموديل", type: "text", isRequired: true },
  {
    key: "year",
    labelAr: "سنة الصنع",
    type: "number",
    isRequired: true,
  },
  {
    key: "mileage",
    labelAr: "المسافة المقطوعة",
    type: "number",
    unitAr: "كم",
  },
  {
    key: "transmission",
    labelAr: "ناقل الحركة",
    type: "select",
    options: opts([
      ["automatic", "أوتوماتيك"],
      ["manual", "عادي"],
    ]),
  },
  {
    key: "fuel",
    labelAr: "الوقود",
    type: "select",
    options: opts([
      ["petrol", "بنزين"],
      ["diesel", "ديزل"],
      ["hybrid", "هجين"],
      ["electric", "كهرباء"],
      ["lpg", "غاز"],
    ]),
  },
  {
    key: "body",
    labelAr: "نوع الهيكل",
    type: "select",
    options: opts([
      ["sedan", "صالون"],
      ["suv", "دفع رباعي"],
      ["hatchback", "هاتشباك"],
      ["pickup", "بيك أب"],
      ["coupe", "كوبيه"],
      ["van", "فان"],
    ]),
  },
  { key: "color", labelAr: "اللون", type: "select", options: COLORS },
  {
    key: "plate",
    labelAr: "نوع اللوحة",
    type: "select",
    options: opts([
      ["baghdad", "بغداد"],
      ["provincial", "محافظات"],
      ["kurdistan", "كردستان"],
      ["temporary", "مؤقتة"],
    ]),
  },
];

const PHONE_FIELDS: SeedField[] = [
  {
    key: "brand",
    labelAr: "الماركة",
    type: "select",
    options: PHONE_BRANDS,
    isRequired: true,
  },
  { key: "model", labelAr: "الموديل", type: "text", isRequired: true },
  {
    key: "storage",
    labelAr: "السعة",
    type: "select",
    options: opts([
      ["32", "٣٢ غيغا"],
      ["64", "٦٤ غيغا"],
      ["128", "١٢٨ غيغا"],
      ["256", "٢٥٦ غيغا"],
      ["512", "٥١٢ غيغا"],
      ["1024", "١ تيرا"],
    ]),
  },
  {
    key: "warranty",
    labelAr: "الكفالة",
    type: "select",
    options: opts([
      ["yes", "بكفالة"],
      ["no", "بدون كفالة"],
    ]),
  },
  { key: "color", labelAr: "اللون", type: "select", options: COLORS },
];

const PROPERTY_FIELDS: SeedField[] = [
  {
    key: "area",
    labelAr: "المساحة",
    type: "number",
    unitAr: "م٢",
    isRequired: true,
  },
  { key: "rooms", labelAr: "عدد الغرف", type: "number" },
  { key: "bathrooms", labelAr: "عدد الحمامات", type: "number" },
  { key: "floor", labelAr: "الطابق", type: "number" },
  {
    key: "furnished",
    labelAr: "مفروش",
    type: "boolean",
  },
];

/**
 * الترتيب هنا هو ترتيب الظهور في شبكة الأقسام على الشاشة الأولى.
 */
export const categorySeed: SeedCategory[] = [
  { slug: "stores", nameAr: "المتاجر", iconAsset: "stores" },
  {
    slug: "cars",
    nameAr: "سيارات ومركبات",
    iconAsset: "cars",
    isActive: true,
    fields: CAR_FIELDS,
    children: [
      { slug: "cars-for-sale", nameAr: "سيارات للبيع", isActive: true },
      { slug: "cars-for-rent", nameAr: "سيارات للإيجار", isActive: true },
      { slug: "trucks", nameAr: "شاحنات ومعدات ثقيلة", isActive: true },
      { slug: "car-parts", nameAr: "قطع غيار", isActive: true },
      { slug: "car-accessories", nameAr: "إكسسوارات السيارات", isActive: true },
    ],
  },
  { slug: "motorcycles", nameAr: "دراجات نارية", iconAsset: "motorcycles" },
  {
    slug: "real-estate-sale",
    nameAr: "عقارات للبيع",
    iconAsset: "real-estate-sale",
    fields: PROPERTY_FIELDS,
  },
  {
    slug: "real-estate-rent",
    nameAr: "عقارات للإيجار",
    iconAsset: "real-estate-rent",
    fields: PROPERTY_FIELDS,
  },
  { slug: "jobs", nameAr: "وظائف شاغرة", iconAsset: "jobs" },
  { slug: "services", nameAr: "الخدمات", iconAsset: "services" },
  {
    slug: "mobiles-tablets",
    nameAr: "موبايل و تابلت",
    iconAsset: "mobiles-tablets",
    isActive: true,
    fields: PHONE_FIELDS,
    children: [
      { slug: "mobiles", nameAr: "موبايلات", isActive: true },
      { slug: "tablets", nameAr: "تابلت", isActive: true },
      {
        slug: "mobile-accessories",
        nameAr: "إكسسوارات الموبايل",
        isActive: true,
      },
      { slug: "special-numbers", nameAr: "أرقام مميزة", isActive: true },
    ],
  },
  { slug: "laptops", nameAr: "لابتوب وكمبيوتر", iconAsset: "laptops" },
  { slug: "games", nameAr: "ألعاب وألعاب الفيديو", iconAsset: "games" },
  {
    slug: "sports-fitness",
    nameAr: "معدات رياضية ولياقة",
    iconAsset: "sports-fitness",
  },
  { slug: "electronics", nameAr: "الكترونيات", iconAsset: "electronics" },
  { slug: "appliances", nameAr: "أجهزة منزلية", iconAsset: "appliances" },
  { slug: "home-garden", nameAr: "منزل وحديقة", iconAsset: "home-garden" },
  { slug: "fashion-kids", nameAr: "موضة وأطفال", iconAsset: "fashion-kids" },
  { slug: "pets", nameAr: "حيوانات وإكسسوارات", iconAsset: "pets" },
  {
    slug: "business-equipment",
    nameAr: "تجهيزات ومعدات الشركات",
    iconAsset: "business-equipment",
  },
  { slug: "beauty-health", nameAr: "جمال وصحة", iconAsset: "beauty-health" },
  { slug: "food", nameAr: "طعام وغذاء", iconAsset: "food" },
  {
    slug: "entertainment-books",
    nameAr: "ترفيه وكتب ومقتنيات",
    iconAsset: "entertainment-books",
  },
  { slug: "education", nameAr: "تدريس وتدريب", iconAsset: "education" },
  { slug: "job-seekers", nameAr: "باحثين عن عمل", iconAsset: "job-seekers" },
];
