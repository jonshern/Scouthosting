#!/usr/bin/env bash
# Copy a backup off this disk, so it survives the Mac (or the drive)
# dying. backup.sh runs it after every backup when one of these is set
# in .env:
#
#   OFFSITE_DIR=/path        a folder: another drive, or a folder iCloud
#                            Drive or Dropbox syncs, e.g.
#                            ~/Library/Mobile Documents/com~apple~CloudDocs/Compass backups
#   OFFSITE_URL=gs://bucket/compass   a Cloud Storage bucket (gcloud signed in)
#   OFFSITE_PASSPHRASE=...   encrypts each copy (AES-256, openssl). Needed
#                            for a synced folder or bucket; keep it in the
#                            password manager next to MASTER_KEY.
#   OFFSITE_KEEP=30          copies kept there (default 30)
#
#   scripts/host/offsite.sh [BACKUP]              # copy BACKUP (default: newest)
#   scripts/host/offsite.sh --fetch FILE|URL      # bring a copy back into BACKUP_DIR
#
# Each copy is one file, compass-<time>.tar (or .tar.enc), next to a
# .sha256. After writing, it reads the copy back (decrypting it) and
# checks it matches, so a copy that can't be opened is caught now. A
# failure leaves $BACKUP_DIR/.offsite-failed, which the watchdog alerts on.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DEST_DIR="$(env_get OFFSITE_DIR)"; DEST_DIR="${DEST_DIR/#\~/$HOME}"
DEST_URL="$(env_get OFFSITE_URL)"
PASS="$(env_get OFFSITE_PASSPHRASE)"
KEEP="$(env_get OFFSITE_KEEP)"; KEEP="${KEEP:-30}"
FLAG="$(backup_dir)/.offsite-failed"
export OFFSITE_PASSPHRASE="$PASS"

encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:OFFSITE_PASSPHRASE; }
decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:OFFSITE_PASSPHRASE; }

if [ "${1:-}" = "--fetch" ]; then
  SRC="${2:-}"; [ -n "$SRC" ] || die "usage: offsite.sh --fetch FILE|URL"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  case "$SRC" in
    gs://*) gcloud storage cp "$SRC" "$tmp/copy" --quiet >&2 ;;
    *) cp "$SRC" "$tmp/copy" ;;
  esac
  case "$SRC" in
    *.enc) [ -n "$PASS" ] || die "OFFSITE_PASSPHRASE is needed to open $SRC"; decrypt < "$tmp/copy" > "$tmp/copy.tar" || die "couldn't decrypt $SRC (wrong OFFSITE_PASSPHRASE?)" ;;
    *) mv "$tmp/copy" "$tmp/copy.tar" ;;
  esac
  mkdir -p "$(backup_dir)"
  tar -xf "$tmp/copy.tar" -C "$(backup_dir)"
  name="$(tar -tf "$tmp/copy.tar" | head -n1 | cut -d/ -f1)"
  log "fetched into $(backup_dir)/$name; check it with: scripts/host/restore.sh --drill $(backup_dir)/$name"
  echo "$(backup_dir)/$name"
  exit 0
fi

[ -n "$DEST_DIR$DEST_URL" ] || die "set OFFSITE_DIR or OFFSITE_URL in .env"
SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC="$(ls -1d "$(backup_dir)"/compass-* 2>/dev/null | sort -r | head -n1 || true)"
  [ -n "$SRC" ] || die "no backups in $(backup_dir)"
fi
[ -f "$SRC/manifest.txt" ] || die "$SRC is not a backup"
if [ -z "$PASS" ]; then
  case "$DEST_URL$DEST_DIR" in
    gs://*|*CloudDocs*|*Dropbox*|*Google\ Drive*|*OneDrive*)
      touch "$FLAG"; die "OFFSITE_PASSPHRASE must be set to copy backups to a cloud folder or bucket" ;;
  esac
  log "OFFSITE_PASSPHRASE isn't set; the copy is not encrypted (fine for a drive only you have)"
fi

name="$(basename "$SRC")"
file="$name.tar"; [ -n "$PASS" ] && file="$file.enc"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fail() { touch "$FLAG"; die "$*"; }

tar -cf "$tmp/plain.tar" -C "$(dirname "$SRC")" "$name"
if [ -n "$PASS" ]; then encrypt < "$tmp/plain.tar" > "$tmp/$file" || fail "encrypting failed"
else mv "$tmp/plain.tar" "$tmp/$file"; fi
sha256_file "$tmp/$file" > "$tmp/$file.sha256"

# The read-back check: the copy opens and holds the same manifest.
verify() { # file
  local out="$tmp/check"
  if [ -n "$PASS" ]; then decrypt < "$1" > "$out.tar" || return 1; else cp "$1" "$out.tar"; fi
  mkdir -p "$out" && tar -xf "$out.tar" -C "$out" && cmp -s "$out/$name/manifest.txt" "$SRC/manifest.txt" &&
    [ "$(sha256_file "$out/$name/db.dump")" = "$(sed -n 's/^db_dump_sha256 //p' "$SRC/manifest.txt")" ]
}

if [ -n "$DEST_URL" ]; then
  url="${DEST_URL%/}"
  gcloud storage cp "$tmp/$file" "$tmp/$file.sha256" "$url/" --quiet >&2 || fail "upload to $url failed"
  gcloud storage cp "$url/$file" "$tmp/back" --quiet >&2 || fail "couldn't read $url/$file back"
  verify "$tmp/back" || fail "the copy at $url/$file doesn't match $SRC"
  gcloud storage ls "$url/compass-*.tar*" 2>/dev/null | grep -v '\.sha256$' | sort -r | tail -n +"$((KEEP + 1))" |
    while read -r old; do gcloud storage rm "$old" "$old.sha256" --quiet >&2 || true; done || true
  where="$url/$file"
else
  mkdir -p "$DEST_DIR" || fail "can't create $DEST_DIR (is the drive or cloud folder there?)"
  cp "$tmp/$file" "$DEST_DIR/.$file.partial" && mv -f "$DEST_DIR/.$file.partial" "$DEST_DIR/$file" && cp "$tmp/$file.sha256" "$DEST_DIR/" ||
    fail "copying to $DEST_DIR failed"
  verify "$DEST_DIR/$file" || fail "the copy at $DEST_DIR/$file doesn't match $SRC"
  find "$DEST_DIR" -maxdepth 1 \( -name 'compass-*.tar' -o -name 'compass-*.tar.enc' \) | sort -r | tail -n +"$((KEEP + 1))" |
    while read -r old; do rm -f "$old" "$old.sha256"; done
  where="$DEST_DIR/$file"
fi

rm -f "$FLAG"
log "off-Mac copy written and checked: $where"
