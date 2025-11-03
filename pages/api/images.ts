import type { NextApiRequest, NextApiResponse } from "next";

// tiny helper that calls OpenAI Images API (gpt-image-1)
async function createImage(prompt: string) {
  const r = await fetch("https://api.openai.com/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
      ...(process.env.OPENAI_PROJECT ? { "OpenAI-Project": process.env.OPENAI_PROJECT } : {}),
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,              // your sanitized mj-style prompt
      size: "1024x1024",   // or 768x768 if you want it faster/cheaper
    }),
  });

  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || r.statusText);
  // API returns base64 or URL depending on account; handle both
  const data = j.data?.[0];
  return data?.url || (data?.b64_json ? `data:image/png;base64,${data.b64_json}` : null);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { prompts } = JSON.parse(req.body || "{}") as { prompts: string[] };
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: "no_prompts" });
    }

    // run sequentially to keep it simple; parallelize later if needed
    const urls: string[] = [];
    for (const p of prompts) {
      const url = await createImage(p);
      if (url) urls.push(url);
    }

    const [artUrls, setArtUrls] = useState<string[]>([]);

async function generateArtFromText(fullText: string) {
  const prompts = Array.from(fullText.matchAll(/Subject:\s*([^]+?)(?:\n\n|$)/gi))
    .map(m => m[0]) // or build from your sanitized blocks
    .slice(0,6);
  if (!prompts.length) return;

  const r = await fetch("/api/images", { method: "POST", body: JSON.stringify({ prompts }) });
  const j = await r.json();
  if (Array.isArray(j.urls)) setArtUrls(j.urls);
}

    res.status(200).json({ urls });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "image_error" });
  }
}