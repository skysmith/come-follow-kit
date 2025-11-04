// pages/index.tsx
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";

type Week = {
  id: string;
  label: string;     // e.g., "November 3–9"
  dates: string;     // e.g., "nov 3–nov 9"
  reading?: string[];
  theme?: string;
  isThisWeek?: boolean;
};

type Meta = {
  modelUsed?: string;
  reading?: string[];
  theme?: string;
  limitedByTokens?: boolean;
  debug?: any;
  week?: Week;
};

const outputsList = [
  { id: "lesson", label: "Lesson Plan" },
  { id: "activities", label: "Activities" },
  { id: "handout", label: "Printable Handout" },
  { id: "art", label: "Art Prompts" }, // when checked we’ll generate images too
];

export default function Home() {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [week, setWeek] = useState<Week | null>(null);

  const [audience, setAudience] = useState<"primary" | "youth" | "adults">("primary");
  const [outs, setOuts] = useState<string[]>(["lesson", "activities", "art"]);
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("waiting for output...");
  const [text, setText] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);

  // image bits
  const [artUrls, setArtUrls] = useState<string[]>([]);
  const [imgErr, setImgErr] = useState<string | null>(null);

  useEffect(() => {
    // fetch rolling weeks from api
    (async () => {
      try {
        const r = await fetch("/api/weeks");
        const j = await r.json();
        const ws: Week[] = Array.isArray(j?.weeks) ? j.weeks : [];
        setWeeks(ws);
        setWeek(ws[0] || null); // first is "this week"
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const canGo = useMemo(() => !!week && outs.length > 0, [week, outs]);

  function toggleOutput(id: string) {
    setOuts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function generateImagesFromLesson(fullText: string) {
    setImgErr(null);
    setArtUrls([]);
    const r = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: fullText }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "image generation failed");
    return (j.images as string[]) || [];
  }

  async function generate() {
    if (!canGo || !week) return;
    setLoading(true);
    setStatus("generating lesson…");
    setText("");
    setMeta(null);
    setArtUrls([]);
    setImgErr(null);

    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          weekId: week.id,
          outputs: outs,
          notes,
        }),
      });

      const j = await r.json();
      setLoading(false);

      if (!r.ok) {
        setStatus("error");
        setText(`error: ${j?.error || "unknown"}`);
        return;
      }

      const lessonText = (j?.text as string) || "";
      setText(lessonText);
      setMeta(j?.meta || null);
      setStatus("done");

      // if art prompts selected, kick off image generation
      if (outs.includes("art") && lessonText) {
        setStatus("generating images…");
        try {
          const imgs = await generateImagesFromLesson(lessonText);
          setArtUrls(imgs);
        } catch (err: any) {
          console.error(err);
          setImgErr(err?.message || "image error");
        } finally {
          setStatus("done");
        }
      }
    } catch (e: any) {
      setLoading(false);
      setStatus("error");
      setText(`error: ${e?.message || "network_error"}`);
    }
  }

  function copyText() {
    if (!text) return;
    navigator.clipboard.writeText(text);
  }

  function downloadMd() {
    if (!text) return;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (week?.label || "lesson") + ".md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Head>
        <title>come-follow kit</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-yellow-50/60 to-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h1 className="text-2xl font-semibold mb-2">come–follow kit</h1>
          <p className="text-sm text-gray-600 mb-6">
            pick a week, select audience, add any notes, and generate a tight, scripture-anchored kit.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* left panel */}
            <section className="rounded-2xl border bg-white/70 backdrop-blur p-4 md:p-5 shadow-sm">
              {/* week */}
              <label className="block mb-4">
                <div className="text-xs font-medium text-gray-600 mb-1">week</div>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={week?.id || ""}
                  onChange={(e) => setWeek(weeks.find((w) => w.id === e.target.value) || null)}
                >
                  {weeks.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.dates || w.label}
                      {w.isThisWeek ? " • this week" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {/* audience */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 mb-2">audience</div>
                <div className="flex gap-2">
                  {(["primary", "youth", "adults"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAudience(a)}
                      className={[
                        "px-3 py-1.5 rounded-lg border",
                        audience === a ? "bg-indigo-600 text-white border-indigo-600" : "bg-white",
                      ].join(" ")}
                    >
                      {a[0].toUpperCase() + a.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* outputs */}
              <fieldset className="mb-4 border rounded-xl p-3">
                <legend className="text-xs font-medium text-gray-600 px-1">outputs</legend>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {outputsList.map((o) => (
                    <label key={o.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={outs.includes(o.id)}
                        onChange={() => toggleOutput(o.id)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* notes */}
              <label className="block">
                <div className="text-xs font-medium text-gray-600 mb-1">notes (optional)</div>
                <textarea
                  className="w-full rounded-lg border px-3 py-2 min-h-[90px]"
                  placeholder={`e.g., "please include a simple object lesson" or\n"we sing a short opening song"`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              <div className="mt-4">
                <button
                  onClick={generate}
                  disabled={!canGo || loading}
                  className="rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-40"
                >
                  {loading ? "generating…" : "generate"}
                </button>
              </div>
            </section>

            {/* right panel */}
            <section className="rounded-2xl border bg-white/70 backdrop-blur p-4 md:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-xs text-gray-500">{status}</div>
                <div className="flex-1" />
                <button
                  onClick={copyText}
                  disabled={!text}
                  className="text-xs rounded border px-2 py-1 disabled:opacity-40"
                >
                  copy
                </button>
                <button
                  onClick={downloadMd}
                  disabled={!text}
                  className="text-xs rounded border px-2 py-1 disabled:opacity-40"
                >
                  download .md
                </button>
              </div>

              <article
                className="prose max-w-none bg-white border rounded p-4 whitespace-pre-wrap text-sm"
                style={{ minHeight: 220 }}
              >
                {text || "your lesson will appear here"}
              </article>

              {/* token trim hint */}
              {meta?.limitedByTokens && (
                <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 inline-block px-2 py-1 rounded">
                  trimmed to fit
                </div>
              )}

              {/* image grid */}
              {(artUrls.length > 0 || imgErr) && (
                <div className="mt-5">
                  <div className="text-xs font-medium text-gray-700 mb-2">art</div>
                  {imgErr && (
                    <div className="text-xs text-red-600 mb-2">image error: {imgErr}</div>
                  )}
                  {artUrls.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {artUrls.map((u, i) => (
                        <img key={i} src={u} alt={`art-${i}`} className="rounded-lg shadow" />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          <footer className="mt-8 text-[11px] text-gray-400">
            scripture-anchored. you review before teaching.
          </footer>
        </div>
      </main>
    </>
  );
}