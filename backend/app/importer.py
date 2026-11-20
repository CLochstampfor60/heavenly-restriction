"""Import the owner's program spreadsheet (.xlsx) into a program_version.

    .\\.venv\\Scripts\\python -m app.importer            # path from PROGRAM_XLSX_PATH
    .\\.venv\\Scripts\\python -m app.importer <file.xlsx>

Source of truth: the day tabs ("Gym N - Name (Mon)") and "Sat & Sun". The overview tab is
commentary; it is only read for the version label and a few cross-checks. "Substitutions" gives
ranked swaps; "Parked - Review List" gives excluded exercises (Section A = goal, B = spine/joint).

Anything that does not map cleanly is not guessed at: it is written to the obstacles report
(internal_docs/import-obstacles.md, gitignored) with the tab, the rows and the reason.

Re-running updates the same program_version (matched by label) instead of adding another.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import openpyxl
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    BLOCK_ORDER,
    Block,
    CardioEntry,
    Exclusion,
    ExclusionKind,
    Exercise,
    Measure,
    Note,
    NoteKind,
    ProgramDay,
    ProgramSlot,
    ProgramVersion,
    Swap,
)

WEEKDAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DAY_TAB = re.compile(r"^Gym\s*(\d+)\s*\W+\s*(.+?)\s*\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)\s*$", re.I)
CODE_BLOCK = {"WU": Block.WARMUP, "CD": Block.COOLDOWN}
CARDIO_WORDS = ("bike", "walk", "treadmill", "elliptical", "rower", "erg", "stair")
MANUAL_MARKER = "<!-- Manual notes below this line are kept when the importer re-runs. -->"

# Target-muscle wording -> (region, muscle) for the library. First segment of the cell only.
MUSCLES = {
    "lats": ("Back", "Lats"),
    "upper back": ("Back", "Upper back"),
    "mid-back": ("Back", "Mid-back"),
    "rear delts": ("Back", "Rear delts"),
    "front delts": ("Shoulders", "Front delts"),
    "side delts": ("Shoulders", "Side delts"),
    "lower traps": ("Shoulders", "Lower traps"),
    "chest": ("Chest", "Mid chest"),
    "upper chest": ("Chest", "Upper chest"),
    "triceps": ("Arms", "Triceps"),
    "biceps": ("Arms", "Biceps"),
    "brachioradialis": ("Arms", "Forearms"),
    "wrist flexors": ("Arms", "Forearms"),
    "wrist extensors": ("Arms", "Forearms"),
    "ulnar deviators": ("Arms", "Forearms"),
    "grip": ("Arms", "Forearms"),
    "quads": ("Legs", "Quads"),
    "hamstrings": ("Legs", "Hamstrings"),
    "calves": ("Legs", "Calves"),
    "glutes": ("Hips", "Glutes"),
    "glute med": ("Hips", "Glute med"),
    "anti-rotation": ("Core", "Anti-rotation"),
    "anti-extension": ("Core", "Anti-extension"),
    "anti-lateral-flexion": ("Core", "Anti-lateral-flexion"),
    "obliques": ("Core", "Obliques"),
}
EQUIPMENT = [
    ("smith", "Smith machine"),
    ("machine", "Machine"),
    ("cable", "Cable"),
    ("pulldown", "Cable"),
    ("pushdown", "Cable"),
    ("barbell", "Barbell"),
    ("kettlebell", "Kettlebell"),
    ("kb ", "Kettlebell"),
    (" db ", "Dumbbells"),
    ("dumbbell", "Dumbbells"),
    ("plate", "Plate"),
    ("band", "Bands"),
]


# ---------------------------------------------------------------- small parsers


def text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r"\s+", " ", str(value)).strip()


def is_blank(value: str) -> bool:
    return value in ("", "-", "—", "–")


def strip_parens(name: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", name).strip()


def parens(name: str) -> str | None:
    found = re.findall(r"\(([^)]*)\)", name)
    return "; ".join(found) if found else None


def canonical(name: str) -> str:
    """Exercise identity: the program's name without its parenthetical setup notes."""
    return re.sub(r"\s+", " ", strip_parens(name)).strip(" ,")


def tokens(name: str) -> frozenset[str]:
    return frozenset(t for t in re.split(r"[^a-z0-9]+", name.lower()) if t)


def first_word(name: str) -> str:
    words = re.split(r"[^a-z0-9]+", name.lower())
    return next((w for w in words if w), "")


