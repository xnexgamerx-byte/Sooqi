/**
 * المحافظات العراقية التسع عشرة، ومناطق المدن الثلاث الكبرى.
 *
 * المحافظات الباقية تبقى بمستوى واحد في النسخة الأولى. أضف مناطقها حين
 * يصل إليها نشاط حقيقي، لا قبل — قائمة مناطق فارغة تضرّ التجربة أكثر مما
 * تنفع.
 */

export type SeedCity = {
  slug: string;
  nameAr: string;
  children?: { slug: string; nameAr: string }[];
};

const areas = (pairs: [string, string][]) =>
  pairs.map(([slug, nameAr]) => ({ slug, nameAr }));

export const citySeed: SeedCity[] = [
  {
    slug: "baghdad",
    nameAr: "بغداد",
    children: areas([
      ["karrada", "الكرادة"],
      ["mansour", "المنصور"],
      ["adhamiyah", "الأعظمية"],
      ["kadhimiya", "الكاظمية"],
      ["zayouna", "زيونة"],
      ["jadriya", "الجادرية"],
      ["dora", "الدورة"],
      ["bayaa", "البياع"],
      ["yarmouk", "اليرموك"],
      ["amiriyah", "العامرية"],
      ["ghazaliya", "الغزالية"],
      ["shula", "الشعلة"],
      ["hurriya", "الحرية"],
      ["new-baghdad", "بغداد الجديدة"],
      ["ghadeer", "الغدير"],
      ["shaab", "الشعب"],
      ["jamia", "حي الجامعة"],
      ["sadr-city", "مدينة الصدر"],
      ["abu-ghraib", "أبو غريب"],
      ["taji", "التاجي"],
    ]),
  },
  {
    slug: "basra",
    nameAr: "البصرة",
    children: areas([
      ["ashar", "العشار"],
      ["maqal", "المعقل"],
      ["junaina", "الجنينة"],
      ["zubair", "الزبير"],
      ["abu-alkhaseeb", "أبو الخصيب"],
      ["qurna", "القرنة"],
      ["shatt-alarab", "شط العرب"],
      ["hayyaniyah", "الحيانية"],
    ]),
  },
  {
    slug: "erbil",
    nameAr: "أربيل",
    children: areas([
      ["erbil-center", "مركز أربيل"],
      ["ankawa", "عنكاوا"],
      ["shaqlawa", "شقلاوة"],
      ["koya", "كويسنجق"],
      ["soran", "سوران"],
    ]),
  },
  { slug: "nineveh", nameAr: "نينوى" },
  { slug: "sulaymaniyah", nameAr: "السليمانية" },
  { slug: "duhok", nameAr: "دهوك" },
  { slug: "kirkuk", nameAr: "كركوك" },
  { slug: "anbar", nameAr: "الأنبار" },
  { slug: "babil", nameAr: "بابل" },
  { slug: "karbala", nameAr: "كربلاء" },
  { slug: "najaf", nameAr: "النجف" },
  { slug: "dhi-qar", nameAr: "ذي قار" },
  { slug: "diyala", nameAr: "ديالى" },
  { slug: "wasit", nameAr: "واسط" },
  { slug: "maysan", nameAr: "ميسان" },
  { slug: "muthanna", nameAr: "المثنى" },
  { slug: "qadisiyah", nameAr: "القادسية" },
  { slug: "salahuddin", nameAr: "صلاح الدين" },
  { slug: "halabja", nameAr: "حلبجة" },
];
