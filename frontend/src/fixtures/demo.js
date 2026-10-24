// Made-up demo data. Real programs and logs live only on the server, never in the repo.

// `last` is last session's sets for this exercise, by set number (the faded placeholders).
// `lastText` overrides the "last 140 × 10" line where plain weight × reps reads wrong.
const exercises = {
  pull: {
    name: 'Assisted Pull-up', region: 'Back › Lats',
    last: [{ w: 50, r: 8 }], lastText: 'last −50 lb assist × 8',
  },
  lat: {
    name: 'Lat Pulldown', region: 'Back › Lats',
    note: 'Elbows under the bar, chest up. Cap at 150 lb for now; drop 10 lb if form breaks.',
    last: [{ w: 140, r: 10 }, { w: 140, r: 9 }, { w: 140, r: 9 }, { w: 140, r: 8 }],
  },
  row: {
    name: 'Seated Cable Row', region: 'Back › Mid-back',
    last: [{ w: 120, r: 12 }, { w: 120, r: 11 }, { w: 120, r: 10 }],
    subs: ['chestRow', 'oneArmRow'], same: ['machineRow'],
  },
  chestRow: {
    name: 'Chest-Supported Row', region: 'Back › Mid-back',
    last: [{ w: 50, r: 10 }], lastText: 'last 50 lb DBs × 10',
  },
  oneArmRow: { name: 'Single-Arm Cable Row', region: 'Back › Mid-back', last: [{ w: 55, r: 12 }] },
  machineRow: { name: 'Machine Row', region: 'Back › Mid-back', last: [{ w: 110, r: 10 }] },
  bandFace: {
    name: 'Band Face Pull', region: 'Back › Rear delts', gear: 'Bands', alt: 'cableFace',
    last: [{ w: 0, r: 15 }], lastText: 'last heavy band × 15',
    subs: ['reversePec'], same: ['cableFace'],
  },
  cableFace: { name: 'Cable Face Pull', region: 'Back › Rear delts', last: [{ w: 40, r: 15 }] },
  reversePec: { name: 'Reverse Pec Deck', region: 'Back › Rear delts', last: [{ w: 70, r: 15 }] },
  hammer: {
    name: 'Hammer Curl', region: 'Arms › Biceps',
    last: [{ w: 30, r: 12 }, { w: 30, r: 11 }, { w: 30, r: 10 }], lastText: 'last 30 lb DBs × 12',
    subs: ['ropeCurl'], same: ['inclineCurl'],
  },
  ropeCurl: { name: 'Cable Rope Curl', region: 'Arms › Biceps', last: [{ w: 50, r: 12 }] },
  inclineCurl: {
    name: 'Incline DB Curl', region: 'Arms › Biceps',
    last: [{ w: 20, r: 10 }], lastText: 'last 20 lb DBs × 10',
  },
  lateralWalk: {
    name: 'Banded Lateral Walk', region: 'Hips › Glute med', gear: 'Hip Halo', alt: 'hipAbduction',
    last: [{ w: 0, r: 12 }], lastText: 'last 12 steps each way',
    subs: ['hipAbduction'], same: [],
  },
  hipAbduction: { name: 'Cable Hip Abduction', region: 'Hips › Glute med', last: [{ w: 20, r: 12 }] },
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
