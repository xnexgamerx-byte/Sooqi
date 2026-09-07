import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * يحمّل ملف .env من جذر المستودع.
 *
 * `import "dotenv/config"` وحده يقرأ من مجلّد التشغيل، وpnpm يشغّل كل حزمة
 * داخل مجلّدها. فمن يتبع README ويضع .env في الجذر ثم ينفّذ `pnpm db:push`
 * يفشل: العملية تنطلق من packages/db ولا ترى الملف. نصعد حتى نلقى الجذر.
 *
 * لا نستبدل ما هو معرّف في البيئة أصلاً: على الخادم الحقيقي الإعدادات
 * تأتي من مزوّد الاستضافة لا من ملف.
 */
export function loadRootEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth += 1) {
    // pnpm-workspace.yaml يعلّم الجذر، فلا نلتقط .env حزمة في الطريق
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      config({ path: join(dir, ".env"), override: false, quiet: true });
      return;
    }

    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
