import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCFMForWeekByDate, listRanges } from "../../lib/cfm";

function mondayUTCFromLabel(lbl: string) {
  const now = new Date();
  // naive parse: "nov 3–nov 9" -> take the first month/day
  const m = lbl.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/);
  if (!m) return null;
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const y = now.getUTCFullYear();
  const monthIdx = months.indexOf(m[1]);
  const d = parseInt(m[2], 10);
  const dt = new Date(Date.UTC(y, monthIdx, d, 12, 0, 0));
  // return monday
  const day = dt.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const label = (req.query.week as string) || "";
  if (!label) {
    const list = await listRanges();
    return res.status(200).json({ hint: "pass ?week=nov%203–nov%209", found: list.slice(0, 12) });
  }
  const monday = mondayUTCFromLabel(label);
  if (!monday) return res.status(400).json({ error: "bad_label" });

  const hit = await fetchCFMForWeekByDate(monday);
  if (!hit) return res.status(404).json({ error: "not_found_by_date", weekLabel: label, mondayISO: monday.toISOString(), sample: (await listRanges()).slice(0, 6) });
  return res.status(200).json({ weekLabel: label, mondayISO: monday.toISOString(), ...hit });
}