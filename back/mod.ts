import { lesan, MongoClient } from "lesan";
import {
  adminAuditLogs,
  aiUsages,
  annotations,
  billingTransactions,
  onlineCollections,
  plans,
  platformSettings,
  playbackContexts,
  playbackSessions,
  playlists,
  subscriptions,
  tracks,
  users,
} from "@model";
import { functionsSetup } from "./src/mod.ts";
import { bootstrap } from "./src/bootstrap.ts";

const MONGO_URI = Deno.env.get("MONGO_URI") || "mongodb://127.0.0.1:27017/";
const DB_NAME = Deno.env.get("DB_NAME") || "pejvak";
const APP_PORT = Deno.env.get("APP_PORT") || 1405;
const ENV = Deno.env.get("ENV") || "development";

export const coreApp = lesan();
const client = await new MongoClient(MONGO_URI, { ignoreUndefined: true })
  .connect();
const db = client.db(DB_NAME);
coreApp.odm.setDb(db);

export const user = users();
export const track = tracks();
export const playbackSession = playbackSessions();
export const annotation = annotations();
export const playlist = playlists();
export const playbackContext = playbackContexts();
export const onlineCollection = onlineCollections();
export const plan = plans();
export const subscription = subscriptions();
export const billingTransaction = billingTransactions();
export const aiUsage = aiUsages();
export const adminAuditLog = adminAuditLogs();
export const platformSetting = platformSettings();

export const { setAct } = coreApp.acts;
export const { selectStruct, getSchemas } = coreApp.schemas;

functionsSetup();

if (import.meta.main) {
  // Idempotent and never destructive: seeds the two default plans, the
  // singleton platform row, and the indexes the admin analytics need. Runs
  // before the server accepts traffic so a fresh database answers a plan or
  // entitlement read with the free tier instead of an empty result.
  await bootstrap();

  coreApp.runServer({
    port: Number(APP_PORT),
    typeGeneration: true,
    playground: ENV === "development",
    cors: ["http://localhost:3000", "http://localhost:8081"],
  });
}
