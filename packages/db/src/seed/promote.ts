import { loadRootEnv } from "../env-file.js";
import { eq, or } from "drizzle-orm";
import { createDb } from "../index.js";
import { users } from "../schema.js";

loadRootEnv();

/**
 * يمنح حساباً دور مشرف أو مدير.
 *
 * لا شاشة لهذا في اللوحة عمداً: من يستطيع صناعة مشرفين من داخل اللوحة
 * يستطيع صناعتهم بحساب مشرف مسروق. الترقية تبقى عند من يملك القاعدة.
 *
 *   pnpm --filter @souqna/db promote 07701234567 moderator
 */

const [rawIdentifier, rawRole = "moderator"] = process.argv.slice(2);

if (!rawIdentifier) {
  console.error("الاستعمال: promote <هاتف أو بريد> [moderator|admin|user]");
  process.exit(1);
}

if (rawRole !== "moderator" && rawRole !== "admin" && rawRole !== "user") {
  console.error("الدور لازم يكون moderator أو admin أو user");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL مطلوب");
  process.exit(1);
}

/** نفس توحيد الأرقام في الخادم، وإلا لم يطابق 07701234567 ما في القاعدة. */
function normalizePhone(input: string): string | null {
  const latin = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  let digits = latin.replace(/[^0-9]/g, "");
  if (digits.startsWith("00964")) digits = digits.slice(5);
  else if (digits.startsWith("964")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^7\d{9}$/.test(digits)) return null;
  return `+964${digits}`;
}

const { db, client } = createDb(url);

const phone = normalizePhone(rawIdentifier);
const email = rawIdentifier.includes("@") ? rawIdentifier.trim() : null;

if (!phone && !email) {
  console.error("ما فهمت المعرّف. اكتب رقم هاتف عراقي أو بريداً.");
  await client.end();
  process.exit(1);
}

const updated = await db
  .update(users)
  .set({ role: rawRole, updatedAt: new Date() })
  .where(
    phone && email
      ? or(eq(users.phone, phone), eq(users.email, email))
      : phone
        ? eq(users.phone, phone)
        : eq(users.email, email as string),
  )
  .returning({ name: users.name, publicId: users.publicId });

if (updated.length === 0) {
  // الحساب يُنشأ عند أول تسجيل دخول، فلا نصنعه هنا بدور مشرف جاهز
  console.error(
    "ما لكيت الحساب. خلّه يسجّل دخول بالتطبيق مرة أولاً، بعدها رقّيه.",
  );
  await client.end();
  process.exit(1);
}

for (const row of updated) {
  console.log(`صار ${rawRole}: ${row.name} (#${row.publicId})`);
}

await client.end();
