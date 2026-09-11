import { getMeSetup } from "./getMe/mod.ts";
import { loginSetup } from "./login/mod.ts";
import { registerSetup } from "./register/mod.ts";

export const authSetup = () => {
  registerSetup();
  loginSetup();
  getMeSetup();
};
