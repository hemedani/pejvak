import { ensureIndexes } from "./db/indexes.ts";
import { ensureDefaultPlans } from "./entitlements/defaultPlans.ts";
import { ensurePlatformSetting } from "./platform/setting.ts";

export { ensureDefaultPlans } from "./entitlements/defaultPlans.ts";
export {
  DEFAULT_PLATFORM_SETTING,
  ensurePlatformSetting,
  PLATFORM_SETTING_KEY,
  type PlatformSetting,
  readPlatformSetting,
} from "./platform/setting.ts";

/**
 * Runs once before the server starts.
 *
 * Each step is idempotent and insert-only-if-absent, so a restart on a live
 * database never overwrites an operator's decision. The individual
 * implementers live next to the domain they seed, not in this file: the
 * bootstrap order is the only thing that belongs here.
 */
export const bootstrap = async () => {
  await ensureDefaultPlans();
  await ensurePlatformSetting();
  await ensureIndexes();
};
