// pages/index.tsx
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";

type Week = {
  id: string;
  dates: string;      // e.g., "oct 27–nov 2"
  isCurrent?: boolean;
};

const outputsList = [
  { id: "lesson", label: "lesson plan" },
  { id: "activities", label: "activities" },
  { id: "handout", label: "printable handout" },
  { id: "art", label: "art prompts" },
];

export default function Home() {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [weekId, setWeekId] = useState<string>("");
  const [audience, setAudience] = useState<"primary" | "youth" | "adults">("primary");
  const [outs, setOuts] = useState<string[]>(["lesson", "activities", "art"]);
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [meta, setMeta] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [weeksLoading, setWeeksLoading] = useState(true);

  // fetch weeks from api
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setWeeksLoading(true);
        const r = await fetch("/api/weeks");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || r.statusText);
        if (!alive) return;
        const arr = (j?.weeks as Week[]) || [];
        setWeeks(arr);
        if (arr.length) {
          const current = arr.find((w) => w.isCurrent) || arr[0];
          setWeekId(current.id);
        }
      } catch (e) {
        console.error(e);
        setWeeks([]);
        setWeekId("");
      } finally {
        if (alive) setWeeksLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const canGo = useMemo(() => !!weekId && outs.length > 0, [weekId, outs]);

  function toggleOutput(id: string) {
    setOuts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function generate() {
    if (!canGo) return;
    setLoading(true);
    setText("");
    setMeta(null);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          audience,
          weekId,
          outputs: outs,
          notes,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setText(`error: ${j?.error || r.statusText}`);
      } else {
        setText(j?.text || "");
        setMeta(j?.meta || null);
      }
    } catch (e: any) {
      setText("error: " + (e?.message || "unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  function downloadMarkdown() {
    const blob = new Blob([text || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const wk = weeks.find((w) => w.id === weekId);
    a.href = url;
    a.download = `come-follow-kit_${wk?.dates || "lesson"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedWeek = weeks.find((w) => w.id === weekId);

  return (
    <>
      <Head>
        <title>come-follow kit</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-100 via-white to-indigo-100">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            come-follow kit
          </h1>
          <p className="mt-2 text-gray-600">
            pick a week, select audience, add any notes, and generate a tight, scripture-anchored kit.
          </p>
        </div>
      </div>

      {/* main card */}
      <main className="-mt-8">
        <div className="mx-auto max-w-4xl px-4 pb-16">
          <div className="rounded-2xl border border-gray-200 bg-white/90 shadow-sm backdrop-blur">
            <div className="grid gap-8 p-6 md:grid-cols-2">
              {/* form */}
              <section className="space-y-4">
                {/* week */}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">week</span>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-gray-300 bg-white px-3 py-2 pr-10 text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100"
                      value={weekId}
                      disabled={weeksLoading || !weeks.length}
                      onChange={(e) => setWeekId(e.target.value)}
                    >
                      {weeks.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.dates}{w.isCurrent ? "  • this week" : ""}
                        </option>
                      ))}
                    </select>
                    <svg
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {selectedWeek?.isCurrent && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      ● this week
                    </span>
                  )}
                </label>

                {/* audience */}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">audience</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["primary", "youth", "adults"] as const).map((a) => {
                      const active = audience === a;
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAudience(a)}
                          className={[
                            "rounded-xl border px-3 py-2 text-sm capitalize transition",
                            active
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                              : "border-gray-300 bg-white hover:border-indigo-400",
                          ].join(" ")}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>
                </label>

                {/* outputs */}
                <fieldset className="rounded-xl border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-medium text-gray-700">outputs</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {outputsList.map((o) => {
                      const checked = outs.includes(o.id);
                      return (
                        <label
                          key={o.id}
                          className={[
                            "flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition",
                            checked
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-300 hover:border-indigo-400",
                          ].join(" ")}
                        >
                          <span className="capitalize">{o.label}</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-indigo-600"
                            checked={checked}
                            onChange={() => toggleOutput(o.id)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* notes */}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">
                    notes (optional)
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder='e.g., "please include a simple object lesson" or "we sing a short opening song"'
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </label>

                {/* action */}
                <div className="pt-2">
                  <button
                    onClick={generate}
                    disabled={!canGo || loading || weeksLoading || !weeks.length}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
                  >
                    {loading ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                        generating…
                      </>
                    ) : (
                      <>generate</>
                    )}
                  </button>
                </div>
              </section>

              {/* output */}
              <section className="flex min-h-[220px] flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    {meta?.reading?.length ? (
                      <span>
                        using:{" "}
                        <span className="font-medium text-gray-700">
                          {meta.reading.join(", ")}
                        </span>
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        {weeksLoading ? "loading weeks…" : "waiting for output…"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyOut}
                      disabled={!text}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:border-indigo-400 disabled:opacity-40"
                    >
                      {copied ? "copied ✓" : "copy"}
                    </button>
                    <button
                      onClick={downloadMarkdown}
                      disabled={!text}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:border-indigo-400 disabled:opacity-40"
                    >
                      download .md
                    </button>
                  </div>
                </div>

                <article
                  className="prose prose-sm max-w-none grow overflow-auto rounded-xl border border-gray-200 bg-white p-4 text-gray-900"
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {text ? text : (loading ? "" : <span className="text-gray-400">your lesson will appear here</span>)}
                </article>

                {meta?.modelUsed && (
                  <div className="mt-3 text-right text-xs text-gray-500">
                    model: {meta.modelUsed}
                  </div>
                )}
              </section>
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-4xl px-1 text-center text-xs text-gray-400">
            scripture-anchored. you review before teaching.
          </div>
        </div>
      </main>
    </>
  );
}