// Roast copy: dry wit, never personal, always paired with a concrete fix.
const FAIL = {
  lenient: [
    "A stranger could maybe read this. Maybe.",
    "Rough, but I've seen worse. Not today, though.",
  ],
  teacher: [
    "I've seen better handwriting on a prescription pad.",
    "The letters are there. The discipline is not.",
    "Your words are playing hide and seek. They won.",
  ],
  merciless: [
    "Calligraphy or nothing. This was nothing.",
    "My grandmother writes faster than you write clearly.",
    "Rejected. The red pen is out of ink and patience.",
  ],
};
const PASS = {
  lenient: ["Readable! The bar was low and you cleared it."],
  teacher: ["Clean. No excuses needed this time."],
  merciless: ["Flawless. Frame this page."],
};
// Near-miss praise: cleared the cutoff but only just (within 15 points).
// A "flawless" for an 88 under Merciless reads as the judge not paying
// attention, so near-misses get a raised eyebrow instead of a medal.
const BARELY = {
  lenient: ["Passed, but only because the bar was on the floor."],
  teacher: ["A pass. Barely. The red pen stays uncapped."],
  merciless: ["A pass, not calligraphy. The bar stays where it was."],
};
const NEAR_MISS_MARGIN = 15;
const FIXES = [
  "Slow down and finish each letter before starting the next.",
  "Keep your letters on the baseline — floaters get misread.",
  "Close your loops: open a's become u's.",
  "Space your words like you mean them.",
  "Make your ascenders earn their height.",
  "Your e's are collapsing — give them a backbone.",
];

export function roast(tier, passed, seed = 0, score = null) {
  let pool;
  if (!passed) {
    pool = FAIL[tier];
  } else if (score !== null && score - cutoffsFor(tier) < NEAR_MISS_MARGIN) {
    pool = BARELY[tier];
  } else {
    pool = PASS[tier];
  }
  const line = pool[seed % pool.length];
  const fix = passed ? "" : " " + FIXES[seed % FIXES.length];
  return line + fix;
}

export function cutoffsFor(tier) {
  return { lenient: 40, teacher: 65, merciless: 85 }[tier];
}

export function verdict(tier, score) {
  return score >= cutoffsFor(tier);
}

export const TIER_LABEL = { lenient: "Lenient", teacher: "Teacher", merciless: "Merciless" };
export const TIER_SUB = {
  lenient: "a stranger could probably read this",
  teacher: "no excuses",
  merciless: "calligraphy or nothing",
};
