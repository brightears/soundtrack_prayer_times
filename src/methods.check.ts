// Standalone correctness check for CALCULATION_METHODS — no test framework in this
// repo, so this is a plain script: `npm run build` then
//
//   node dist/methods.check.js          # offline anchors
//   node dist/methods.check.js --live   # also diff every id against api.aladhan.com
//
// The map's key is sent to Aladhan verbatim, so a wrong key computes prayer times with
// a different authority. Before migration 008 the map was off by one for ids >= 7:
// "JAKIM" was stored as 16 (really Dubai) and "KEMENAG" as 19 (really Algeria).

import { CALCULATION_METHODS } from "./aladhan.js";

let failures = 0;
function expect(cond: boolean, msg: string): void {
  console.log(`${cond ? "  ok  " : "  FAIL"} ${msg}`);
  if (!cond) failures++;
}

const m = CALCULATION_METHODS;
console.log("methods check — offline anchors");
expect(m[3] === "Muslim World League", "3 is Muslim World League");
expect(m[4].startsWith("Umm Al-Qura"), "4 is Umm Al-Qura (Saudi)");
expect(m[7].includes("Tehran"), "7 is Tehran");
expect(m[8] === "Gulf Region", "8 is Gulf Region");
expect(m[11].startsWith("Majlis Ugama Islam Singapura"), "11 is MUIS Singapore");
expect(m[16] === "Dubai", "16 is Dubai (NOT JAKIM)");
expect(m[17].includes("JAKIM"), "17 is JAKIM (Malaysia)");
expect(m[20].includes("Kementerian Agama"), "20 is KEMENAG (Indonesia)");
expect(m[23].includes("Jordan"), "23 is Jordan");
expect(!(6 in m) && !(99 in m), "ids 6 and 99 are not offered");

const live = process.argv.includes("--live");
const norm = (s: string) =>
  s
    .replace(/\(experimental\)|\(moonsighting\.com\)/g, "")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z]/g, "");

async function main(): Promise<void> {
  if (live) {
    console.log("methods check — live diff against api.aladhan.com/v1/methods");
    const res = await fetch("https://api.aladhan.com/v1/methods");
    const json = (await res.json()) as { data: Record<string, { id: number; name: string | null }> };
    for (const [id, label] of Object.entries(m)) {
      const real = Object.values(json.data).find((r) => r.id === Number(id));
      const realName = real?.name ?? null;
      // Compare on a normalised prefix: our labels may add e.g. "(KEMENAG)" for findability.
      const ok =
        !!realName &&
        (norm(label).startsWith(norm(realName).slice(0, 12)) ||
          norm(realName).startsWith(norm(label).slice(0, 12)));
      expect(ok, `${id}: "${label}"  ~  Aladhan "${realName}"`);
    }
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
