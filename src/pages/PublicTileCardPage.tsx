import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Globe2, Loader2, MapPin, Tag as TagIcon } from "lucide-react";
import { fetchPublicTileCard, type TileCardRecord } from "@/lib/tileCards";

export default function PublicTileCardPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<TileCardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchPublicTileCard(id)
      .then((r) => {
        if (!r) setNotFound(true);
        setRecord(r);
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen w-full bg-[#04070f] text-white font-mono">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:py-14">
        <Link
          to="/atlas"
          className="w-fit rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-white/70 hover:bg-white/10"
        >
          ← Atlas
        </Link>

        {loading ? (
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tile card…
          </div>
        ) : notFound || !record ? (
          <div className="rounded-2xl border border-white/10 bg-black/40 p-8 text-center backdrop-blur-2xl">
            <div className="text-sm text-white/70">This tile card is private or does not exist.</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50 backdrop-blur-2xl">
            <div className="border-b border-white/10 bg-gradient-to-br from-violet-500/20 via-transparent to-cyan-500/10 px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-violet-200/80">
                <Globe2 className="h-3 w-3" /> Public tile card · z{record.z}
              </div>
              <div className="mt-1 font-mono text-sm tabular-nums text-white/70">
                x{record.x} / y{record.y}
              </div>
              <h1 className="mt-2 text-xl font-semibold text-white">
                {record.title || "Untitled tile"}
              </h1>
              {(record.center_lat != null && record.center_lng != null) && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/50">
                  <MapPin className="h-3 w-3" />
                  {record.center_lat.toFixed(3)}°, {record.center_lng.toFixed(3)}°
                </div>
              )}
            </div>

            <div className="p-5">
              {record.notes && (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/85">
                  {record.notes}
                </p>
              )}

              {record.indicators.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-[9px] uppercase tracking-[0.28em] text-white/45">
                    Attached indicators
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {record.indicators.map((ind) => (
                      <div
                        key={ind.id}
                        className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                        style={{ borderLeftColor: ind.color, borderLeftWidth: 3 }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1 truncate text-[12px] font-semibold text-white/90">
                            {ind.label}
                          </span>
                          {ind.value != null && ind.value !== "" && (
                            <span className="rounded border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] tabular-nums text-white/80">
                              {String(ind.value)} {ind.unit ?? ""}
                            </span>
                          )}
                        </div>
                        {ind.source && (
                          <div className="mt-0.5 text-[10px] text-white/45">{ind.source}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {record.tags.length > 0 && (
                <div className="mt-5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.28em] text-white/45">
                    <TagIcon className="h-2.5 w-2.5" /> Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {record.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-100"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 border-t border-white/5 pt-3 text-[10px] text-white/35">
                Last updated {new Date(record.updated_at).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}