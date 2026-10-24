# PinnedNote

The two kinds of note: pinned notes follow the exercise everywhere (cues, load caps, guardrails); session notes belong to one workout.

**Classes:** `hr-note` (pinned) and `hr-note hr-note--session` (dashed edge), each with `hr-note__icon`, `hr-note__kind` and `hr-note__body`.

**The consumer provides:** the note text and its kind.

- Pinned: `pin` icon in `cursed`, labeled "Pinned". Shown under the exercise header, collapsed to two lines with a "More" if longer.
- Session: `note` icon in `text-2`, labeled "Today".
- Load caps live here for now (the Binding Vow idea). Don't style them as warnings until they become enforced rules.
