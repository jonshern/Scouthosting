"use client";

import { useActionState, useState } from "react";
import { upsertMember, type MemberState } from "@/server-actions/members";

export function MemberForm({
  orgSlug,
  initial,
  csrf,
  availableAdults = [],
}: {
  orgSlug: string;
  initial?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    isYouth?: boolean;
    patrol?: string | null;
    position?: string | null;
    commPreference?: string;
    status?: string;
    shirtSize?: string | null;
    dietaryFlags?: string[] | null;
    parentIds?: string[];
  };
  /** Adults already on the roster — picker source for parent linking. */
  availableAdults?: { id: string; name: string; email: string | null; childCount: number }[];
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<MemberState, FormData>(upsertMember, null);
  const m = initial ?? {};
  const [linkedIds, setLinkedIds] = useState<string[]>(m.parentIds ?? []);
  const [picker, setPicker] = useState("");
  const filteredAdults = availableAdults.filter((a) => {
    if (!picker.trim()) return true;
    const q = picker.toLowerCase();
    return a.name.toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q);
  });
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {m.id && <input type="hidden" name="id" value={m.id} />}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" required maxLength={80} defaultValue={m.firstName ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" required maxLength={80} defaultValue={m.lastName ?? ""} className="field" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" maxLength={320} defaultValue={m.email ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" maxLength={40} defaultValue={m.phone ?? ""} className="field" />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="label">Address (encrypted at rest)</legend>
        <div>
          <label className="label" htmlFor="street">Street</label>
          <input id="street" name="street" maxLength={200} defaultValue={m.street ?? ""} className="field" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="city">City</label>
            <input id="city" name="city" maxLength={100} defaultValue={m.city ?? ""} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="state">State</label>
            <input id="state" name="state" maxLength={60} defaultValue={m.state ?? ""} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="zip">ZIP</label>
            <input id="zip" name="zip" maxLength={20} defaultValue={m.zip ?? ""} className="field" />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-end gap-2">
          <input id="isYouth" name="isYouth" type="checkbox" defaultChecked={m.isYouth ?? true} />
          <label htmlFor="isYouth">Youth (under 18)</label>
        </div>
        <div>
          <label className="label" htmlFor="patrol">Patrol / den</label>
          <input id="patrol" name="patrol" maxLength={50} defaultValue={m.patrol ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="position">Position</label>
          <input id="position" name="position" maxLength={80} defaultValue={m.position ?? ""} className="field" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="shirtSize">Shirt size</label>
          <input
            id="shirtSize"
            name="shirtSize"
            maxLength={20}
            defaultValue={m.shirtSize ?? ""}
            placeholder="YM, AL, AXL…"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="dietaryFlags">Allergies / dietary (comma-separated)</label>
          <input
            id="dietaryFlags"
            name="dietaryFlags"
            maxLength={400}
            defaultValue={(m.dietaryFlags ?? []).join(", ")}
            placeholder="peanut, vegetarian, gluten-free"
            className="field"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="commPreference">Communication preference</label>
          <select id="commPreference" name="commPreference" defaultValue={m.commPreference ?? "email"} className="field">
            <option value="email">Email only</option>
            <option value="sms">SMS only</option>
            <option value="both">Both</option>
            <option value="none">Do not contact</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={m.status ?? "active"} className="field">
            <option value="prospect">Prospect (lead)</option>
            <option value="active">Active</option>
            <option value="alumni">Alumni</option>
          </select>
        </div>
      </div>

      {/* Parent / guardian picker — link existing adult Member rows
          so siblings share the same record (per design_handoff_compass_cms
          §9, the most product-distinctive interaction). */}
      {availableAdults.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="label">Parents / guardians</legend>
          <input type="hidden" name="parentIds" value={linkedIds.join(",")} />
          <input
            type="search"
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            placeholder="Search adults by name or email…"
            className="field"
          />
          <div className="max-h-56 overflow-auto rounded-md border border-line">
            {filteredAdults.length === 0 ? (
              <p className="p-3 text-xs text-slate-muted">
                No adults match your search.
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {filteredAdults.map((a) => {
                  const linked = linkedIds.includes(a.id);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={linked}
                          onChange={(e) => {
                            setLinkedIds((cur) =>
                              e.target.checked
                                ? [...cur, a.id]
                                : cur.filter((id) => id !== a.id),
                            );
                          }}
                        />
                        <span className="font-medium text-ink">{a.name}</span>
                        {a.email ? (
                          <span className="text-xs text-slate-muted">{a.email}</span>
                        ) : null}
                      </label>
                      {a.childCount > 0 ? (
                        <span className="text-xs text-slate-muted">
                          parent of {a.childCount}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {linkedIds.length > 0 ? (
            <p className="text-xs text-slate-muted">
              {linkedIds.length} parent{linkedIds.length === 1 ? "" : "s"} linked from
              the existing roster — no duplicates.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {state?.error && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">{state.error}</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : m.id ? "Save changes" : "Add member"}
      </button>
    </form>
  );
}
