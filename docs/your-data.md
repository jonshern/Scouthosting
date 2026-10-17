# Your data: where it is, how it's backed up, how to get it back

This page is for Jon (and any parent using Lantern). It says, without the technical detail, where Emmett's progress lives, what protects it, and what to do if something ever goes missing. The step-by-step commands are in [runbooks-mac.md](runbooks-mac.md).

## Where Emmett's progress lives

There are two places, depending on whether Lantern is signed in.

**Signed in to Lantern (the normal case).** Every check mark, log, note, photo and "ready" mark is saved to your Compass account on the Mac mini, in its database. The phone keeps a copy too, so Lantern works offline; changes made offline wait on the phone and go up as soon as it's back online. Emmett's own phone, once you've set it up with a code, saves to the same place.

**Not signed in.** The trail lives only on that phone (or in that web browser). It survives app updates, and Lantern now keeps a spare copy of it on the phone, so a bad save can't wipe it. But if the phone is lost or the app is deleted, that trail goes with it. The fix is to sign in: the first time you do, Lantern offers to save the phone's trail to your account, as a new scout or added to Emmett's.

> When we checked on 2026-10-17, Compass had no Lantern trails saved yet, so Emmett's progress so far is only on the phone or browser where it was checked off. Sign in to Lantern on that phone (Grown-up mode → Scouts and saving) and save it to your account.

## How it's backed up

On the Mac, without you doing anything:

- **Every night at 2:30** the whole Compass database and every uploaded photo are copied to the Crucial X9 drive (the folder `compass-backups`, next to the code). The database itself is on the Mac's own disk, so one disk failing doesn't take both.
- **Right before every update.** Each time new Compass code is installed, a backup is taken just before the database is changed. If an update ever damages data, the Mac can be put back to that moment.
- **A month of backups** is kept, and never fewer than the last 14, however old.
- **Every Sunday at 4:00** the newest backup is restored into a scratch copy and checked: every table, and every Lantern trail step by step, must match, and the encryption key must open everything. If it doesn’t, the Mac raises an alert (and your phone gets it once phone alerts are set up).
- **Every code change** is tested the same way before it can be merged: a test scout called Emmett is backed up, deleted, restored and compared, photos and all.

Notes, photos and names are encrypted. The key that opens them (`MASTER_KEY`) is not in the backups on purpose, so keep it in your password manager. Without it, a backup can't be read by anyone, including you.

## Off the Mac

A backup on the desk next to the Mac doesn't survive a fire, a flood or a theft. Compass can also copy every backup, encrypted, to a folder you choose: iCloud Drive, Dropbox, or another drive. It checks each copy opens after writing it and alerts you if one fails. This is off until you pick the folder. Once the family moves to Google Cloud, the same copy can go to a Cloud Storage bucket instead.

## Keeping your own copy

You can download Emmett's whole trail at any time, as many times as you like:

- **In Compass:** Account → *Lantern trails* (`/account/trails`).
- **In Lantern:** Grown-up mode → *Keep a copy*.

There are three downloads:

| File | What it's for |
|---|---|
| Everything (.zip) | The complete copy: the trail, a spreadsheet and every photo. Keep this one. |
| Spreadsheet (.xlsx) | Opens in Numbers, Excel or Google Sheets: the trail, every requirement and when it was done, and every log and note. Good for printing or showing a counselor. |
| Trail file (.json) | The trail without the photos, small enough to email to yourself. |

Notes and photos are about your child, so keep the copy somewhere private.

## Getting it back

| What happened | What to do |
|---|---|
| A check mark or note is missing | Import your latest copy and choose *Add what's missing to Emmett* (Compass → Account → Lantern trails, or Lantern → Grown-up mode → Bring back a copy). It only adds; it never unchecks or replaces anything, so an older copy can't undo newer progress. |
| Emmett's scout was deleted | Import the copy as *A new scout*. |
| The phone was lost or replaced | Sign in to Lantern on the new phone. Everything saved to your account comes back by itself. |
| An update broke something | Ask in the project. The Mac can go back to the code from before the update in seconds, and if the update damaged data, to the database from right before it, keeping Lantern progress made since (`make rollback DATA=1`). |
| The Mac or its drive died | Compass is set up again from the newest backup (on the Crucial X9, or the off-Mac copy) and the `MASTER_KEY` from your password manager. |

## What can still lose progress

- A trail that was never saved to an account, on a phone that's lost or reset. Sign in to avoid this.
- Losing `MASTER_KEY`. Keep it in the password manager.
- The Mac and the Crucial X9 both lost at once, with no off-Mac copy set up. Pick a folder for the off-Mac copy to avoid this.
