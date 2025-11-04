// pages/api/images.ts
import type { NextApiRequest, NextApiResponse } from "next";

const IMAGE_MODEL = "gpt-image-1";
const PROMPT_MODEL = "gpt-5-mini"; // fallback to 4o-mini if needed

type GenBody = {
  text?: string;       // full lesson text
  prompts?: string[];  // explicit prompts (optional)
  size?: "512x512" | "1024x1024" | "2048x2048";
  n?: number;          // max images to return
};

// pull out "Subject: ..." blocks if they exist
function extractPromptsFromText(t: string): string[] {
  if (!t) return [];
  const out: string[] = [];
  const re = /Subject:\s*([^]+?)(?=\n{2,}|\n\d+\)|\n?Subject:|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const block = (m[1] || "").trim();
    if (!block) continue;
    const single = block.replace(/\s+/g, " ").replace(/\s*;+\s*/g, ", ");
    out.push(single);
  }
  return Array.from(new Set(out)).slice(0, 6);
}

async function callOpenAIJSONArray(system: string, user: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENAI_PROJECT) headers["OpenAI-Project"] = process.env.OPENAI_PROJECT;

  const body = {
    model: PROMPT_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_output_tokens: 800,
    text: {
        format: {
          type: "json_schema",
          json_schema: {
            name: "prompts",
            schema: {
              type: "object",
              properties: {
                prompts: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
              },
              required: ["prompts"],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      },
  };

  const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  const json = JSON.parse(text);
  if (!r.ok) throw new Error(json?.error?.message || r.statusText);
  const content = json?.output?.find((o: any) => o.type === "message")?.content?.[0]?.text || json?.output_text || "";
  const parsed = JSON.parse(content);
  return (parsed?.prompts as string[]) || [];
}

async function generateOne(prompt: string, size: string) {
  const r = await fetch("https://api.openai.com/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
      ...(process.env.OPENAI_PROJECT ? { "OpenAI-Project": process.env.OPENAI_PROJECT } : {}),
    },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || r.statusText);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("image_error: no image returned");
  return `data:image/png;base64,${b64}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const body: GenBody = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const size = body.size || "1024x1024";

    let prompts: string[] = [];
    if (Array.isArray(body.prompts) && body.prompts.length) {
      prompts = body.prompts;
    } else if (body.text) {
      // try to extract explicit “Subject:” lines first
      prompts = extractPromptsFromText(body.text);
      // fallback: ask model to synthesize 4–6 prompts from the lesson content
      if (prompts.length === 0) {
        const sys = "You create concise, family-friendly LDS art prompts for image generation. Return ONLY JSON matching the schema.";
        const usr =
`From the following lesson text, produce 4–6 short image prompts (not instructions to a teacher).
Style: gentle watercolor, kids-book clean lines, warm palette, reverent, family-friendly.
Include a clear subject and composition in each prompt. No camera jargon. No quotes. Keep to one sentence each.
Lesson text:
"""${body.text.slice(0, 9000)}"""`;
        const generated = await callOpenAIJSONArray(sys, usr);
        prompts = Array.from(new Set((generated || []).map(s => s.trim()))).filter(Boolean).slice(0, 6);
      }
    }

    if (!prompts.length) return res.status(400).json({ error: "no_prompts_found" });

    const limit = Math.max(1, Math.min(body.n || prompts.length, prompts.length));
    prompts = prompts.slice(0, limit);

    const images = await Promise.all(prompts.map((p) => generateOne(p, size)));

    return res.status(200).json({ images, prompts, size, synthesized: body.prompts?.length ? false : true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server_error" });
  }
}