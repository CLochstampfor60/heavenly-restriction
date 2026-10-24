// Made-up past sessions, oldest first. Each exercise's newest session matches its `last` in demo.js.
// sets are [weight, reps]; a stop records the set it happened on (0-based), the load and the symptom.
export const HISTORY = {
  lat: [
    { date: '2026-08-29', sets: [[130, 10], [130, 10], [130, 9], [130, 8]] },
    { date: '2026-09-05', sets: [[132.5, 10], [132.5, 10], [132.5, 9], [130, 9]] },
    { date: '2026-09-12', sets: [[135, 9], [135, 9], [135, 8], [130, 9]] },
    { date: '2026-09-19', sets: [[135, 10], [135, 10], [135, 9], [135, 8]] },
    { date: '2026-10-03', sets: [[140, 10], [145, 4]], stop: { set: 1, symptom: 'Pinch' } },
    { date: '2026-10-10', sets: [[140, 10], [140, 10], [140, 9], [135, 9]] },
    {
      date: '2026-10-17', sets: [[140, 10], [140, 9], [140, 9], [140, 8]],
      note: 'Cable machine 2 had a sticky pulley.',
    },
  ],
  row: [
    { date: '2026-09-19', sets: [[110, 12], [110, 12], [110, 11]] },
    { date: '2026-09-26', sets: [[115, 12], [115, 11], [115, 10]] },
    { date: '2026-10-03', sets: [[115, 12], [115, 12], [115, 11]] },
    { date: '2026-10-10', sets: [[120, 11], [120, 10], [115, 11]] },
    { date: '2026-10-17', sets: [[120, 12], [120, 11], [120, 10]] },
  ],
  hammer: [
    { date: '2026-10-03', sets: [[25, 12], [25, 12], [25, 11]] },
    { date: '2026-10-10', sets: [[30, 10], [30, 10], [25, 12]], note: 'Left grip faded on set 3.' },
    { date: '2026-10-17', sets: [[30, 12], [30, 11], [30, 10]] },
  ],
};
