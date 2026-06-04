// Standalone correctness check for parseTime() — no test framework in this repo,
// so this is a plain script: `npm run build` then run the compiled output, e.g.
//
//   TZ=UTC          node dist/parseTime.check.js
//   TZ=Asia/Bangkok node dist/parseTime.check.js
//
// Both runs must print identical UTC instants and exit 0. That proves parseTime is
// independent of the server process's local timezone — the property that was broken
// when it parsed a suffix-less datetime string (correct only on a UTC host like
// Render). The pre-fix code passes under TZ=UTC but fails under TZ=Asia/Bangkok.

import { parseTime } from "./scheduler.js";

// Fixed reference instants make the expected outputs deterministic regardless of
// "today" or the host TZ. Each case pins a zone-local date via `date`.
const cases: Array<{
  label: string;
  time: string;
  zone: string;
  ref: Date;
  expected: string;
}> = [
  // No DST, east of UTC.
  { label: "Riyadh (+03)", time: "12:29", zone: "Asia/Riyadh", ref: new Date("2026-06-04T00:00:00Z"), expected: "2026-06-04T09:29:00.000Z" },
  { label: "Bangkok (+07)", time: "12:29", zone: "Asia/Bangkok", ref: new Date("2026-06-04T00:00:00Z"), expected: "2026-06-04T05:29:00.000Z" },
  // UTC: must be a pure passthrough.
  { label: "UTC (+00)", time: "12:29", zone: "UTC", ref: new Date("2026-06-04T00:00:00Z"), expected: "2026-06-04T12:29:00.000Z" },
  // West of UTC, with a zone-local date that rolls back a day from the ref instant.
  // Summer = EDT (-04); winter = EST (-05) — same zone, proving the offset is
  // computed per-date, not hardcoded.
  { label: "New York summer (EDT -04)", time: "12:29", zone: "America/New_York", ref: new Date("2026-06-04T00:00:00Z"), expected: "2026-06-03T16:29:00.000Z" },
  { label: "New York winter (EST -05)", time: "12:29", zone: "America/New_York", ref: new Date("2026-01-15T00:00:00Z"), expected: "2026-01-14T17:29:00.000Z" },
];

let failures = 0;
const hostTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log(`parseTime check — host TZ=${hostTz} (process.env.TZ=${process.env.TZ ?? "<unset>"})`);

for (const c of cases) {
  const got = parseTime(c.time, c.zone, c.ref).toISOString();
  const ok = got === c.expected;
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${c.label}: parseTime("${c.time}","${c.zone}") -> ${got}${ok ? "" : `  (expected ${c.expected})`}`);
}

// The literal artifact named in the task: this exact line must be byte-identical
// across `TZ=UTC` and `TZ=Asia/Bangkok` runs (uses real "today", so compare two
// runs launched close together).
console.log(`  live: parseTime("12:29","Asia/Riyadh") (today) -> ${parseTime("12:29", "Asia/Riyadh").toISOString()}`);

if (failures > 0) {
  console.error(`\n${failures} case(s) FAILED — parseTime is not timezone-independent.`);
  process.exit(1);
}
console.log("\nAll cases passed.");
process.exit(0);
