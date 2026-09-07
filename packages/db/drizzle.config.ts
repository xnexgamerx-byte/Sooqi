import { defineConfig } from "drizzle-kit";
import { loadRootEnv } from "./src/env-file.js";

loadRootEnv();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL غير معرّف. انسخ .env.example إلى .env");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
});
