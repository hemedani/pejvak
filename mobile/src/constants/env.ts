import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_LESAN_URL: z.string().url().default("http://localhost:1405/lesan"),
  EXPO_PUBLIC_APP_ENV: z.enum(["development", "production"]).default("development"),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_LESAN_URL: process.env.EXPO_PUBLIC_LESAN_URL,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = Object.freeze({
  lesanUrl: parsed.data.EXPO_PUBLIC_LESAN_URL,
  appEnv: parsed.data.EXPO_PUBLIC_APP_ENV,
  isDev: parsed.data.EXPO_PUBLIC_APP_ENV !== "production",
});
