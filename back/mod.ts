import { lesan, MongoClient } from "lesan";
import {
  annotations,
  playbackSessions,
  playlists,
  tracks,
  users,
} from "@model";
import { functionsSetup } from "./src/mod.ts";

const MONGO_URI = Deno.env.get("MONGO_URI") || "mongodb://127.0.0.1:27017/";
const DB_NAME = Deno.env.get("DB_NAME") || "pejvak";
const APP_PORT = Deno.env.get("APP_PORT") || 1405;
const ENV = Deno.env.get("ENV") || "development";

export const coreApp = lesan();
const client = await new MongoClient(MONGO_URI).connect();
const db = client.db(DB_NAME);
coreApp.odm.setDb(db);

export const user = users();
export const track = tracks();
export const playbackSession = playbackSessions();
export const annotation = annotations();
export const playlist = playlists();

export const { setAct } = coreApp.acts;
export const { selectStruct, getSchemas } = coreApp.schemas;

functionsSetup();

if (import.meta.main) {
  coreApp.runServer({
    port: Number(APP_PORT),
    typeGeneration: true,
    playground: ENV === "development",
    cors: ["http://localhost:3000", "http://localhost:8081"],
  });
}
