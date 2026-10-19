"use client";

import { useActionState, useState } from "react";
import {
  addEventStaff,
  announceEvent,
  createEventChannelAction,
  removeEventStaff,
  updateEventStaff,
  type EventStaffState,
} from "@/server-actions/event-staff";

type Opt = { id: string; title: string };

const ROLES = [
  { value: "counselor", label: "Counselor" },
  { value: "staff", label: "Staff" },
  { value: "volunteer", label: "Volunteer" },
  { value: "lead", label: "Event lead" },
];
const STATUSES = ["invited", "yes", "maybe", "no"];

const STATUS_CHIP: Record<string, string> = {
  yes: "border-accent text-accent bg-accent-soft",
  maybe: "",
  no: "text-danger",
  invited: "",
};

function Result({ state }: { state: EventStaffState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="text-sm text-slate-soft">{state.message}</p>;
  return null;
}

function Hidden({ orgSlug, eventId }: { orgSlug: string; eventId: string }) {
  return (
    <>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventId" value={eventId} />
    </>
  );
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`pill ${STATUS_CHIP[status] ?? ""}`}>{status}</span>;
}

export function AddStaffForm({
  orgSlug,
  eventId,
  stations,
  counselors,
  csrf,
}: {
  orgSlug: string;
  eventId: string;
  stations: Opt[];
  counselors: { id: string; name: string; email: string | null }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<EventStaffState, FormData>(addEventStaff, null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [counselorId, setCounselorId] = useState("");
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <Hidden orgSlug={orgSlug} eventId={eventId} />
      <div className="grid gap-3 md:grid-cols-2">
        {counselors.length > 0 && (
          <div className="md:col-span-2">
            <label className="label" htmlFor="counselorId">From the counselor directory (optional)</label>
            <select
              id="counselorId"
              name="counselorId"
              className="field"
              value={counselorId}
              onChange={(e) => {
                setCounselorId(e.target.value);
                const c = counselors.find((x) => x.id === e.target.value);
                if (c) {
                  setName(c.name);
                  setEmail(c.email ?? "");
                }
              }}
            >
              <option value="">— none —</option>
              {counselors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="staff-name">Name</label>
          <input id="staff-name" name="name" required maxLength={120} className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="staff-email">Email</label>
          <input id="staff-email" name="email" type="email" required maxLength={320} className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="staff-phone">Phone (optional)</label>
          <input id="staff-phone" name="phone" maxLength={40} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="staff-role">Role</label>
          <select id="staff-role" name="role" defaultValue="counselor" className="field">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="staff-slot">Station (optional)</label>
          <select id="staff-slot" name="slotId" defaultValue="" className="field">
            <option value="">— none —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending invite…" : "Add and send invite"}
      </button>
    </form>
  );
}

export function StaffRow({
  orgSlug,
  eventId,
  staff,
  stations,
  csrf,
}: {
  orgSlug: string;
  eventId: string;
  staff: { id: string; name: string; email: string; role: string; status: string; slotId: string | null; notes: string | null };
  stations: Opt[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<EventStaffState, FormData>(updateEventStaff, null);
  const [rmState, rmAction, rmPending] = useActionState<EventStaffState, FormData>(removeEventStaff, null);
  const [confirming, setConfirming] = useState(false);
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 pr-3">
        <div>{staff.name}</div>
        <div className="text-xs text-slate-muted">{staff.email}</div>
        {staff.notes ? <div className="text-xs text-slate-soft mt-1">“{staff.notes}”</div> : null}
      </td>
      <td className="py-2 pr-3"><StatusChip status={staff.status} /></td>
      <td className="py-2" colSpan={2}>
        <form action={action} className="flex flex-wrap items-center gap-2">
          {csrf}
          <Hidden orgSlug={orgSlug} eventId={eventId} />
          <input type="hidden" name="staffId" value={staff.id} />
          <select name="role" defaultValue={staff.role} className="field w-auto" aria-label="Role">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <select name="slotId" defaultValue={staff.slotId ?? ""} className="field w-auto" aria-label="Station">
            <option value="">No station</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <select name="status" defaultValue={staff.status} className="field w-auto" aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="submit" disabled={pending} className="btn-ghost">
            {pending ? "…" : "Save"}
          </button>
        </form>
        <form action={rmAction} className="mt-1 flex items-center gap-2">
          {csrf}
          <Hidden orgSlug={orgSlug} eventId={eventId} />
          <input type="hidden" name="staffId" value={staff.id} />
          {confirming ? (
            <>
              <span className="text-xs text-slate-soft">Remove {staff.name}?</span>
              <button type="submit" disabled={rmPending} className="text-xs text-danger underline">
                {rmPending ? "…" : "Yes, remove"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-xs text-slate-muted">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="text-xs text-danger hover:text-ink">
              Remove
            </button>
          )}
        </form>
        <Result state={state} />
        <Result state={rmState} />
      </td>
    </tr>
  );
}

export function CreateChannelForm({
  orgSlug,
  eventId,
  stations,
  csrf,
}: {
  orgSlug: string;
  eventId: string;
  stations: Opt[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<EventStaffState, FormData>(createEventChannelAction, null);
  const [audience, setAudience] = useState("staff");
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <Hidden orgSlug={orgSlug} eventId={eventId} />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="channel-audience">Chat channel for</label>
          <select id="channel-audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className="field">
            <option value="staff">All staff (yes / maybe)</option>
            <option value="station" disabled={stations.length === 0}>One station&apos;s staff</option>
            <option value="families">Families (RSVPs and sign-ups)</option>
          </select>
        </div>
        {audience === "station" && (
          <div>
            <label className="label" htmlFor="channel-slot">Station</label>
            <select id="channel-slot" name="slotId" required className="field">
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-muted">
        Leaders are always in. Staff channels never include youth. Members stay in sync as people answer.
      </p>
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Creating…" : "Create channel"}
      </button>
    </form>
  );
}

export function AnnounceForm({
  orgSlug,
  eventId,
  stations,
  csrf,
}: {
  orgSlug: string;
  eventId: string;
  stations: Opt[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<EventStaffState, FormData>(announceEvent, null);
  const [scope, setScope] = useState("staff");
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <Hidden orgSlug={orgSlug} eventId={eventId} />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="announce-scope">Email</label>
          <select id="announce-scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value)} className="field">
            <option value="staff">All staff (yes / maybe)</option>
            <option value="station" disabled={stations.length === 0}>One station&apos;s staff</option>
            <option value="families">Families (parents and guardians)</option>
          </select>
        </div>
        {scope === "station" && (
          <div>
            <label className="label" htmlFor="announce-slot">Station</label>
            <select id="announce-slot" name="slotId" required className="field">
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
        )}
        {scope !== "families" && (
          <div className="flex items-center gap-2 md:col-span-2">
            <input id="announce-unanswered" name="includeUnanswered" type="checkbox" />
            <label htmlFor="announce-unanswered" className="text-sm">
              Also email staff who haven&apos;t answered yet (good for setup reminders)
            </label>
          </div>
        )}
        <div className="md:col-span-2">
          <label className="label" htmlFor="announce-subject">Subject</label>
          <input id="announce-subject" name="subject" required maxLength={200} className="field" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="announce-body">Message</label>
          <textarea id="announce-body" name="body" required rows={5} maxLength={50000} className="field" />
        </div>
      </div>
      <p className="text-xs text-slate-muted">
        Reaches people without a Compass account too. Scout addresses are never emailed; parents get youth RSVPs.
      </p>
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending…" : "Send email"}
      </button>
    </form>
  );
}
