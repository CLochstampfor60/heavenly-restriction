// Made-up demo data. Real programs and logs live only on the server, never in the repo.

// `last` is last session's sets for this exercise, by set number (the faded placeholders).
// `lastText` overrides the "last 140 × 10" line where plain weight × reps reads wrong.
// `pinned` notes follow the exercise everywhere: a `cue`, or a `cap` (load cap, "Binding Vow").
// `media` links open outside the app; uploaded clips and photos come with media upload.
const exercises = {
  pull: {
    name: 'Assisted Pull-up', region: 'Back › Lats', equip: 'Machine', also: 'biceps', grade: 'Grade 3',
    last: [{ w: 50, r: 8 }], lastText: 'last −50 lb assist × 8',
  },
  lat: {
    name: 'Lat Pulldown', region: 'Back › Lats', equip: 'Cable', also: 'biceps, rear delts', grade: 'Grade 2',
    pinned: [
      { kind: 'cue', text: 'Elbows under the bar, chest up. Pull to the collarbone, not the chin.' },
      { kind: 'cap', text: 'Cap at 150 lb for now; drop 10 lb if form breaks.' },
    ],
    media: [{ label: 'Coach video', url: 'https://example.com/lat-pulldown-form' }],
    last: [{ w: 140, r: 10 }, { w: 140, r: 9 }, { w: 140, r: 9 }, { w: 140, r: 8 }],
    subs: ['oneArmPulldown', 'straightArm'], same: ['pull'],
  },
  oneArmPulldown: {
    name: 'Single-Arm Cable Pulldown', region: 'Back › Lats', equip: 'Cable', last: [{ w: 60, r: 12 }],
  },
  straightArm: { name: 'Straight-Arm Pulldown', region: 'Back › Lats', equip: 'Cable', last: [{ w: 50, r: 15 }] },
  row: {
    name: 'Seated Cable Row', region: 'Back › Mid-back', equip: 'Cable', also: 'biceps, rear delts', grade: 'Grade 2',
    pinned: [{ kind: 'cue', text: 'Sit tall, ribs down. Squeeze for a one-count at the end of each rep.' }],
    last: [{ w: 120, r: 12 }, { w: 120, r: 11 }, { w: 120, r: 10 }],
    subs: ['chestRow', 'oneArmRow'], same: ['machineRow'],
  },
  chestRow: {
    name: 'Chest-Supported Row', region: 'Back › Mid-back', equip: 'Dumbbells', grade: 'Grade 3',
    last: [{ w: 50, r: 10 }], lastText: 'last 50 lb DBs × 10',
  },
  oneArmRow: { name: 'Single-Arm Cable Row', region: 'Back › Mid-back', equip: 'Cable', last: [{ w: 55, r: 12 }] },
  machineRow: { name: 'Machine Row', region: 'Back › Mid-back', equip: 'Machine', last: [{ w: 110, r: 10 }] },
  bandFace: {
    name: 'Band Face Pull', region: 'Back › Rear delts', equip: 'Bands', gear: 'Bands', alt: 'cableFace',
    last: [{ w: 0, r: 15 }], lastText: 'last heavy band × 15',
    subs: ['reversePec'], same: ['cableFace'],
  },
  cableFace: { name: 'Cable Face Pull', region: 'Back › Rear delts', equip: 'Cable', last: [{ w: 40, r: 15 }] },
  reversePec: { name: 'Reverse Pec Deck', region: 'Back › Rear delts', equip: 'Machine', last: [{ w: 70, r: 15 }] },
  hammer: {
    name: 'Hammer Curl', region: 'Arms › Biceps', equip: 'Dumbbells', also: 'forearms', grade: 'Grade 3',
    last: [{ w: 30, r: 12 }, { w: 30, r: 11 }, { w: 30, r: 10 }], lastText: 'last 30 lb DBs × 12',
    subs: ['ropeCurl'], same: ['inclineCurl'],
  },
  ropeCurl: { name: 'Cable Rope Curl', region: 'Arms › Biceps', equip: 'Cable', last: [{ w: 50, r: 12 }] },
  inclineCurl: {
    name: 'Incline DB Curl', region: 'Arms › Biceps', equip: 'Dumbbells',
    last: [{ w: 20, r: 10 }], lastText: 'last 20 lb DBs × 10',
  },
  lateralWalk: {
    name: 'Banded Lateral Walk', region: 'Hips › Glute med', equip: 'Hip Halo', gear: 'Hip Halo', alt: 'hipAbduction',
    last: [{ w: 0, r: 12 }], lastText: 'last 12 steps each way',
    subs: ['hipAbduction'], same: [],
  },
  hipAbduction: {
    name: 'Cable Hip Abduction', region: 'Hips › Glute med', equip: 'Cable', last: [{ w: 20, r: 12 }],
  },

  // Library only: other program days (`day`), and exercises kept out of the program (`excluded`).
  behindNeck: {
    name: 'Behind-the-Neck Pulldown', region: 'Back › Lats', equip: 'Cable', excluded: true, lastText: 'not logged',
  },
  deadBug: {
    name: 'Dead Bug', region: 'Core › Anti-extension', equip: 'Bodyweight', day: 'Push A', grade: 'Grade 3',
    lastText: 'last 3 × 10 each side', media: [{ label: 'Coach video', url: 'https://example.com/dead-bug' }],
  },
  abWheel: { name: 'Ab Wheel Rollout', region: 'Core › Anti-extension', equip: 'Ab wheel', day: 'Push B', lastText: 'last 8 reps' },
  pallof: {
    name: 'Pallof Press', region: 'Core › Anti-rotation', equip: 'Cable or Bands', day: 'Pull B',
    lastText: 'last 30 × 12 each side', media: [{ label: 'Setup video', url: 'https://example.com/pallof-press' }],
  },
  suitcase: {
    name: 'Suitcase Carry', region: 'Core › Anti-lateral-flexion', equip: 'Dumbbell', day: 'Push A',
    lastText: 'last 60 lb × 40 s each side',
  },
  dbBench: {
    name: 'Dumbbell Bench Press', region: 'Chest › Mid chest', equip: 'Dumbbells', day: 'Push A', grade: 'Grade 3',
    last: [{ w: 55, r: 10 }], lastText: 'last 55 lb DBs × 10',
  },
  inclineMachine: { name: 'Incline Machine Press', region: 'Chest › Upper chest', equip: 'Machine', day: 'Push B', last: [{ w: 90, r: 10 }] },
  cableFly: { name: 'Cable Fly', region: 'Chest › Mid chest', equip: 'Cable', day: 'Push B', last: [{ w: 25, r: 15 }] },
  landmine: {
    name: 'Half-Kneeling Landmine Press', region: 'Shoulders › Front delts', equip: 'Landmine', day: 'Push A',
    grade: 'Grade 3', last: [{ w: 45, r: 10 }], media: [{ label: 'Form check', url: 'https://example.com/landmine-press' }],
  },
  lateralRaise: { name: 'Cable Lateral Raise', region: 'Shoulders › Side delts', equip: 'Cable', day: 'Push B', last: [{ w: 15, r: 15 }] },
  uprightRow: {
    name: 'Upright Row', region: 'Shoulders › Side delts', equip: 'Barbell', excluded: true, lastText: 'not logged',
  },
  pushdown: { name: 'Rope Pushdown', region: 'Arms › Triceps', equip: 'Cable', day: 'Push A', last: [{ w: 50, r: 12 }] },
  goblet: {
    name: 'Goblet Box Squat', region: 'Legs › Quads', equip: 'Dumbbell', day: 'Legs', grade: 'Grade 2',
    last: [{ w: 60, r: 10 }], lastText: 'last 60 lb DB × 10', media: [{ label: 'Coach video', url: 'https://example.com/goblet-box-squat' }],
  },
  legPress: { name: 'Leg Press', region: 'Legs › Quads', equip: 'Machine', day: 'Legs', grade: 'Grade 3', last: [{ w: 230, r: 12 }] },
  rdl: { name: 'Dumbbell Romanian Deadlift', region: 'Legs › Hamstrings', equip: 'Dumbbells', day: 'Legs', last: [{ w: 45, r: 10 }], lastText: 'last 45 lb DBs × 10' },
  legCurl: { name: 'Seated Leg Curl', region: 'Legs › Hamstrings', equip: 'Machine', day: 'Legs', last: [{ w: 80, r: 12 }] },
  calfRaise: { name: 'Standing Calf Raise', region: 'Legs › Calves', equip: 'Machine', day: 'Legs', last: [{ w: 120, r: 15 }] },
  hipThrust: { name: 'Hip Thrust', region: 'Hips › Glutes', equip: 'Barbell', day: 'Legs', grade: 'Grade 3', last: [{ w: 135, r: 10 }] },
};

