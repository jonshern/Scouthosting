// DELETE /api/v1/me — delete the signed-in account from a phone app.
// Body { confirm: "<your email>" }, the same check as /account/delete.
// What's removed and what the unit keeps: src/lib/account/delete.ts.
//
//   409 account_deletion_blocked { blockers: [{ kind, orgName?, message }] }
//   403 demo_locked, 400 confirm_mismatch

import { z } from "zod";
import { ApiError, LIMITS, badRequest, json, readJson, v1Route } from "@/lib/api/v1";
import { AccountDeletionBlocked, blockerMessage, deleteAccount } from "@/lib/account/delete";
import { isDemoMode } from "@/lib/demo/mode";

export const runtime = "nodejs";

const Body = z.object({ confirm: z.string().trim().max(320) });

export const DELETE = v1Route(
  async (req, { user }) => {
    if (isDemoMode()) throw new ApiError(403, "demo_locked");
    const { confirm } = await readJson(req, Body);
    if (confirm.toLowerCase() !== user.email.toLowerCase()) throw badRequest("confirm_mismatch");
    try {
      await deleteAccount(user.id);
    } catch (e) {
      if (!(e instanceof AccountDeletionBlocked)) throw e;
      throw new ApiError(409, "account_deletion_blocked", {
        blockers: e.blockers.map((b) => ({
          kind: b.kind,
          orgName: b.kind === "only_admin" ? b.orgName : undefined,
          message: blockerMessage(b),
        })),
      });
    }
    return json({ ok: true });
  },
  { limits: [LIMITS.accountDelete] },
);
