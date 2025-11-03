// lib/prompt.ts
export type Audience = "primary" | "youth" | "adults";

const AUDIENCE_RULES: Record<Audience, string> = {
  primary: [
    "audience: children ages 4–11.",
    "tone: warm, concrete, short sentences; define new words in one phrase.",
    "format: bullets + numbered mini-steps; safe, simple activities.",
    "timing: segments 2–6 minutes.",
  ].join(" "),
  youth: [
    "audience: teens 12–18.",
    "tone: respectful, clear, no slang; invite discussion.",
    "format: scripture → insight → question; avoid lecture.",
    "timing: 30–40 minutes total; include at least one 5–8 min discussion block.",
  ].join(" "),
  adults: [
    "audience: adults.",
    "tone: concise, scripture-anchored; practical application.",
    "format: outline with time boxes; 2–3 lived-experience questions.",
  ].join(" "),
};

function listify(xs: string[]) {
  return xs.filter(Boolean).map(s => s.trim()).join(", ");
}

/**
 * hard rules:
 * - MUST use the provided reading list (book chapter:verse).
 * - EVERY insight and question must cite a verse like (1 Nephi 1:14).
 * - No speculation; stick to the text.
 * - Output must be Markdown that prints cleanly (<= ~900 words).
 */
export function lessonPrompt(args: {
  audience: Audience;
  weekLabel: string;   // e.g., "oct 27–nov 2"
  reading: string[];   // e.g., ["1 Nephi 1", "1 Nephi 2–5"]
  theme: string;       // optional
  outputs: string[];   // any of: lesson, activities, handout, art
  notes?: string;      // teacher preferences
}) {
  const wants = new Set(args.outputs);
  const want = (k: string) => wants.has(k);
  const readingStr = listify(args.reading) || "(teacher will supply passages)";
  const themeStr = args.theme || "(teacher will supply theme)";
  const notes = (args.notes || "").trim();

  const header = [
    `WEEK: ${args.weekLabel}`,
    `READING: ${readingStr}`,
    `THEME: ${themeStr}`,
    `AUDIENCE: ${args.audience.toUpperCase()}`,
    notes ? `TEACHER NOTES: ${notes}` : ``,
  ].filter(Boolean).join("\n");

  const sections: string[] = [];

  if (want("lesson")) {
    sections.push(
`## lesson plan (30–40 min)

**non-negotiables**
- use ONLY the passages in READING.
- EVERY insight & question cites a verse like *(1 Nephi 1:14)*.
- no new doctrine. no speculation. be concise and printable.

**outline**
1) **opener (2–4 min)**  
   - hook (1–2 lines) tied to the **theme**.  
   - 1 opening question *(with verse citation)*.

2) **scripture walkthrough (18–22 min)** — 3 segments  
   for each segment include EXACTLY:
   - **read**: verse(s) to read (from READING)  
   - **insight**: one sentence, with verse citation  
   - **question**: one sentence, with verse citation

3) **application (5–7 min)**  
   - 2 concrete invitations for this week, each tied to a verse.

4) **closer (1–2 min)**  
   - 3-sentence summary with **two** verse citations.

> format as clean Markdown. keep total under ~900 words.`
    );
  }

  if (want("activities")) {
    sections.push(
`## activities (3)

for each activity provide:
- **time** (5–10 min)
- **materials** (cheap / common)
- **steps** (numbered, 3–6 steps)
- **why it works** (1–2 lines)
- **verse link** (cite one verse from READING)`
    );
  }

  if (want("handout")) {
    sections.push(
`## printable handout (b/w, text-only, Markdown)

include:
- title
- key scripture box (one short verse from READING, with reference)
- 3 fill-in-the-blank prompts
- 1 reflection question
- memory verse line`
    );
  }

  if (want("art")) {
    sections.push(
`## art prompts (6)

**style**: gentle watercolor, kids-book clean lines, warm palette; reverent, family-friendly.  
**format each as**:  
**Subject:** …  
**Composition:** …  
**Medium:** …  
**Lighting:** …  
**Mood:** …  
**Aspect:** --ar 3:2 *or* --ar 1:1  

use straight quotes and \`--ar\`. keep under 2 lines per prompt. tie each prompt to an imageable moment from READING (name the verse).`
    );
  }

  return [
    `### instructions`,
    `${AUDIENCE_RULES[args.audience]}`,
    `stick to the passages. if a requested item would require speculation, say "flag: speculative" and offer a verse-anchored alternative.`,
    ``,
    `### context`,
    header,
    ``,
    sections.join("\n\n---\n\n"),
  ].join("\n");
}