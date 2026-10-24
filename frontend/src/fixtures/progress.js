// Made-up progress data for October 2026. Lift sessions, records and PR days come from
// history.js instead, so the Progress screen and the exercise cards agree.

// [axis label, value]; a third value marks a planned (not yet done) cardio bar.
export const SERIES = {
  body: {
    tab: 'Weight', icon: 'scale', name: 'Bodyweight', unit: 'lb', goal: 185, goalLabel: 'Goal 185',
    ranges: {
      month: { title: 'October 2026', pts: [['10/4', 196.4], ['10/11', 195.8], ['10/18', 194.6], ['10/24', 194.0]] },
      year: {
        title: 'Nov 2025 – Oct 2026',
        pts: [['N', 204.0], ['D', 203.1], ['J', 202.5], ['F', 201.0], ['M', 200.2], ['A', 199.6],
          ['M', 199.0], ['J', 198.1], ['J', 197.5], ['A', 197.0], ['S', 196.2], ['O', 194.6]],
      },
    },
  },
  waist: {
    tab: 'Waist', icon: 'tape', name: 'Waist', unit: 'in', goal: 34, goalLabel: 'Goal 34',
    ranges: {
      month: { title: 'October 2026', pts: [['10/4', 37.5], ['10/11', 37.25], ['10/18', 37.0], ['10/24', 37.0]] },
      year: {
        title: 'Nov 2025 – Oct 2026',
        pts: [['N', 39.5], ['D', 39.25], ['J', 39.0], ['F', 38.75], ['M', 38.5], ['A', 38.5],
          ['M', 38.25], ['J', 38.0], ['J', 37.75], ['A', 37.5], ['S', 37.25], ['O', 37.0]],
      },
    },
  },
  // Month comes from Lat Pulldown's sessions; this is the year view.
  lift: {
    tab: 'Lift', icon: 'dumbbell', name: 'Lat Pulldown · est. 1RM', unit: 'lb', goal: 190, goalLabel: 'Grade 1 · 190',
    exercise: 'lat',
    ranges: {
      year: {
        title: 'Nov 2025 – Oct 2026',
        pts: [['N', 150.0], ['D', 153.3], ['J', 156.0], ['F', 158.7], ['M', 160.0], ['A', 163.3],
          ['M', 166.7], ['J', 170.0], ['J', 172.0], ['A', 173.3], ['S', 180.0], ['O', 186.7]],
      },
    },
  },
  cardio: {
    tab: 'Cardio', icon: 'pulse', name: 'Cardio minutes', unit: 'min', goal: 345, goalLabel: 'Target 345',
    ranges: {
      week: {
        title: 'Oct 19 – 25', goal: false,
        pts: [['M', 30], ['T', 25], ['W', 60], ['T', 0], ['F', 35], ['S', 0, 45], ['S', 0]],
      },
      month: { title: 'October 2026 · per week', pts: [['10/4', 330], ['10/11', 350], ['10/18', 300], ['10/25', 150]] },
      year: {
        title: 'Nov 2025 – Oct 2026 · weekly avg',
        pts: [['N', 250], ['D', 220], ['J', 260], ['F', 280], ['M', 300], ['A', 310],
          ['M', 320], ['J', 340], ['J', 335], ['A', 345], ['S', 340], ['O', 325]],
      },
    },
  },
};

// Year views end with this month: [year, month 1-12].
export const YEAR_END = [2026, 10];

export const SETS_TARGET = 10;
export const MUSCLE_SETS = [['Back', 16], ['Legs', 14], ['Chest', 12], ['Arms', 10], ['Shoulders', 9], ['Core', 8]];

// Strength days are Mon, Tue, Thu, Fri and Sat; Wednesday is cardio, Sunday recovery.
// Saturdays match Pull A in history.js (Oct 3 had the stop event).
const EXCEPTIONS = { '2026-10-03': 'stop', '2026-10-08': 'skip', '2026-10-15': 'partial', '2026-10-20': 'skip' };
const BY_WEEKDAY = ['rest', 'done', 'done', 'cardio', 'done', 'done', 'done']; // Sun..Sat

export function calendarStatus(key) {
  if (EXCEPTIONS[key]) return EXCEPTIONS[key];
  const [y, m, d] = key.split('-').map(Number);
  return BY_WEEKDAY[new Date(y, m - 1, d).getDay()];
}
