import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createDb } from "@souqna/db";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./env.js";
import { HttpError } from "./errors.js";
import { registerAuth } from "./auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerEngagementRoutes } from "./routes/engagement.js";
import { registerCityRoutes } from "./routes/cities.js";
import { registerDashboard } from "./routes/dashboard.js";
import { registerListingRoutes } from "./routes/listings.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import type { AppContext } from "./context.js";

const { db, client } = createDb(env.DATABASE_URL);

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    // لا تسجّل أرقام الهواتف ولا الترويسات التي قد تحمل رموز جلسات
    redact: ["req.headers.authorization", "req.headers['x-user-id']"],
  },
  // العنوان أقصاه ٧٠ حرفاً والوصف أطول؛ ميغابايت واحد يكفي بفارق كبير
  bodyLimit: 1_000_000,
});

const context: AppContext = { db, env };

await app.register(websocket, {
  options: { maxPayload: 64 * 1024 },
});

await app.register(cors, {
  origin: env.NODE_ENV === "production" ? false : true,
});

/**
 * يحوّل أخطاءنا إلى ردّ عربي ثابت الشكل، ويمنع تسرّب أثر المكدّس للعميل.
 */
app.setErrorHandler((error, request, reply) => {
  if (error instanceof HttpError) {
    return reply
      .status(error.statusCode)
      .send({ error: { code: error.code, message: error.message } });
  }

  // Fastify يمرّر الخطأ كـ unknown، فنفحص شكله بدل افتراض نوعه
  if ((error as { validation?: unknown }).validation) {
    return reply.status(400).send({
      error: { code: "validation_failed", message: "البيانات المرسلة غير صالحة" },
    });
  }

  /**
   * أخطاء Zod.
   *
   * نستدعي schema.parse يدوياً في المسارات بدل تمرير المخطط إلى Fastify،
   * فالخطأ لا يحمل حقل validation ولا يلتقطه الفرع أعلاه. بدون هذا الفرع
   * يرد الخادم 500 على كل حقل ناقص، وهو ما يخفي خطأ العميل خلف «خطأ خادم».
   */
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first?.path.join(".");
    return reply.status(400).send({
      error: {
        code: "validation_failed",
        message: field
          ? `تحقق من الحقل: ${field}`
          : "البيانات المرسلة غير صالحة",
        fields: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  request.log.error({ err: error }, "unhandled error");
  return reply.status(500).send({
    error: { code: "internal_error", message: "صار خطأ. حاول مرة ثانية." },
  });
});

app.setNotFoundHandler((_request, reply) =>
  reply
    .status(404)
    .send({ error: { code: "not_found", message: "المسار غير موجود" } }),
);

// يحلّ الجلسة مرة واحدة لكل طلب قبل أي مسار
registerAuth(app, context);

app.get("/health", async () => ({ ok: true, at: new Date().toISOString() }));

// لوحة الإشراف خارج بادئة /api: هي صفحة لا واجهة برمجية
registerDashboard(app, context);

await app.register(
  async (instance) => {
    registerAuthRoutes(instance, context);
    registerCategoryRoutes(instance, context);
    registerCityRoutes(instance, context);
    registerListingRoutes(instance, context);
    registerUploadRoutes(instance, context);
    registerEngagementRoutes(instance, context);
    registerAdminRoutes(instance, context);
    registerChatRoutes(instance, context);
  },
  { prefix: "/api" },
);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "إيقاف الخادم");
  await app.close();
  await client.end();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error({ err: error }, "تعذّر تشغيل الخادم");
  process.exit(1);
}