def either_or(name: str) -> list[str] | None:
    """'Seated DB or Machine Shoulder Press' -> both full names. None if not a simple A-or-B."""
    match = re.match(r"^(.*?)(\S+) or (\S+)(.*)$", name)
    if not match or " or " in match.group(4):
        return None
    pre, a, b, post = match.groups()
    return [
        re.sub(r"\s+", " ", f"{pre}{a}{post}").strip(),
        re.sub(r"\s+", " ", f"{pre}{b}{post}").strip(),
    ]


def parse_sets(value: str) -> tuple[int, int] | None:
    match = re.fullmatch(r"(\d+)(?:\s*-\s*(\d+))?", value)
    if not match:
        return None
    lo = int(match.group(1))
    return lo, int(match.group(2) or lo)


@dataclass
class Target:
    measure: str
    lo: int
    hi: int
    per_side: bool


def parse_target(value: str) -> Target | None:
    """'10-12', '8 / side', '30 s / side', '20-30 s'. Anything else returns None."""
    match = re.fullmatch(r"(\d+)(?:\s*-\s*(\d+))?\s*(s|sec)?\s*(/\s*side)?", value, re.I)
    if not match:
        return None
    lo = int(match.group(1))
    return Target(
        measure=Measure.SECONDS.value if match.group(3) else Measure.REPS.value,
        lo=lo,
        hi=int(match.group(2) or lo),
        per_side=bool(match.group(4)),
    )


def parse_dose(value: str) -> tuple[tuple[int, int], Target] | None:
    """Sat & Sun 'Dose' column: '3 x 12-15', '2-3 x 5-8'."""
    match = re.fullmatch(r"(\d+(?:\s*-\s*\d+)?)\s*x\s*(.+)", value, re.I)
    if not match:
        return None
    sets, target = parse_sets(match.group(1)), parse_target(match.group(2))
    return (sets, target) if sets and target else None


def parse_minutes(value: str) -> tuple[int, int] | None:
    match = re.match(r"^(\d+)(?:\s*-\s*(\d+))?\s*min\b", value, re.I)
    if not match:
        return None
    lo = int(match.group(1))
    return lo, int(match.group(2) or lo)


def treadmill_settings(value: str) -> dict:
    """'4.0 / 2.0 MPH' or 'Incline 4.0 @ 2.0 MPH' -> incline and speed."""
    match = re.search(r"([\d.]+)\s*(?:/|@)\s*([\d.]+)\s*MPH", value, re.I)
    return {"incline": float(match.group(1)), "speed_mph": float(match.group(2))} if match else {}


def region_for(target_muscle: str) -> tuple[str | None, str | None]:
    if not target_muscle:
        return None, None
    first = re.split(r"[/(]", target_muscle)[0].strip().lower()
    first = re.sub(r"\s+core$", "", first)
    return MUSCLES.get(first, (None, None))


def equipment_for(name: str) -> str | None:
    padded = f" {name.lower()} "
    for needle, label in EQUIPMENT:
        if needle in padded:
            return label
    return None


def split_cap(note: str) -> tuple[str, str | None, float | None]:
    """Pull a 'CAP 90 LB' sentence out of a cue. Returns (cue, cap sentence, cap lb)."""
    sentences = re.split(r"(?<=\.)\s+", note)
    for k, sentence in enumerate(sentences):
        match = re.search(r"\bCAP(?:\s+AT)?\s+(\d+(?:\.\d+)?)\s*LB\b", sentence, re.I)
        if match:
            rest = " ".join(sentences[:k] + sentences[k + 1 :]).strip()
            return rest, sentence.strip(), float(match.group(1))
    return note, None, None


# ---------------------------------------------------------------- parsed program


@dataclass
class SlotSpec:
    code: str
    block: str
    display_name: str
    names: list[str]  # canonical exercise names; two for either/or
    pattern: str | None = None
    target_muscle: str = ""
    sets: tuple[int, int] | None = None
    sets_text: str = ""
    target: Target | None = None
    target_text: str = ""
    optional: bool = False
    loggable: bool = True
    routine: bool = False
    note: str = ""
    row: int = 0


@dataclass
class CardioSpec:
    mode: str
    minutes: tuple[int, int] | None
    settings: dict
    text: str


@dataclass
class DaySpec:
    key: str
    weekday: int
    name: str
    title: str = ""
    subtitle: str = ""
    tab: str = ""
    slots: list[SlotSpec] = field(default_factory=list)
    cardio: list[CardioSpec] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class SwapSpec:
    primary: str  # original wording
    subs: list[tuple[int, str]]  # (rank, original wording)
    row: int


@dataclass
class ExclusionSpec:
    movement: str
    kind: str
    label: str
    reason: str
    revisit: str
    row: int


