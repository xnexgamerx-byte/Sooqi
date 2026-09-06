/**
 * رموز التصميم. مأخوذة حرفياً من docs/screens.html — أي تغيير هنا يجب أن
 * ينعكس هناك أيضاً حتى يبقى التصميم والتنفيذ متطابقين.
 */
export const colors = {
  bg: "#EFEFF4",
  surface: "#FFFFFF",
  surface2: "#F6F7F9",
  ink: "#15171C",
  ink2: "#5A6270",
  muted: "#8E939E",
  line: "#E7E8ED",
  blue: "#0B5FD9",
  blueDark: "#0A4CAE",
  blueSoft: "#E7F0FE",
  orange: "#F79E1B",
  orangeDark: "#E1870A",
  dark: "#15161A",
  red: "#E5352B",
  green: "#0FBF6A",
  white: "#FFFFFF",
} as const;

export const radius = {
  sm: 8,
  md: 11,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const text = {
  title: { fontSize: 19, fontWeight: "600" },
  heading: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 14.5 },
  small: { fontSize: 12.5 },
  tiny: { fontSize: 11 },
} as const;

/** ظل خفيف موحّد للبطاقات. */
export const cardShadow = {
  shadowColor: "#141A20",
  shadowOpacity: 0.06,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;
