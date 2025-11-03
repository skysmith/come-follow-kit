// pages/api/images.ts
import type { NextApiRequest, NextApiResponse } from "next";

const IMAGE_MODEL = "gpt-image-1"; // openai image model

type GenBody = {
  text?: string;       // full lesson text (we'll extract prompts)
  prompts?: string[];  // or pass explicit prompts
  size?: "512x512" | "1024x1024" | "2048x2048";
  n?: number;          // max images to return
};

// pull out the "Subject: ..." lines from your art section
function extractPromptsFromText(t: string): string[] {
  if (!t) return [];
  const out: string[] = [];
  const re = /Subject:\s*([^]+?)(?=\n{2,}|\n\d+\)|\n?Subject:|$)/gi;
  for (const m of t.matchAll(re)) {
    const block = m[1].trim();
    // collapse whitespace and keep the aspect flag if present
    const single = block.replace(/\s+/g, " ").replace(/\s*;+\s*/g, ", ");
    out.push(single);
  }
  // dedupe & trim to something sane
  return Array.from(new Set(out)).slice(0, 6);
}

async function generateOne(prompt: string, size: string) {
  const r = await fetch("https://api.openai.com/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
      ...(process.env.OPENAI_PROJECT ? { "OpenAI-Project": process.env.OPENAI_PROJECT } : {}),
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size,
      // you can set "background":"transparent" if you want PNG with alpha
    }),
  });

  const j = await r.json();
  if (!r.ok) {
    const detail = j?.error?.message || r.statusText;
    throw new Error(`image_error: ${detail}`);
  }

  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("image_error: no image returned");
  return `data:image/png;base64,${b64}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const body: GenBody =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    const size = body.size || "1024x1024";
    let prompts = Array.isArray(body.prompts) && body.prompts.length
      ? body.prompts
      : extractPromptsFromText(body.text || "");

    // fallback if nothing extracted
    if (!prompts.length) {
      return res.status(400).json({ error: "no_prompts_found" });
    }

    // limit n if provided
    const limit = Math.max(1, Math.min(body.n || prompts.length, prompts.length));
    prompts = prompts.slice(0, limit);

    const images = await Promise.all(
      prompts.map((p) => generateOne(p, size))
    );

    return res.status(200).json({ images, prompts, size });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server_error" });
  }
}