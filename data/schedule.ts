// data/schedule.ts
export const COUNT = 12;

export type Week = {
  id: string;       // e.g., wk-2025-10-27
  label: string;    // e.g., oct 27–nov 2
  reading: string[];
  theme: string;
  dates: string;    // same as label
  startISO: string; // yyyy-mm-dd (monday)
};

const MONS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function anchorMonday(from: Date = new Date()): Date {
  const d = startOfDay(from);
  const dow = d.getDay(); // 0=Sun ... 6=Sat
  // if today is monday, use today; else go to next monday
  const delta = dow === 1 ? 0 : (8 - dow) % 7;
  const nd = new Date(d);
  nd.setDate(d.getDate() + delta);
  return nd;
}

function fmtRange(mon: Date) {
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const s = `${MONS[mon.getMonth()]} ${mon.getDate()}`;
  const e = `${MONS[sun.getMonth()]} ${sun.getDate()}`;
  return `${s}–${e}`; // e.g., oct 27–nov 2
}

export function getWeeks(count = COUNT) {
  const start = anchorMonday();
  const weeks: Week[] = [];
  for (let i = 0; i < count; i++) {
    const m = new Date(start);
    m.setDate(start.getDate() + i * 7);
    const yyyy = m.getFullYear();
    const mm = String(m.getMonth() + 1).padStart(2, "0");
    const dd = String(m.getDate()).padStart(2, "0");
    const id = `wk-${yyyy}-${mm}-${dd}`;
    const label = fmtRange(m);
    weeks.push({
      id,
      label,
      dates: label,
      reading: [],
      theme: "",
      startISO: `${yyyy}-${mm}-${dd}`,
    });
  }
  return weeks;
}