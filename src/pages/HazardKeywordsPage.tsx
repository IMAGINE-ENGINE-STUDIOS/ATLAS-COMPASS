import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import keywordData from "@/data/hazardKeywords.json";
import { ArrowLeft, MessageSquareText, Search } from "lucide-react";

interface KeywordRow {
  hazard: string;
  lang: string;
  lang_name: string;
  keyword: string;
  normalized: string;
  is_primary: boolean;
}

const HAZARD_ORDER = [
  "earthquake", "tsunami", "flood", "wildfire", "volcano", "hurricane", "tornado",
  "storm", "landslide", "heat", "drought", "cold", "avalanche", "epidemic",
  "chemical", "nuclear", "conflict", "all",
];

const HAZARD_EMOJI: Record<string, string> = {
  earthquake: "🌐", tsunami: "🌊", flood: "💧", wildfire: "🔥", volcano: "🌋",
  hurricane: "🌀", tornado: "🌪️", storm: "⛈️", landslide: "⛰️", heat: "🥵",
  drought: "🏜️", cold: "🥶", avalanche: "🏔️", epidemic: "🦠", chemical: "☣️",
  nuclear: "☢️", conflict: "⚔️", all: "📣",
};

const rows = keywordData as KeywordRow[];

/** Public reference of every hazard keyword the SMS warning line understands. */
const HazardKeywordsPage = () => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "SMS hazard keywords in 100+ languages · HOT";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Text a hazard keyword like #earthquake, #terremoto or #地震 in any of 113 languages to receive disaster warnings and official instructions for your location.",
      );
  }, []);

  const languages = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.lang, r.lang_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      ([code, name]) =>
        name.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q) ||
        rows.some((r) => r.lang === code && r.keyword.toLowerCase().includes(q)),
    );
  }, [query, languages]);

  const byLang = useMemo(() => {
    const map = new Map<string, KeywordRow[]>();
    for (const r of rows) {
      const list = map.get(r.lang);
      if (list) list.push(r);
      else map.set(r.lang, [r]);
    }
    return map;
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link to="/hot" aria-label="Back to HOT">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Hazard keywords</h1>
            <p className="truncate text-xs text-muted-foreground">
              {rows.length.toLocaleString()} words · {languages.length} languages
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-7">
        <section className="rounded-2xl border border-border bg-card/60 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <MessageSquareText className="h-4 w-4" />
            How to subscribe
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Text any keyword below — with or without a <span className="text-foreground">#</span> — to the HOT
            warning number. We reply in your language and ask for your city or exact GPS, then create a
            handle for you and start sending warnings plus official instructions from local authorities.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {["#earthquake", "#terremoto", "#地震", "#زلزال", "#भूकंप", "#flood", "#wildfire"].map((t) => (
              <code key={t} className="rounded-lg border border-border bg-muted/50 px-2.5 py-1.5">
                {t}
              </code>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Commands: <strong className="text-foreground">HELP</strong> for options ·{" "}
            <strong className="text-foreground">LOC</strong> to update your location ·{" "}
            <strong className="text-foreground">STATUS</strong> to review settings ·{" "}
            <strong className="text-foreground">STOP</strong> to unsubscribe.
          </p>
        </section>

        <div className="relative mt-7">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a language or a word…"
            className="pl-9"
            aria-label="Search hazard keywords"
          />
        </div>

        <div className="mt-5 space-y-4">
          {filtered.map(([code, name]) => {
            const list = (byLang.get(code) ?? []).filter((r) => r.is_primary);
            const ordered = HAZARD_ORDER.map((h) => list.find((r) => r.hazard === h)).filter(
              Boolean,
            ) as KeywordRow[];
            return (
              <section key={code} className="rounded-2xl border border-border bg-card/40 p-4">
                <h2 className="text-sm font-semibold">
                  {name}{" "}
                  <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{code}</span>
                </h2>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {ordered.map((r) => (
                    <li
                      key={`${r.hazard}-${r.normalized}`}
                      className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2"
                    >
                      <div className="truncate text-sm" title={r.keyword}>
                        <span aria-hidden="true">{HAZARD_EMOJI[r.hazard] ?? "•"}</span> #{r.keyword}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                        {r.hazard}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No language or keyword matched “{query}”.
            </p>
          )}
        </div>
      </div>
    </main>
  );
};

export default HazardKeywordsPage;