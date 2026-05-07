"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  INVITE_COOKIE,
  INVITE_TTL_SECONDS,
  consumeInviteCode,
  makeInviteCookie,
} from "@/lib/invite";

export type InviteState = { error?: string; ok?: true } | null;

export async function submitInviteCode(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const code = String(formData.get("code") ?? "");
  const result = await consumeInviteCode(code);
  if (!result.ok) return { error: result.reason };
  const value = await makeInviteCookie(result.codeId);
  const jar = await cookies();
  jar.set(INVITE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_TTL_SECONDS,
  });
  redirect("/");
}
