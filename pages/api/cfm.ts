import type { NextApiRequest, NextApiResponse } from "next";
import * as cheerio from "cheerio";

/**
 * given a label like "oct 27–nov 2", return { title, refs[] }
 * by scraping the 2025 cfm overview page.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { weekLabel } = JSON.parse(req.body || "{}");
    if (!weekLabel) return res.status(400).json({ error: "missing_week_label" });

    // 2025 overview (Doctrine & Covenants) – adjust yearly
    const url = "https://www.churchofjesuschrist.org/study/manual/come-follow-me-for-home-and-church-doctrine-and-covenants-2025?lang=eng";
    const html = await (await fetch(url)).text();
    const $ = cheerio.load(html);

    // very light parsing: pull link cards that include date range + title
    const items: { range: string; title: string; refs: string[] }[] = [];
    $("a, li, div").each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
      // look for patterns like "jan 6–jan 12" nearby a title and references
      const m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\s*–\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/);
      if (m) {
        // crude split: assume references are in the same text chunk
        // e.g., 'doctrine and covenants 1 "hearken..."'
        const refs = (t.match(/\b([1-3] ?nephi|mosiah|alma|helaman|ether|moroni|mormon|doctrine and covenants|joseph smith—history|pearl of great price|matthew|mark|luke|john|acts|romans|psalms|isaiah)[^•\n]+/g) || [])
          .map(s => s.replace(/\s+/g, " ").trim());
        // grab likely title (quotes or first sentence)
        const title = (t.match(/“[^”]+”/)?.[0] || t.split(/\.|\n|\|/)[0] || "").replace(/“|”/g, "").trim();
        items.push({ range: m[0], title, refs });
      }
    });

    // normalize both to same style
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const hit = items.find(i => norm(i.range).includes(norm(weekLabel).split("–")[0])) 
          || items.find(i => norm(weekLabel).includes(norm(i.range).split("–")[0]));
    if (!hit) return res.status(404).json({ error: "not_found", candidates: items.map(i => i.range).slice(0, 12) });

    res.status(200).json({ title: hit.title, references: hit.refs });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "cfm_error" });
  }
}