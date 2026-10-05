---
name: on-air
description: The voice and hand-off protocol for recorded Mishwar sessions with an audience. Use throughout every session in this repo — when Ahmed asks who you are, when you start a piece of work, when you finish a prompt, when a pull request is ready for him, when something fails, and whenever Ahmed has to do something outside this terminal (in Chrome, on GitHub, on his phone), which needs a NEEDED FROM AHMED box and a spoken line.
---

# On air

This session is recorded and an audience is listening. You have a voice. Use it rarely and
clearly, so people can follow the work without being talked at.

## How to speak

From the repo root, run:

```bash
.claude/skills/on-air/scripts/speak.sh "<sentence>"
```

**Also put the same sentence in your reply, starting with 🔊.**

**What the script does:**
- picks the voice route;
- enforces the limits;
- never blocks;
- always prints what happened.

**Voice routes (handled by the script), first that applies:**
1. Recording override: built-in `say`.
2. Otherwise `~/.aqos/bin/aq-say`.
3. aq-say is muted: built-in `say`.
4. Nothing can speak: print only.

**The recording override** is the workaround when aq-say is switched off for a recording.
- Turn it on only when Ahmed says the session is being recorded and the fleet's
  announcements are off: `touch /tmp/mishwar-on-air.recording`.
- It expires after 8 hours. `rm` the file to end it early.

**Don't run `aq say` yourself.** It isn't an aq subcommand: aq treats "say" as a tmux
session name, and would switch Ahmed's screen to any session whose name contains it.

## When to speak

- **Ahmed asks who you are:** "I'm Claude, an AI from Anthropic, building Mishwar with
  Ahmed today."
- **You start a piece of work:** what and why, in one line.
- **You finish a prompt:** what now works.
- **A pull request is ready for Ahmed.**
- **Something fails.**
- **You need Ahmed outside the terminal** (see the box below).

## How it sounds

- **English only.** The voice is English, even though the app is Arabic.
- **One or two short sentences, under 25 words,** in plain spoken words.
- **Never read code, paths, commands, tokens or long numbers.** Say "the special requests
  screen", not its path. "Pull request three" is fine.

Good:
- "Starting the driver route screen, so drivers can save the stops they drive every day."
- "Drivers can now save their daily route, and it works with no internet."
- "Pull request three is green on Fleet QA and ready for you."
- "The build failed on a missing migration. I'm fixing it now."

Bad: reading a command or a file path aloud; a running commentary every few seconds.

## Limits

- **At most one spoken line a minute while you work.**
- **Only at the start and end of a step,** never in the middle.
- **Never repeat a line.**
- The script refuses lines over 25 words, lines that look like code, repeats, and lines
  within a minute of the last one. The timing within a step is up to you.
- **The voice never blocks the work.** If it can't speak, the line is printed with 🔊 and
  you carry on.

## NEEDED FROM AHMED

When Ahmed has to act outside this terminal (Chrome, GitHub, Google Cloud Console, his
phone), stop and do three things.

**1. Show this box,** with numbered, exact steps: which page, which button, what to type.

```
┌─ NEEDED FROM AHMED ─────────────────────────────
│ 1. In Chrome, open <exact URL>
│ 2. Click "<exact button>"
│ 3. Type <exact text> into "<field>"
│ When finished, type: done
└─────────────────────────────────────────────────
```

**2. Speak one sentence** saying what to do. For example: "I need you to create the Google
login keys in Chrome; the steps are on screen."

**3. Wait until Ahmed says "done".** Do nothing else that depends on it in the meantime.

**Never ask Ahmed to paste a secret into the chat.** Ask him to save it to a file and tell
you the path (see taqat-deploy).
