// /account/trails — a copy of each Lantern trail to keep, and putting
// one back. Downloads come from ./[id]/download, the form posts to
// ./import. Lantern on a phone opens this page in its browser.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { scoutNames } from "@/lib/journey/trail-file";

export const metadata = { title: "Lantern trails" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  bad_file: "That file isn't a Lantern trail. Use the .json or .zip from a Lantern or Compass download.",
  no_file: "Pick a file to import first.",
  too_large: "That file is too big to import here (the limit is 200 MB).",
  too_many_scouts: "This account already follows the most scouts it can. Add the file to one of them instead.",
  too_many_entries: "That would put more logs and notes on one scout than Compass keeps. Try adding it to a different scout.",
  too_many_steps: "That would put more check marks on one scout than Compass keeps.",
  not_found: "That scout isn't on this account any more.",
  expired: "The page was open too long. Try again.",
  rate_limited: "That's a lot of imports in an hour. Wait a bit and try again.",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function TrailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/trails");
  const scouts = await scoutNames(user);
  const done = q.done ? scouts.find((s) => s.id === q.done) : undefined;
  const n = (k: string) => Number(q[k] ?? 0) || 0;

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display font-semibold text-3xl mb-2">Lantern trails</h1>
      <p className="max-w-xl text-sm text-slate-muted">
        Every check mark, log, note and photo on your scouts&apos; trails is saved here in Compass and
        backed up every night. You can also keep your own copy, and put one back if anything ever goes
        missing.
      </p>

      {done && (
        <p role="status" className="mt-6 max-w-xl rounded border border-done/30 bg-done-soft p-3 text-sm text-done-text">
          Imported into {done.name || "the scout"}: {plural(n("steps"), "check mark")},{" "}
          {plural(n("entries"), "log or note", "logs and notes")} and {plural(n("photos"), "photo")}.
          {n("skipped") > 0 && <> {plural(n("skipped"), "item")} were already there or couldn&apos;t be read.</>}
        </p>
      )}
      {q.error && (
        <p role="alert" className="mt-6 max-w-xl rounded border border-danger-line bg-danger-soft p-3 text-sm text-danger">
          {ERRORS[q.error] ?? "That didn't work. Try again."}
        </p>
      )}

      <section className="mt-8 max-w-xl">
        <h2 className="font-display font-semibold text-xl mb-3">Download a copy</h2>
        {scouts.length === 0 ? (
          <p className="text-sm text-slate-muted">
            No trails on this account yet. Sign in to Lantern on your phone and your scout&apos;s trail is
            saved here.
          </p>
        ) : (
          <ul className="divide-y divide-divider rounded-xl border border-line bg-surface">
            {scouts.map((s) => (
              <li key={s.id} className="p-4">
                <div className="font-semibold">{s.name || "Scout"}</div>
                <div className="text-xs text-slate-muted">
                  {plural(s.steps, "check mark")} · {plural(s.entries, "log or note", "logs and notes")}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <a className="underline" href={`/account/trails/${s.id}/download?format=zip`}>
                    Everything (.zip, with photos)
                  </a>
                  <a className="underline" href={`/account/trails/${s.id}/download?format=xlsx`}>
                    Spreadsheet (.xlsx)
                  </a>
                  <a className="underline" href={`/account/trails/${s.id}/download?format=json`}>
                    Trail file (.json)
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-muted">
          The .zip is the whole copy: the trail, the spreadsheet and every photo. Keep it somewhere safe,
          like iCloud Drive or a USB drive. Notes and photos are about your child, so keep it private.
        </p>
      </section>

      <section className="mt-10 max-w-xl">
        <h2 className="font-display font-semibold text-xl mb-3">Put a copy back</h2>
        <form action="/account/trails/import" method="post" encType="multipart/form-data" className="space-y-4">
          <CsrfTokenInput />
          <label className="block">
            <span className="block text-sm">A .zip or .json from a Lantern or Compass download</span>
            <input name="file" type="file" accept=".zip,.json,application/zip,application/json" className="mt-1 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-sm">Where it goes</span>
            <select name="into" className="input mt-1" defaultValue="">
              <option value="">A new scout</option>
              {scouts.map((s) => (
                <option key={s.id} value={s.id}>
                  Add what&apos;s missing to {s.name || "Scout"}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-muted">
            Adding to a scout only adds check marks, logs and photos that aren&apos;t there yet. Nothing is
            unchecked or replaced, so an older copy can&apos;t undo newer progress.
          </p>
          <button type="submit" className="btn-primary">
            Import
          </button>
        </form>
      </section>
    </main>
  );
}
