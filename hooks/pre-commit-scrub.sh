#!/bin/sh
# Blocks commits that add banned words or use a non-noreply author email.
# Word list lives outside the repo: ~/.scforge-banned.txt (one per line).
list="$HOME/.scforge-banned.txt"
email=$(git config user.email)
case "$email" in *@users.noreply.github.com) ;; *) echo "scrub: author email must be the GitHub noreply address (got $email)"; exit 1;; esac
[ -f "$list" ] || { echo "scrub: $list missing"; exit 1; }
words=$(grep -v '^[[:space:]]*$' "$list" | tr -d '\r')
[ -z "$words" ] && exit 0
hits=$(git diff --cached -U0 --no-color | grep '^+' | grep -v '^+++' | grep -inF "$words")
names=$(git diff --cached --name-only | grep -iF "$words")
if [ -n "$hits$names" ]; then echo "scrub: banned word in staged changes"; printf '%s\n%s\n' "$names" "$hits" | head -20; exit 1; fi