@dataclass
class Obstacle:
    tab: str
    rows: str
    what: str
    why: str


@dataclass
class Parsed:
    label: str
    title: str
    days: list[DaySpec] = field(default_factory=list)
    swaps: list[SwapSpec] = field(default_factory=list)
    exclusions: list[ExclusionSpec] = field(default_factory=list)
    obstacles: list[Obstacle] = field(default_factory=list)
    overview: list[tuple[int, str, str]] = field(default_factory=list)  # (row, A, rest)

    def flag(self, tab: str, rows, what: str, why: str) -> None:
        self.obstacles.append(Obstacle(tab, str(rows), what, why))


def rows_of(ws) -> list[tuple[int, list[str]]]:
    out = []
    for row in ws.iter_rows():
        values = [text(c.value) for c in row]
        if any(values):
            out.append((row[0].row, values))
    return out


def header_map(values: list[str]) -> dict[str, int]:
    names = {
        "exercise": ("exercise", "movement"),
        "pattern": ("pattern",),
        "muscle": ("target muscle", "target"),
        "sets": ("sets",),
        "reps": ("reps",),
        "dose": ("dose",),
        "notes": ("notes / cues", "notes", "cues"),
    }
    out = {}
    for k, v in enumerate(values):
        for key, options in names.items():
            if v.lower() in options and key not in out:
                out[key] = k
    return out


def slot_code(raw: str) -> str | None:
    raw = raw.upper()
    if raw in ("WU", "CD", "OPT") or re.fullmatch(r"[CF]?\d+", raw):
        return raw
    return None


def block_for(code: str) -> str:
    if code in CODE_BLOCK:
        return CODE_BLOCK[code].value
    if code.startswith("C"):
        return Block.CORE.value
    if code.startswith("F"):
        return Block.FOREARM.value
    return Block.MAIN.value


def make_slot(parsed: Parsed, tab: str, row: int, code: str, cols, values) -> SlotSpec:
    def col(key: str) -> str:
        k = cols.get(key)
        return values[k] if k is not None and k < len(values) else ""

    display = col("exercise")
    names = [canonical(display)]
    if " or " in strip_parens(display):
        options = either_or(strip_parens(display))
        if options:
            names = [canonical(o) for o in options]
        else:
            parsed.flag(tab, row, display, "Has 'or' but is not a simple A-or-B name; kept as one.")
    pattern = col("pattern").upper()
    spec = SlotSpec(
        code=code,
        block=block_for(code),
        display_name=display,
        names=names,
        pattern=pattern if pattern in ("PUSH", "PULL", "CORE", "FOREARM") else None,
        target_muscle="" if is_blank(col("muscle")) else col("muscle"),
        optional=code == "OPT",
        note=col("notes"),
        row=row,
    )
    if spec.pattern is None and spec.block in (Block.CORE.value, Block.FOREARM.value):
        spec.pattern = spec.block.upper()

    if "dose" in cols:  # Sat & Sun layout
        dose = col("dose")
        spec.sets_text = spec.target_text = dose
        parsed_dose = parse_dose(dose)
        if parsed_dose:
            spec.sets, spec.target = parsed_dose
    else:
        spec.sets_text, spec.target_text = col("sets"), col("reps")
        spec.sets = parse_sets(spec.sets_text)
        spec.target = parse_target(spec.target_text)

    if spec.sets_text.lower().startswith("1 round"):
        spec.routine, spec.loggable = True, False
        spec.target = None
        if code not in CODE_BLOCK:
            spec.block = (
                Block.COOLDOWN.value if "recovery" in display.lower() else Block.WARMUP.value
            )
    elif spec.block in (Block.WARMUP.value, Block.COOLDOWN.value):
        spec.routine, spec.loggable = True, False
    elif spec.sets is None:
        spec.loggable = False
        parsed.flag(
            tab,
            row,
            f"{display}: '{spec.sets_text}'",
            "Dose is not 'N' or 'N x reps'; imported as a checklist item (Done / Skip, no sets).",
        )
    elif spec.target is None:
        parsed.flag(
            tab,
            row,
            f"{display}: '{spec.target_text}'",
            "Compound or unrecognized rep target; sets are loggable but there is no rep range, "
            "only the original text.",
        )
    if " + " in strip_parens(display) and not spec.routine:
        parsed.flag(tab, row, display, "Two movements in one slot; kept as one exercise name.")
    return spec