export const CATALOG = Object.fromEntries(
  Object.entries(exercises).map(([id, ex]) => [id, { id, ...ex }]),
);

// rest is in seconds.
export const PROGRAM = {
  name: 'Pull A',
  version: 'v1',
  slots: [
    { id: 's1', exercise: 'pull', sets: 4, reps: '6–8', rest: 120 },
    { id: 's2', exercise: 'lat', sets: 4, reps: '8–10', rest: 90 },
    { id: 's3', exercise: 'row', sets: 3, reps: '10–12', rest: 90 },
    { id: 's4', exercise: 'bandFace', sets: 3, reps: '15', rest: 60 },
    { id: 's5', exercise: 'hammer', sets: 3, reps: '10–12', rest: 60 },
    { id: 's6', exercise: 'lateralWalk', sets: 3, reps: '12', rest: 60 },
  ],
};

export const GEAR = ['Bands', 'Hip Halo', 'Straps'];

// Mid-workout: the first exercise is done, the second is two sets in and resting.
export const DEMO_SESSION = {
  status: { s1: 'done', s2: 'active' },
  logged: {
    s1: [{ w: 50, r: 8 }, { w: 50, r: 8 }, { w: 50, r: 7 }, { w: 50, r: 7 }],
    s2: [{ w: 140, r: 10 }, { w: 140, r: 10 }],
  },
  gear: { Bands: true, 'Hip Halo': false, Straps: true },
  restLeft: 72,
};
