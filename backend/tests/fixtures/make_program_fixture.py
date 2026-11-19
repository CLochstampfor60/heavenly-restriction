"""Builds demo_program.xlsx: a small MADE-UP program with the same tab layout as the real one.

Every name, note and number here is invented for tests. Never paste real program content in.

    .\\.venv\\Scripts\\python backend\\tests\\fixtures\\make_program_fixture.py
"""

from pathlib import Path

import openpyxl

OUT = Path(__file__).with_name("demo_program.xlsx")
DASH = "—"


def sheet(wb, title, rows):
    ws = wb.create_sheet(title)
    for r, row in enumerate(rows, start=1):
        if row is None:
            continue
        for c, value in enumerate(row, start=1):
            if value is not None:
                ws.cell(row=r, column=c, value=value)
    return ws


def build() -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    sheet(
        wb,
        "Program Overview",
        [
            ["DEMO PROGRAM " + DASH + " TEST FIXTURE (v9.1)"],
            ["Made-up data for tests."],
            None,
            ["CORE: two anti-movement moves per day, made-up rule."],
            None,
            ["Forearm block", "Made-up line: on Mon / Thu only."],
        ],
    )
    upper = ["#", "Exercise", "Pattern", "Target Muscle", "Sets", "Reps", "Notes / Cues"]
    sheet(
        wb,
        f"Gym 1 {DASH} Upper A (Mon)",
        [
            ["GYM 1: UPPER A " + DASH + " Demo"],
            ["~30 min demo | then cardio"],
            None,
            upper,
            ["WU", "Demo Warm-up Circuit", DASH, "Prep", "1 round each", DASH, "Demo warm-up."],
            [
                "1",
                "Demo Pulldown " + DASH + " wide grip",
                "PULL",
                "Lats (width)",
                "2",
                "10-12",
                "Demo cue one.",
            ],
            [
                "2",
                "Assisted Demo Pull-Up (neutral)",
                "PULL",
                "Lats / Upper back",
                "3",
                "6-8",
                "Demo assisted cue.",
            ],
            [
                "3",
                "Seated Demo or Machine Press",
                "PUSH",
                "Front delts",
                "3",
                "8-12",
                "Demo either-or cue.",
            ],
            [
                "4",
                "Demo Y-Raise with hold",
                "PUSH",
                "Lower traps",
                "2",
                "6-8 + 10-12 s hold on last rep",
                "Demo compound target.",
            ],
            ["C1", "Demo Pallof Press", "CORE", "Anti-rotation", "2", "10 / side", "Demo core."],
            ["C2", "Demo Carry (straps)", "CORE", "Anti-lateral-flexion", "2", "30 s / side", None],
            ["F1", "Demo Wrist Curl", "FOREARM", "Wrist flexors", "2", "15-20", None],
            ["F2", "Demo Wrist Wave", "FOREARM", "Wrist flexors", "2", "8-10 / side", None],
            [
                "OPT",
                "Demo Dips (assisted to start)",
                "PUSH",
                "Triceps / Chest",
                "2-3",
                "5-8",
                "Optional demo.",
            ],
            ["CD", "Demo Cool-down Circuit", DASH, "Recovery", "1 round", DASH, None],
            ["TOTAL: made-up total"],
            ["Cardio after: 10 min air bike (demo note) + 15 min incline walk at 4.0 / 2.0 MPH."],
            ["Optional supersets for time: pair 3+4 (demo)."],
            None,
            ["REFERENCE " + DASH + " WARM-UP (demo)"],
            [1, "Demo Step", DASH, "Glutes", "1", "10 R / 10 L", "Demo."],
        ],
    )
    sheet(
        wb,
        f"Gym 2 {DASH} Legs (Wed)",
        [
            ["GYM 2: LEGS " + DASH + " Demo"],
            ["~30 min demo"],
            None,
            ["#", "Exercise", "Target Muscle", "Sets", "Reps", "Notes / Cues", "Guide Source"],
            [
                "1",
                "Demo Squat (barbell)",
                "Quads / Glutes",
                "3",
                "6-8",
                "Made-up cue. CAP 100 LB. Another made-up sentence.",
                "Demo",
            ],
            ["2", "Demo Leg Curl", "Hamstrings", "3", "10-12", None, None],
            ["C1", "Demo Plank", "Anti-extension core", "3", "20-30 s", None, "Core"],
            ["C2", "Demo Pallof Press", "Anti-rotation core", "2", "10 / side", None, "Core"],
            ["Cardio after: 10 min air bike + 15 min incline walk at 4.0 / 2.0 MPH."],
        ],
    )
    sheet(
        wb,
        f"Gym 3 {DASH} Upper B (Thu)",
        [
            ["GYM 3: UPPER B " + DASH + " Demo"],
            ["~30 min demo"],
            None,
            upper,
            ["1", "Demo Row", "PULL", "Mid-back", "3", "8-12", None],
            ["C1", "Demo Hollow Hold", "CORE", "Anti-extension", "3", "20-30 s", None],
            ["F1", "Demo Wrist Curl", "FOREARM", "Wrist flexors", "2", "15-20", None],
        ],
    )
    sheet(
        wb,
        "Sat & Sun",
        [
            ["SAT & SUN " + DASH + " DEMO (v9.0)"],
            ["Made-up weekend."],
            None,
            ["#", "Movement", "Target", "Dose", "Notes / Cues"],
            ["SATURDAY " + DASH + " CARDIO"],
            ["1", "Demo Hip Activation", "Glutes", "1 round (4 min)", "Demo."],
            ["2", "Air Bike", "Conditioning", "20 min", "Demo bike."],
            ["3", "Incline Treadmill Walk", "Conditioning", "20 min", "Incline 4.0 @ 2.0 MPH."],
            ["SATURDAY " + DASH + " OPTIONAL PUMP WORK"],
            ["OPT", "Demo Lateral Raise (any version)", "Side delts", "3 x 12-15", "Demo."],
            ["OPT", "Demo Pulldown " + DASH + " wide grip", "Lats", "2-3 x 10-12", "Demo."],
            ["SUNDAY " + DASH + " RECOVERY"],
            ["1", "Walk", "Active recovery", "40 min, by feel", "Demo walk."],
            ["2", "Demo Hip Recovery (half reps)", "Hips", "1 round (4 min)", "Demo."],
            ["3", "Demo Curl-Up", "Anterior core", "3 descending sets (5-3-1)", "Demo."],
            ["DAILY HOME BLOCK (demo)"],
            ["1", "Demo Foot Drill", "Arch", "2 x 6-8", "Demo."],
        ],
    )
    sheet(
        wb,
        "Substitutions",
        [
            ["SUBSTITUTIONS (demo)"],
            None,
            ["PART 1 " + DASH + " MACHINE SWAPS"],
            ["Primary Exercise", "Substitution 1", "Substitution 2"],
            ["Demo Pulldown (wide)", "Demo Machine Pulldown", "Demo Row"],
            ["Assisted Demo Pull-Up", "Demo Band Pull-Up (assisted)", "Demo A or Demo B"],
            ["Demo Squat", "Demo Belt Squat (better)", "Demo Leg Press"],
            ["Demo Plank", "Side Hold", "Demo Hollow Hold"],
            None,
            ["See the other tabs (demo)."],
        ],
    )
    sheet(
        wb,
        "Parked " + DASH + " Review List",
        [
            ["PARKED (demo)"],
            None,
            ["SECTION A " + DASH + " PARKED BY GOAL"],
            ["Movement", "Status", "Why parked", "Revisit if..."],
            ["Demo Shrug", "GOAL", "Made-up goal reason.", "Made-up revisit."],
            None,
            ["SECTION B " + DASH + " PARKED FOR SPINE / JOINT"],
            ["Movement", "Reason", "Why parked", "Would need..."],
            ["Demo Jump, demo hop", "DEMO JOINT", "Made-up joint reason.", "Made-up clearance."],
            ["Demo Leg Curl", "DEMO", "Same name as a program exercise.", "-"],
            None,
            ["Closing made-up paragraph."],
        ],
    )
    sheet(wb, "Demo Extras", [["A tab the importer does not read."], ["Row two."]])
    return wb


if __name__ == "__main__":
    build().save(OUT)
    print(f"Wrote {OUT}")
