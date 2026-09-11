import * as jwt from "djwt";

const secretKey = Deno.env.get("TOKEN_KEY") || "pejvak_dev_secret_change_me";
const keyBuf = new TextEncoder().encode(secretKey);

export const jwtTokenKey = await crypto.subtle.importKey(
  "raw",
  keyBuf,
  { name: "HMAC", hash: "SHA-512" },
  true,
  ["sign", "verify"],
);

export const createToken = (payload: Record<string, unknown>) =>
  jwt.create(
    { alg: "HS512", typ: "JWT" },
    { ...payload, exp: jwt.getNumericDate(60 * 60 * 24 * 90) },
    jwtTokenKey,
  );
