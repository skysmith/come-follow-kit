// lib/cfm.ts
import * as cheerio from "cheerio";

// ---------- helpers ----------
const ascii = (s: string) => s.replace(/[\u2010-\u2015]/g, "-");
const squish = (s: string) => s.replace(/\s+/g, " ").trim();
const lc = (s: string) => squish(ascii(s)).toLowerCase();

const MON_IDX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
};

function toDateUTC(y: number, m3: string, d: number) {
  return new Date(Date.UTC(y, MON_IDX[m3], d, 12, 0, 0)); // noon UTC
}
function mondayOfUTC(dt: Date) {
  const d = new Date(dt);
  const wd = d.getUTCDay(); // Sun=0
  const diff = wd === 0 ? -6 : 1 - wd;
  d.setUTCDate(d.getUTCDate() + diff);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}
function daysBetween(a: Date, b: Date) {
  return Math.round((+a - +b) / (24 * 3600 * 1000));
}

type Item = {
  rangeRaw: string;   // e.g., "Nov 3–9, 2025"
  start: Date;        // monday (UTC)
  title: string;
  refs: string[];
  href?: string;      // link to the week page
};

const TTL = 5 * 60 * 1000;
let memo: { t: number; items: Item[] } | null = null;

async function fetchHTML(url: string) {
  const resp = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  return await resp.text();
}

// ---------- refs extraction + tidying ----------
const PROPER = { dc: "Doctrine and Covenants" };

function normDash(s: string) {
  return s.replace(/[\u2012-\u2015]/g, "–");
}
function canonBook(s: string) {
  return s.replace(/\b(d&c|doctrine\s+and\s+cov(e|a)nants)\b/gi, PROPER.dc);
}

function extractRefs(raw: string): string[] {
  const txt = lc(raw);
  const r =
    /\b(?:1|2|3)?\s?(?:nephi|jacob|enos|jarom|omni|words of mormon|mosiah|alma|helaman|3 nephi|4 nephi|mormon|ether|moroni|matthew|mark|luke|john|acts|romans|psalms|isaiah|moses|abraham|doctrine and covenants|d&c|joseph smith—history|pearl of great price)\b[^.|;)\]]*/gi;
  const out = (txt.match(r) || [])
    .map(s => squish(canonBook(s)))
    .map(normDash);
  return Array.from(new Set(out));
}

function tidyReferences(raw: string[], href?: string): string[] {
  const out: string[] = [];

  // 1) infer chapter range from URL (e.g., .../125-128)
  const m = href?.match(/\/(\d{1,3})-(\d{1,3})(?:\?|$)/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a && b && a <= b) out.push(`${PROPER.dc} ${a}–${b}`);
  }

  // 2) pull explicit chapter/verse refs
  const inside: string[] = [];
  for (const t of raw) {
    const s = canonBook(normDash(t.toLowerCase()));
    const rx = /\bDoctrine and Covenants\s+(\d{1,3})(?::\d{1,3}(?:[–-]\d{1,3})?)?\b/g;
    let m2: RegExpExecArray | null;
    while ((m2 = rx.exec(s))) inside.push(m2[0]);
  }

  const clean = Array.from(new Set([...out, ...inside]))
    .map(x => x.replace(/-+/g, "–").replace(/\s+/g, " ").trim())
    .filter(x => /\d/.test(x) && x.length <= 40);

  if (!clean.length) {
    const all = raw.join(" ");
    const m3 = all.match(/\b(?:Doctrine and Covenants|D&?C)[^0-9]*(\d{1,3})\s*[–-]\s*(\d{1,3})\b/i);
    if (m3) clean.push(`${PROPER.dc} ${m3[1]}–${m3[2]}`);
  }

  return clean;
}

// ---------- parsing ----------
function parseRangeStart(rangeText: string): Date | null {
  const t = lc(rangeText);
  const y = +(t.match(/\b(20\d{2})\b/)?.[1] || new Date().getUTCFullYear());
  // monthA dayA – monthB dayB
  let m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\s*[-–]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})/);
  if (m) return mondayOfUTC(toDateUTC(y, m[1], +m[2]));
  // month dayA – dayB
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (m) return mondayOfUTC(toDateUTC(y, m[1], +m[2]));
  return null;
}

