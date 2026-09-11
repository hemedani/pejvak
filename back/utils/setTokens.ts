import * as jwt from "djwt";
import { coreApp } from "../mod.ts";
import { throwError } from "./throwError.ts";
import { jwtTokenKey } from "./token.ts";

export const setTokens = async () => {
  const { Headers } = coreApp.contextFns.getContextModel();
  const token = Headers.get("token");

  if (!token) {
    throwError("you should send your token with the `token` header key");
  }

  try {
    const verifiedToken = await jwt.verify(token!, jwtTokenKey);
    coreApp.contextFns.setContext({ user: verifiedToken });
  } catch (_e) {
    throwError("Invalid or expired token");
  }
};
