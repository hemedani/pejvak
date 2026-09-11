import type { Infer, LesanContenxt, ObjectId } from "lesan";
import { object } from "lesan";
import { user_pure } from "../models/user.ts";

const userPureObj = object(user_pure);
export type UserPure = Infer<typeof userPureObj>;

export interface MyContext extends LesanContenxt {
  user: { _id: ObjectId } & Partial<UserPure>;
}