async function loadItems(): Promise<Item[]> {
  if (memo && Date.now() - memo.t < TTL) return memo.items;

  const url = "https://www.churchofjesuschrist.org/study/manual/come-follow-me-for-home-and-church-doctrine-and-covenants-2025?lang=eng";
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const seen: Record<string, Item> = {};

  // walk anchors and nearby blocks so we can grab both text and href
  $("a, section, article, li, div").each((_, el) => {
    const raw = $(el).text();
    const t = lc(raw);

    const rangeMatch = t.match(
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\s*[-–]\s*(?:[a-z]+)?\s?\d{1,2}(?:,?\s*\d{4})?\b/
    );
    if (!rangeMatch) return;

    const rangeRaw = squish(raw.substring(rangeMatch.index!, rangeMatch.index! + rangeMatch[0].length));
    const start = parseRangeStart(rangeRaw);
    if (!start) return;

    // link hunting
    let href: string | undefined;
    const selfHref = ($(el).is("a") && $(el).attr("href")) || undefined;
    if (selfHref) href = selfHref as string;
    if (!href) {
      const aChild = $(el).find("a[href]").first();
      if (aChild && aChild.attr("href")) href = aChild.attr("href") as string;
    }
    if (!href) {
      const aPar = $(el).parents("a[href]").first();
      if (aPar && aPar.attr("href")) href = aPar.attr("href") as string;
    }
    if (href && href.startsWith("/")) {
      href = "https://www.churchofjesuschrist.org" + href;
    }

    const title =
      (raw.match(/“[^”]+”/)?.[0] || raw.split(/[|•\n.]/)[0] || "").replace(/[“”]/g, "").trim();
    const refs = extractRefs(raw);

    const key = +start;
    if (!seen[key]) {
      seen[key] = { rangeRaw, start, title, refs, href };
    } else {
      if (!seen[key].href && href) seen[key].href = href;
      if (refs.length > seen[key].refs.length) seen[key].refs = refs;
      if (!seen[key].title && title) seen[key].title = title;
    }
  });

  const items = Object.values(seen).sort((a, b) => +a.start - +b.start);
  memo = { t: Date.now(), items };
  return items;
}

async function enrichFromDetailPage(href: string): Promise<{ title?: string; refs: string[] } | null> {
  try {
    const html = await fetchHTML(href);
    const $ = cheerio.load(html);

    let bodyText = "";
    const candidates = [
      "[data-content]","article","main",".article",".content",".study-content",".body",".layout","body"
    ];
    for (const sel of candidates) if ($(sel).length) bodyText += " " + $(sel).text();

    const refs = extractRefs(bodyText);
    const title =
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      undefined;

    return { title, refs };
  } catch {
    return null;
  }
}

// ---------- public api ----------
export async function fetchCFMForWeekByDate(weekStartMondayUTC: Date) {
  const items = await loadItems();

  // nearest start within ±3 days
  let best: Item | null = null;
  let bestAbs = Infinity;
  for (const it of items) {
    const diff = Math.abs(daysBetween(it.start, weekStartMondayUTC));
    if (diff < bestAbs) { best = it; bestAbs = diff; }
  }
  if (!best || bestAbs > 3) return null;

  let title = best.title;
  let refs = best.refs;

  // if refs empty, try detail page
  if ((!refs || refs.length === 0) && best.href) {
    const extra = await enrichFromDetailPage(best.href);
    if (extra) {
      if ((!title || title.length < 4) && extra.title) title = extra.title;
      if (extra.refs?.length) refs = Array.from(new Set([...(refs || []), ...extra.refs]));
    }
  }

  const tidy = tidyReferences(refs || [], best.href);

  return {
    title: title || "",
    references: tidy,
    debug: { matchedRange: best.rangeRaw, matchedStartISO: best.start.toISOString(), href: best.href },
  };
}

export async function listRanges() {
  const items = await loadItems();
  return items.map(i => ({
    range: i.rangeRaw,
    startISO: i.start.toISOString(),
    href: i.href,
    refsSample: i.refs.slice(0, 3),
    title: i.title
  }));
}