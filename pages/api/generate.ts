// pages/api/generate.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { lessonPrompt } from "../../lib/prompt";
import { getWeeks } from "../../data/schedule";
import { fetchCFMForWeekByDate } from "../../lib/cfm";

const PREFERRED_MODEL = "gpt-5-mini";
const FALLBACK_MODEL = "gpt-4o-mini";

type Effort = "low" | "medium" | "high";

async function callOpenAI({
  model,
  prompt,
  maxOutput = 3000,
  effort = "medium" as Effort,
}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENAI_PROJECT) headers["OpenAI-Project"] = process.env.OPENAI_PROJECT;

  // tighter system guidance + extra headroom to avoid premature truncation
  const body: any = {
    model,
    reasoning: { effort },
    input: [
      {
        role: "system",
        content: [
          "write concise, scripture-anchored outputs.",
          "TOTAL LENGTH BUDGET: ~900 words across all sections.",
          "avoid speculation. do not add extra lists not requested.",
        ].join(" "),
      },
      { role: "user", content: prompt },
    ],
    // give room so we don't hit the cap too early
    max_output_tokens: Math.max(2200, maxOutput || 0),
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* leave json as null; we'll unwrap from raw text if needed */
  }

  return { ok: r.ok, status: r.status, statusText: r.statusText, text, json };
}

// derive monday (utc) from a label like "nov 3–nov 9"
function mondayUTCFromLabel(lbl: string) {
  const m = lbl.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/);
  if (!m) return null;
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const y = new Date().getUTCFullYear();
  const monthIdx = months.indexOf(m[1]);
  const d = parseInt(m[2], 10);
  const base = new Date(Date.UTC(y, monthIdx, d, 12, 0, 0));
  const day = base.getUTCDay(); // 0..6, Sun=0
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  base.setUTCDate(base.getUTCDate() + diff);
  return base;
}

// unwrap helper that tolerates different response shapes
function unwrapAny(o: any): string {
  if (!o) return "";
  if (typeof o === "string") return o;

  // responses api "output_text"
  if (o.output_text) return String(o.output_text);

  // responses api "output" array with message chunks
  if (Array.isArray(o.output)) {
    const chunks = o.output
      .filter((x: any) => x?.type === "message")
      .flatMap((x: any) =>
        Array.isArray(x.content) ? x.content.map((c: any) => c?.text).filter(Boolean) : []
      );
    if (chunks.length) return chunks.join("\n").trim();
  }

  // chat completions-like
  const fromChoices = o?.choices?.[0]?.message?.content;
  if (typeof fromChoices === "string") return fromChoices;

  return "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const {
      audience,
      weekId,
      outputs,
      readingOverride,
      themeOverride,
      notes,
    } = JSON.parse(raw || "{}");

    // selected rolling week
    const weeks = getWeeks();
    const selected = weeks.find((w) => w.id === weekId);
    if (!selected) return res.status(400).json({ error: "Unknown week" });

    const weekLabel = selected.dates; // e.g., "nov 3–nov 9"

    // start with user overrides
    let reading: string[] =
      (readingOverride || "")
        .split(/[;,]/)
        .map((s: string) => s.trim())
        .filter(Boolean);

    let theme: string = (themeOverride || "").trim();

    // try to auto-pull from official page by date if missing info
    let autoSourced = false;
    const monday = mondayUTCFromLabel(weekLabel);

    if ((reading.length === 0 || !theme) && monday) {
      try {
        const pulled = await fetchCFMForWeekByDate(monday);
        if (pulled) {
          if (reading.length === 0 && pulled.references?.length) {
            reading = pulled.references;
            autoSourced = true;
          }
          if (!theme && pulled.title) {
            theme = pulled.title;
            autoSourced = true;
          }
        }
      } catch {
        /* non-fatal */
      }
    }

    // final sanitation before prompting
    reading = Array.from(new Set(
      reading
        .map(r => r.replace(/\bd&c\b/ig, "Doctrine and Covenants"))
        .map(r => r.replace(/-+/g, "–"))
        .map(r => r.replace(/\s+/g, " ").trim())
    )).filter(r => /\d/.test(r) && r.length <= 40);

    const prompt = lessonPrompt({
      audience,
      weekLabel,
      reading: reading.length ? reading : ["(teacher will supply passages)"],
      theme: theme || "(teacher will supply theme)",
      outputs: Array.isArray(outputs) ? outputs : [],
      notes,
    });

    // call model with fallback
    let model = PREFERRED_MODEL;
    let resp = await callOpenAI({ model, prompt, maxOutput: 3000, effort: "medium" });

    if (!resp.ok) {
      const detail = resp.text || `${resp.status} ${resp.statusText}`;
      if (/model_not_found|Unknown model/i.test(detail)) {
        model = FALLBACK_MODEL;
        resp = await callOpenAI({ model, prompt, maxOutput: 3000, effort: "medium" });
      } else {
        return res.status(500).json({ error: "llm_error", detail });
      }
    }

    const j = resp.json || {};
    const status = j?.status;
    let out = unwrapAny(j);
    if (!out) out = unwrapAny(resp.text) || "no content returned";
    out = String(out).trim();

    const limitedByTokens =
      status === "incomplete" &&
      (j?.incomplete_details?.reason === "max_output_tokens" ||
        /max_output_tokens/i.test(resp.text));

    return res.status(200).json({
      text: out,
      meta: {
        week: selected,
        modelUsed: model,
        reading,
        theme,
        autoSourced,
        limitedByTokens, // ui can show "trimmed to fit"
        debug:
          process.env.NODE_ENV !== "production"
            ? { weekLabel, mondayISO: monday?.toISOString() }
            : undefined,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server_error" });
  }
}