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
const FIXES = [
  "Slow down and finish each letter before starting the next.",
  "Keep your letters on the baseline — floaters get misread.",
  "Close your loops: open a's become u's.",
  "Space your words like you mean them.",
  "Make your ascenders earn their height.",
  "Your e's are collapsing — give them a backbone.",
];

export function roast(tier, passed, seed = 0) {
  const pool = passed ? PASS[tier] : FAIL[tier];
  const line = pool[seed % pool.length];
  const fix = passed ? "" : " " + FIXES[seed % FIXES.length];
  return line + fix;
}

export function verdict(tier, score) {
  const cutoffs = { lenient: 40, teacher: 65, merciless: 85 };
  return score >= cutoffs[tier];
}

export const TIER_LABEL = { lenient: "Lenient", teacher: "Teacher", merciless: "Merciless" };
export const TIER_SUB = {
  lenient: "a stranger could probably read this",
  teacher: "no excuses",
  merciless: "calligraphy or nothing",
};
