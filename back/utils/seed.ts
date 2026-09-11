import { hash } from "@da/bcrypt";
import { user } from "../mod.ts";

const email = "demo@pejvak.app";
const password = "password123";

const existing = await user.findOne({ filters: { email } });

if (existing) {
  console.log(`Demo user already exists: ${email}`);
} else {
  await user.insertOne({
    doc: {
      username: "demo",
      email,
      password: await hash(password),
      displayName: "Demo Listener",
    },
  });
  console.log(`Seeded demo user: ${email} / ${password}`);
}

Deno.exit(0);