def parse_day_tab(parsed: Parsed, ws, number: str, name: str, day: str) -> DaySpec:
    tab = ws.title
    spec = DaySpec(key=f"gym{number}", weekday=WEEKDAYS[day.lower()], name=name, tab=tab)
    rows = rows_of(ws)
    spec.title = rows[0][1][0] if rows else ""
    spec.subtitle = rows[1][1][0] if len(rows) > 1 else ""
    cols: dict[str, int] = {}
    state = "pre"
    reference: list[int] = []
    headers: list[str] = []
    for row, values in rows:
        first = values[0]
        if state == "pre":
            if first == "#":
                cols, state = header_map(values), "table"
            continue
        if state == "table":
            code = slot_code(first)
            if code:
                spec.slots.append(make_slot(parsed, tab, row, code, cols, values))
                continue
            state = "footer"
        if state == "footer":
            if first.upper().startswith("REFERENCE"):
                state = "reference"
                reference.append(row)
                headers.append(first)
                continue
            line = " ".join(v for v in values if v)
            if line.lower().startswith("cardio after:"):
                spec.cardio.extend(parse_cardio_line(parsed, tab, row, line))
            if line.lower().startswith("optional supersets"):
                parsed.flag(
                    tab, row, line, "Optional supersets have no slot model yet; kept as a day note."
                )
            spec.notes.append(line)
        elif state == "reference":
            reference.append(row)
            if first.isupper() and not values[1]:
                headers.append(first)  # PART 1 / PART 2 style sub-headers
            elif values[1] and any("per chart" in v.lower() for v in values):
                headers.append(f"{values[1]}: 'Per chart', no exercise list")
    if reference:
        parsed.flag(
            tab,
            f"{reference[0]}-{reference[-1]}",
            "Reference sections: " + " / ".join(headers),
            "Routine contents are not imported; WU and CD are single checklist items.",
        )
    return spec


def parse_cardio_line(parsed: Parsed, tab: str, row: int, line: str) -> list[CardioSpec]:
    body = line.split(":", 1)[1].strip()
    out = []
    for part in body.split(" + "):
        part = part.strip()
        piece = re.split(r"(?<=\.)\s", part)[0].rstrip(".")  # drop trailing advice sentences
        minutes = parse_minutes(piece)
        if not minutes:
            parsed.flag(tab, row, part, "Cardio part without minutes; not imported.")
            continue
        mode = re.sub(r"^\d+(?:-\d+)?\s*min\s*", "", piece, flags=re.I)
        mode = re.sub(r"\s+at\s+[\d.]+\s*/\s*[\d.]+\s*MPH", "", mode, flags=re.I)
        settings = treadmill_settings(piece)
        if parens(mode):
            settings["note"] = parens(mode)
        out.append(CardioSpec(strip_parens(mode).capitalize(), minutes, settings, part))
    return out


def parse_weekend(parsed: Parsed, ws) -> list[DaySpec]:
    tab = ws.title
    days = {
        "sat": DaySpec(key="sat", weekday=5, name="Saturday", tab=tab),
        "sun": DaySpec(key="sun", weekday=6, name="Sunday", tab=tab),
    }
    rows = rows_of(ws)
    title = rows[0][1][0] if rows else ""
    subtitle = rows[1][1][0] if len(rows) > 1 else ""
    for d in days.values():
        d.title, d.subtitle = title, subtitle
    if re.search(r"\(v\d+(\.\d+)*\)", title) and parsed.label not in title:
        parsed.flag(
            tab, rows[0][0], title, f"Tab title names a different version than {parsed.label}."
        )
    cols: dict[str, int] = {}
    current: DaySpec | None = None
    section = ""
    skipped: dict[str, list[int]] = defaultdict(list)
    for row, values in rows[2:]:
        first = values[0]
        upper = first.upper()
        if first == "#":
            cols = header_map(values)
            continue
        if upper.startswith("SATURDAY"):
            current, section = days["sat"], first
            continue
        if upper.startswith("SUNDAY"):
            current, section = days["sun"], first
            continue
        if upper.startswith("DAILY HOME BLOCK") or upper.startswith("REFERENCE"):
            current, section = None, first
            skipped[section].append(row)
            continue
        code = slot_code(first)
        if code and current is not None:
            name = values[cols["exercise"]]
            dose = values[cols["dose"]] if "dose" in cols else ""
            minutes = parse_minutes(dose)
            if minutes and any(w in name.lower() for w in CARDIO_WORDS):
                note = values[cols["notes"]] if "notes" in cols else ""
                settings = treadmill_settings(f"{dose} {note}")
                current.cardio.append(CardioSpec(strip_parens(name), minutes, settings, dose))
                continue
            spec = make_slot(parsed, tab, row, code, cols, values)
            if "OPTIONAL" in section.upper():
                spec.optional = True
            current.slots.append(spec)
            continue
        if current is None:
            if section:
                skipped[section].append(row)
            continue
        # A free-text line under a day section.
        current.notes.append(" ".join(v for v in values if v))
    for section, section_rows in skipped.items():
        parsed.flag(
            tab,
            f"{section_rows[0]}-{section_rows[-1]}",
            section,
            "Not a Saturday or Sunday session item (daily block or reference routine); "
            "not imported.",
        )
    return [d for d in days.values() if d.slots or d.cardio]


