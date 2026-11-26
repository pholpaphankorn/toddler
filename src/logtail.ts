// Cuts and cleans CI / verify output so it is safe to hand to an agent or store in state.json.
const MAX_LINES = 200;
const MAX_BYTES = 16 * 1024;
const TOTAL_BYTES = 48 * 1024;

const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /Authorization:[ \t]*Bearer[ \t]+\S+/gi,
  /\bgh[pos]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_\w{20,}/g,
  /\bglpat-[\w-]{20,}/g,
  /\bsk-ant-[\w-]{20,}/g,
  /\bsk-[\w-]{20,}/g,
  /\bAKIA[0-9A-Z]{16}/g,
  /\bxox[bp]-[\w-]{10,}/g,
];
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;
const GH_PREFIX = /^[^\t\n]*\t[^\t\n]*\t\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const GITLAB_SECTION = /section_(?:start|end):\d+:[\w.-]+(?:\[[^\]]*\])?/g;
// \r is handled per line before this runs; only \t and \n survive.
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g;

function clean(text: string): string[] {
  const out = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(GH_PREFIX, "")
        .replace(GITLAB_SECTION, "")
        .split("\r")
        .pop()!,
    )
    .join("\n")
    .replace(ANSI, "")
    .replace(CONTROL, "");
  return SECRETS.reduce((s, re) => s.replace(re, "[redacted]"), out).split(
    "\n",
  );
}

const bytes = (text: string) => Buffer.byteLength(text);

// Last `limit` bytes of one line, without splitting a multibyte character.
function tailBytes(line: string, limit: number): string {
  const buffer = Buffer.from(line);
  let start = buffer.length - limit;
  while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start++;
  return buffer.subarray(start).toString();
}

export function logTail(text: string): string {
  const all = clean(text);
  while (all.length && all[all.length - 1] === "") all.pop();
  let kept = all.slice(-MAX_LINES);
  let size = 0;
  let from = kept.length;
  while (from > 0 && size + bytes(kept[from - 1]!) + 1 <= MAX_BYTES)
    size += bytes(kept[--from]!) + 1;
  kept = kept.slice(from);
  // One line alone over the cap: keep its end.
  if (!kept.length && all.length) kept = [tailBytes(all.at(-1)!, MAX_BYTES)];
  const cut = all.length - kept.length;
  return (cut ? [`[… ${cut} earlier lines cut]`, ...kept] : kept).join("\n");
}

export interface FailingCheck {
  name: string;
  link?: string;
  log?: string;
}
export interface CheckTail {
  name: string;
  link?: string;
  tail?: string;
}
// Checks in the given order each get a tail until the 48 KB budget runs out; the rest are names only.
export function logTails(checks: FailingCheck[]): {
  checks: CheckTail[];
  note?: string;
} {
  let used = 0;
  let exhausted = false;
  let more = 0;
  const out = checks.map(({ name, link, log }): CheckTail => {
    if (log === undefined) return { name, link };
    const tail = exhausted ? undefined : logTail(log);
    if (tail !== undefined && used + bytes(tail) <= TOTAL_BYTES) {
      used += bytes(tail);
      return { name, link, tail };
    }
    exhausted = true;
    more++;
    return { name, link };
  });
  return {
    checks: out,
    note: more ? `[${more} more failing checks: names only]` : undefined,
  };
}

// A fence one backtick longer than the longest run inside the tail (min 3).
export function fence(tail: string): string {
  const longest = Math.max(
    0,
    ...(tail.match(/`+/g) ?? []).map((run) => run.length),
  );
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}\n${tail}\n${ticks}`;
}
