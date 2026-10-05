#!/bin/bash
# speak.sh "<one or two short sentences>" — the on-air voice for Mishwar sessions.
#
# Route, first that applies:
#   1. Recording override: /tmp/mishwar-on-air.recording exists and is under 8 hours
#      old → built-in `say` directly (skips aq-say and its Telegram mirror).
#   2. aq-say is on → ~/.aqos/bin/aq-say.
#   3. aq-say is muted (~/.aqos/.voice-off or AQ_SAY_OFF=1) → built-in `say`.
#   4. Nothing can speak → print the line only.
#
# It never blocks and never fails the caller: speech runs detached and the script
# always exits 0. It refuses lines over 25 words or lines that look like code, and
# holds a line if another was spoken less than 60 seconds ago or if it repeats the
# last one. Every outcome is printed so the transcript shows what happened.
#
# Note: `aq say` (with a space) is not an aq subcommand. aq treats unknown words as
# tmux session names and would switch Ahmed's screen to any session whose name
# contains "say", so this script calls ~/.aqos/bin/aq-say directly instead.

set -u
TEXT="$*"
OVERRIDE=/tmp/mishwar-on-air.recording
STATE_DIR="${TMPDIR:-/tmp}"
LAST_TIME="$STATE_DIR/mishwar-on-air.last-time"
LAST_TEXT="$STATE_DIR/mishwar-on-air.last-text"
AQ_SAY="$HOME/.aqos/bin/aq-say"

out() { printf '%s\n' "$1"; exit 0; }

[ -z "$TEXT" ] && out "on-air: nothing to say (usage: speak.sh \"sentence\")"

words=$(printf '%s' "$TEXT" | wc -w | tr -d ' ')
[ "$words" -gt 25 ] && out "🔊 $TEXT   (not spoken: $words words, limit is 25)"

if printf '%s' "$TEXT" | grep -qE '[/\\`$<>{}_]|[0-9]{5,}'; then
  out "🔊 $TEXT   (not spoken: looks like code, a path or a long number)"
fi

now=$(date +%s)
last=$(cat "$LAST_TIME" 2>/dev/null || echo 0)
if [ "$TEXT" = "$(cat "$LAST_TEXT" 2>/dev/null)" ]; then
  out "🔊 $TEXT   (not spoken: same as the last line)"
fi
if [ $((now - last)) -lt 60 ]; then
  out "🔊 $TEXT   (not spoken: last line was $((now - last))s ago, limit is one a minute)"
fi

speak_builtin() {
  command -v say >/dev/null 2>&1 || return 1
  local voice
  voice="$(cat "$HOME/.aqos/aq-say.voice" 2>/dev/null)"
  if [ -n "$voice" ] && say -v '?' | grep -q "^$voice "; then
    nohup say -v "$voice" -r 190 "$TEXT" >/dev/null 2>&1 &
  else
    nohup say -r 190 "$TEXT" >/dev/null 2>&1 &
  fi
  return 0
}

route=""
if [ -f "$OVERRIDE" ] && [ -n "$(find "$OVERRIDE" -mmin -480 2>/dev/null)" ]; then
  speak_builtin && route="say (recording override)"
elif [ -x "$AQ_SAY" ] && [ ! -f "$HOME/.aqos/.voice-off" ] && [ "${AQ_SAY_OFF:-0}" != "1" ]; then
  "$AQ_SAY" "$TEXT" >/dev/null 2>&1 && route="aq-say"
else
  speak_builtin && route="say (aq-say muted)"
fi

if [ -n "$route" ]; then
  echo "$now" > "$LAST_TIME"
  printf '%s' "$TEXT" > "$LAST_TEXT"
  out "🔊 $TEXT   (spoken via $route)"
fi
out "🔊 $TEXT   (no voice available, printed only)"