def parse_substitutions(parsed: Parsed, ws) -> None:
    rows = rows_of(ws)
    in_table = False
    for row, values in rows:
        first = values[0]
        if first.lower() == "primary exercise":
            in_table = True
            continue
        if not in_table:
            continue
        subs = [(k, v) for k, v in enumerate(values[1:3], start=1) if v]
        if not subs:
            in_table = False
            continue
        parsed.swaps.append(SwapSpec(primary=first, subs=subs, row=row))


def parse_parked(parsed: Parsed, ws) -> None:
    kind = None
    for row, values in rows_of(ws):
        first = values[0]
        upper = first.upper()
        if upper.startswith("SECTION A"):
            kind = ExclusionKind.GOAL.value
            continue
        if upper.startswith("SECTION B"):
            kind = ExclusionKind.SPINE_JOINT.value
            continue
        if kind is None or first.lower() == "movement":
            continue
        if len(values) < 2 or not values[1]:
            kind = None  # closing commentary paragraph
            continue
        parsed.exclusions.append(
            ExclusionSpec(
                movement=first,
                kind=kind,
                label=values[1],
                reason=values[2] if len(values) > 2 else "",
                revisit=values[3] if len(values) > 3 else "",
                row=row,
            )
        )


def check_overview(parsed: Parsed) -> None:
    """Cross-check the few Overview statements that the day tabs can confirm or contradict."""
    gym_days = [d for d in parsed.days if d.key.startswith("gym")]
    forearm_days = {
        DAY_NAMES[d.weekday] for d in gym_days if any(s.block == "forearm" for s in d.slots)
    }
    for d in gym_days:
        if d.weekday == 2 and any(s.block == "forearm" for s in d.slots):
            parsed.flag(
                d.tab, "-", "Forearm slots on Wednesday", "The forearm block is never on Wednesday."
            )
    for row, label, rest in parsed.overview:
        if label.lower().startswith("forearm block") and rest:
            stated = set(re.findall(r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b", rest))
            if stated and stated != forearm_days:
                parsed.flag(
                    "Overview",
                    row,
                    f"Forearm days: Overview says {', '.join(sorted(stated, key=DAY_NAMES.index))}",
                    f"Day tabs have forearm slots on "
                    f"{', '.join(sorted(forearm_days, key=DAY_NAMES.index)) or 'no day'}.",
                )
        if re.search(r"\btwo anti-movement moves per day\b", f"{label} {rest}", re.I):
            for d in gym_days:
                count = sum(1 for s in d.slots if s.block == "core")
                if count != 2:
                    parsed.flag(
                        d.tab,
                        ", ".join(str(s.row) for s in d.slots if s.block == "core") or "-",
                        f"Core: {count} core slot(s) on {DAY_NAMES[d.weekday]}",
                        f"Overview row {row} says two core moves per day.",
                    )


def parse_workbook(path: Path) -> Parsed:
    wb = openpyxl.load_workbook(path, data_only=True, read_only=False)
    overview = next((ws for ws in wb.worksheets if "overview" in ws.title.lower()), None)
    title = text(overview["A1"].value) if overview else ""
    match = re.search(r"v(\d+(?:\.\d+)+)", title) or re.search(r"v(\d+)_(\d+)", path.name)
    if not match:
        raise ValueError("Could not find a version label (vN.N) in the overview title or filename.")
    label = "v" + (
        match.group(1) if "." in match.group(0) else f"{match.group(1)}.{match.group(2)}"
    )
    parsed = Parsed(label=label, title=title)
    if overview:
        for row, values in rows_of(overview):
            parsed.overview.append((row, values[0], " ".join(v for v in values[1:] if v)))

    handled = set()
    for ws in wb.worksheets:
        m = DAY_TAB.match(ws.title)
        if m:
            parsed.days.append(parse_day_tab(parsed, ws, *m.groups()))
            handled.add(ws.title)
        elif ws.title.lower().startswith("sat") and "sun" in ws.title.lower():
            parsed.days.extend(parse_weekend(parsed, ws))
            handled.add(ws.title)
        elif ws.title.lower().startswith("substitution"):
            parse_substitutions(parsed, ws)
            handled.add(ws.title)
        elif ws.title.lower().startswith("parked") and "review" in ws.title.lower():
            parse_parked(parsed, ws)
            handled.add(ws.title)
    for ws in wb.worksheets:
        if ws.title not in handled and ws is not overview:
            parsed.flag(
                ws.title,
                f"1-{ws.max_row}",
                "Whole tab",
                "Not a day tab, substitutions or parked list; not imported.",
            )
    parsed.days.sort(key=lambda d: d.weekday)
    seen = {}
    for d in parsed.days:
        if d.weekday in seen:
            parsed.flag(d.tab, "-", d.name, f"Second program day on {DAY_NAMES[d.weekday]}.")
        seen[d.weekday] = d
    check_overview(parsed)
    return parsed


# ---------------------------------------------------------------- writing to the database


class Catalog:
    """Finds or creates exercises by name, and records fuzzy matches for review."""

    def __init__(self, db: Session, parsed: Parsed):
        self.db = db
        self.parsed = parsed
        self.by_name = {e.name.lower(): e for e in db.scalars(select(Exercise))}
        self.aliases: dict[int, set[frozenset[str]]] = defaultdict(set)
        self.fuzzy: list[tuple[str, str, str]] = []
        # Assisted = any wording of the exercise in this import says so, parentheticals
        # included ("Parallel-Bar Dips (assisted to start)"). Settled in finish().
        self.touched: set[Exercise] = set()
        self.assisted: set[Exercise] = set()

    def note_wording(self, ex: Exercise, *wordings: str) -> None:
        self.touched.add(ex)
        if any("assist" in w.lower() for w in wordings):
            self.assisted.add(ex)

    def finish(self) -> None:
        for ex in self.touched:
            ex.assisted = ex in self.assisted

    def get(self, name: str, **fields) -> Exercise:
        ex = self.by_name.get(name.lower())
        if ex is None:
            ex = Exercise(name=name)
            self.db.add(ex)
            self.by_name[name.lower()] = ex
        for key, value in fields.items():
            if value is not None:
                setattr(ex, key, value)
        self.note_wording(ex, name)
        return ex

    def alias(self, ex: Exercise, *names: str) -> None:
        self.note_wording(ex, *names)
        self.db.flush()
        for n in names:
            self.aliases[ex.id].add(tokens(n))

    def find(self, wording: str, tab: str, row: int) -> Exercise | None:
        """Exact canonical name first; then a unique program exercise whose wording contains
        every word of this one (3+ words only, to avoid 'Side Plank' matching a clamshell)."""
        exact = self.by_name.get(canonical(wording).lower())
        if exact is not None:
            return exact
        want = tokens(wording)
        if len(want) < 3:
            return None
        lead = first_word(wording)
        hits = {
            ex_id
            for ex_id, alias_set in self.aliases.items()
            if any(want <= alias for alias in alias_set)
            and first_word(self.db.get(Exercise, ex_id).name) == lead
        }
        if len(hits) == 1:
            ex = self.db.get(Exercise, hits.pop())
            self.fuzzy.append((tab, f"{row}: '{wording}'", ex.name))
            return ex
        if len(hits) > 1:
            names = ", ".join(sorted(self.db.get(Exercise, h).name for h in hits))
            self.parsed.flag(tab, row, wording, f"Matches more than one exercise ({names}).")
        return None


def write(db: Session, parsed: Parsed, source_name: str) -> ProgramVersion:
    version = db.scalar(select(ProgramVersion).where(ProgramVersion.label == parsed.label))
    if version is None:
        version = ProgramVersion(label=parsed.label)
        db.add(version)
    version.title = parsed.title
    version.source_name = source_name
    version.imported_at = datetime.now(UTC)
    for other in db.scalars(select(ProgramVersion).where(ProgramVersion.label != parsed.label)):
        other.active = False
    version.active = True
    db.flush()

    # Program-sourced rows for this version are rebuilt; your own notes and logs are not touched.
    db.execute(delete(Note).where(Note.program_version_id == version.id))
    db.execute(delete(Swap).where(Swap.program_version_id == version.id))
    db.execute(delete(Exclusion).where(Exclusion.program_version_id == version.id))

    catalog = Catalog(db, parsed)
    existing_days = {d.key: d for d in version.days}
    keep_days = set()
    for spec in parsed.days:
        day = existing_days.get(spec.key) or ProgramDay(key=spec.key, version=version)
        day.weekday, day.name, day.title, day.subtitle = (
            spec.weekday,
            spec.name,
            spec.title,
            spec.subtitle,
        )
        day.notes = spec.notes
        db.add(day)
        keep_days.add(spec.key)
        write_slots(db, catalog, version, day, spec)
        day.cardio.clear()
        for k, c in enumerate(spec.cardio):
            day.cardio.append(
                CardioEntry(
                    position=k,
                    mode=c.mode,
                    minutes_min=c.minutes[0] if c.minutes else None,
                    minutes_max=c.minutes[1] if c.minutes else None,
                    settings=c.settings,
                    text=c.text,
                )
            )
    for key, day in existing_days.items():
        if key not in keep_days:
            db.delete(day)
    db.flush()

    write_swaps(db, catalog, version, parsed)
    write_exclusions(db, catalog, version, parsed)
    catalog.finish()
    for tab, where, name in catalog.fuzzy:
        parsed.flag(tab, where, f"Matched to '{name}'", "Name match by words, not exact; check it.")
    db.flush()
    return version


def write_slots(db: Session, catalog: Catalog, version, day: ProgramDay, spec: DaySpec) -> None:
    ordered = sorted(spec.slots, key=lambda s: (BLOCK_ORDER.index(s.block), s.row))
    counts: dict[str, int] = defaultdict(int)
    existing = {s.key: s for s in day.slots}
    keep = set()
    for position, s in enumerate(ordered):
        counts[s.code] += 1
        key = s.code if counts[s.code] == 1 else f"{s.code}.{counts[s.code]}"
        if s.code == "OPT":
            key = f"OPT{counts[s.code]}"
        region, muscle = region_for(s.target_muscle)
        if s.target_muscle and region is None and not s.routine:
            catalog.parsed.flag(
                spec.tab,
                s.row,
                f"{s.display_name}: target '{s.target_muscle}'",
                "No library region for this muscle wording; filed under Other.",
            )
            region, muscle = "Other", re.split(r"[/(]", s.target_muscle)[0].strip()
        exercises = []
        for name in s.names:
            ex = catalog.get(
                name,
                region=region,
                muscle=muscle,
                equipment=equipment_for(name),
                measure=s.target.measure if s.target else None,
                per_side=s.target.per_side if s.target else None,
                routine=s.routine or None,
            )
            catalog.alias(ex, s.display_name, name)
            exercises.append(ex)
        slot = existing.get(key) or ProgramSlot(key=key, day=day)
        slot.position = position
        slot.block = s.block
        slot.code = s.code
        slot.pattern = s.pattern
        slot.exercise_id = exercises[0].id
        slot.alt_exercise_id = exercises[1].id if len(exercises) > 1 else None
        slot.display_name = s.display_name
        slot.target_muscle = s.target_muscle or None
        slot.sets_min, slot.sets_max = s.sets if s.sets else (None, None)
        slot.sets_text = s.sets_text or None
        slot.measure = s.target.measure if s.target else Measure.REPS.value
        slot.target_min = s.target.lo if s.target else None
        slot.target_max = s.target.hi if s.target else None
        slot.target_text = s.target_text or None
        slot.per_side = bool(s.target and s.target.per_side)
        slot.optional = s.optional
        slot.loggable = s.loggable
        db.add(slot)
        db.flush()
        keep.add(key)
        if s.note:
            cue, cap, cap_lb = split_cap(s.note)
            for ex in exercises:
                if cue:
                    db.add(
                        Note(
                            kind=NoteKind.CUE.value,
                            text=cue,
                            exercise_id=ex.id,
                            program_version_id=version.id,
                            program_slot_id=slot.id,
                        )
                    )
                if cap:
                    db.add(
                        Note(
                            kind=NoteKind.CAP.value,
                            text=cap,
                            cap_lb=cap_lb,
                            exercise_id=ex.id,
                            program_version_id=version.id,
                            program_slot_id=slot.id,
                        )
                    )
    for key, slot in existing.items():
        if key not in keep:
            db.delete(slot)


def program_exercise_ids(version: ProgramVersion) -> set[int]:
    ids = set()
    for day in version.days:
        for slot in day.slots:
            ids.add(slot.exercise_id)
            if slot.alt_exercise_id:
                ids.add(slot.alt_exercise_id)
    return ids


def write_swaps(db: Session, catalog: Catalog, version, parsed: Parsed) -> None:
    in_program = program_exercise_ids(version)
    for sw in parsed.swaps:
        primary = catalog.find(sw.primary, "Substitutions", sw.row)
        if primary is None:
            primary = catalog.get(canonical(sw.primary))
            catalog.alias(primary, sw.primary)
        if primary.id not in in_program and parens(sw.primary):
            parsed.flag(
                "Substitutions",
                sw.row,
                sw.primary,
                f"Not in the program; in the library as '{primary.name}' (parenthetical dropped).",
            )
        for rank, wording in sw.subs:
            bare = strip_parens(wording)
            if re.search(r"\bor\b|\s\+\s", bare):
                parsed.flag(
                    "Substitutions",
                    sw.row,
                    f"{sw.primary} -> '{wording}'",
                    "Substitute names two exercises ('or' / '+'); not imported.",
                )
                continue
            sub = catalog.find(wording, "Substitutions", sw.row)
            if sub is None:
                sub = catalog.get(
                    canonical(wording),
                    region=primary.region,
                    muscle=primary.muscle,
                    equipment=equipment_for(canonical(wording)),
                )
                catalog.alias(sub, wording)
            if sub.id == primary.id:
                parsed.flag(
                    "Substitutions", sw.row, wording, "Substitute is the primary itself; skipped."
                )
                continue
            db.add(
                Swap(
                    program_version_id=version.id,
                    exercise_id=primary.id,
                    substitute_id=sub.id,
                    rank=rank,
                    note=parens(wording),
                )
            )
        db.flush()


def write_exclusions(db: Session, catalog: Catalog, version, parsed: Parsed) -> None:
    in_program = program_exercise_ids(version)
    for ex_spec in parsed.exclusions:
        name = canonical(ex_spec.movement)
        ex = catalog.by_name.get(name.lower())
        if ex is not None and ex.id in in_program:
            parsed.flag(
                "Parked - Review List",
                ex_spec.row,
                ex_spec.movement,
                "Same name as an exercise in the program; not marked excluded.",
            )
            continue
        if re.search(r",|\s/\s", name):
            parsed.flag(
                "Parked - Review List",
                ex_spec.row,
                ex_spec.movement,
                "Row names several movements; kept as one excluded entry, not split.",
            )
        ex = catalog.get(name)
        db.flush()
        db.add(
            Exclusion(
                exercise_id=ex.id,
                kind=ex_spec.kind,
                label=ex_spec.label,
                reason=ex_spec.reason,
                revisit=ex_spec.revisit,
                program_version_id=version.id,
            )
        )
    db.flush()


# ---------------------------------------------------------------- report


def write_report(parsed: Parsed, source_name: str, path: Path) -> None:
    manual = ""
    if path.exists():
        old = path.read_text(encoding="utf-8")
        if MANUAL_MARKER in old:
            manual = old.split(MANUAL_MARKER, 1)[1]
    lines = [
        "# Import obstacles (local only: internal_docs/ is gitignored)",
        "",
        f"Generated by `python -m app.importer` from `{source_name}` ({parsed.label}) on "
        f"{datetime.now().strftime('%Y-%m-%d %H:%M')}. Everything here was left out or "
        "simplified instead of guessed. Rows are spreadsheet row numbers.",
        "",
    ]
    by_tab: dict[str, list[Obstacle]] = defaultdict(list)
    for ob in parsed.obstacles:
        by_tab[ob.tab].append(ob)
    for tab, items in by_tab.items():
        lines += [f"## {tab}", ""]
        for ob in items:
            lines.append(f"- **Rows {ob.rows}:** {ob.what}  \n  {ob.why}")
        lines.append("")
    if not parsed.obstacles:
        lines += ["Nothing to report.", ""]
    lines += [MANUAL_MARKER]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + (manual or "\n"), encoding="utf-8")


def run(db: Session, path: Path, report: Path | None) -> tuple[ProgramVersion, Parsed]:
    parsed = parse_workbook(path)
    version = write(db, parsed, path.name)
    db.commit()
    if report is not None:
        write_report(parsed, path.name, report)
    return version, parsed


def main(argv: list[str]) -> int:
    from app.config import obstacles_path, program_xlsx_path
    from app.db import SessionLocal

    path = Path(argv[0]) if argv else program_xlsx_path()
    if path is None or not path.is_file():
        print("No spreadsheet: pass a path or set PROGRAM_XLSX_PATH in .env.", file=sys.stderr)
        return 2
    with SessionLocal() as db:
        version, parsed = run(db, path, obstacles_path())
        slots = sum(len(d.slots) for d in version.days)
        print(
            f"Imported {version.label}: {len(version.days)} days, {slots} slots, "
            f"{len(parsed.swaps)} swap rows, {len(parsed.exclusions)} exclusions, "
            f"{len(parsed.obstacles)} obstacles -> {obstacles_path()}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
