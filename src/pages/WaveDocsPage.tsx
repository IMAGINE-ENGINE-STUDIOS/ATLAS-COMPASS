import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WAVE_ENDPOINTS, WAVE_ERROR_CODES } from "@/data/waveEndpoints";
import { WAVE_BASE_URL } from "@/lib/waveApi";
import { ArrowLeft, Signal } from "lucide-react";

const METHOD_TONE: Record<string, string> = {
  GET: "bg-primary/15 text-primary",
  POST: "bg-emerald-500/15 text-emerald-400",
  DELETE: "bg-destructive/15 text-destructive",
};

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed">
    <code>{children}</code>
  </pre>
);

/** Full public API reference, generated from the shared endpoint spec. */
const WaveDocsPage = () => {
  useEffect(() => {
    document.title = "WAVE API reference — messaging & hazard alerts";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "REST reference for the WAVE API: send messages, register hazard-alert subscribers, broadcast geo-targeted warnings and check credit balance.",
      );
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Button asChild variant="ghost" size="icon">
            <Link to="/developers" aria-label="Back to developer portal"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Signal className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">WAVE API reference</span>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/pricing">Pricing</Link></Button>
            <Button asChild size="sm"><Link to="/developers">Dashboard</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">WAVE API</h1>
        <p className="mt-3 text-muted-foreground">
          One REST API for programmable messaging and geo-targeted hazard alerting.
          Prepaid credits, published per-country pricing, and a full test mode.
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Base URL</h2>
          <Code>{WAVE_BASE_URL}</Code>
          <h2 className="pt-4 text-xl font-semibold tracking-tight">Authentication</h2>
          <p className="text-sm text-muted-foreground">
            Send your key as a bearer token. Keys starting with <code>sig_test_</code> run the
            full lifecycle without delivering anything and never consume credits.
          </p>
          <Code>{`curl ${WAVE_BASE_URL}/v1/balance \\
  -H "Authorization: Bearer sig_live_xxx"`}</Code>

          <h2 className="pt-4 text-xl font-semibold tracking-tight">Quickstart</h2>
          <Code>{`curl -X POST ${WAVE_BASE_URL}/v1/messages \\
  -H "Authorization: Bearer sig_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"+15551234567","body":"Hello from WAVE"}'`}</Code>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Endpoints</h2>
          <div className="mt-4 space-y-6">
            {WAVE_ENDPOINTS.map((e) => (
              <article key={`${e.method}${e.path}`} className="rounded-xl border border-border/70 bg-card/40 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${METHOD_TONE[e.method] ?? ""}`}>
                    {e.method}
                  </span>
                  <code className="text-sm">{e.path}</code>
                  {e.auth === "public" && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      no key required
                    </span>
                  )}
                </div>
                <h3 className="mt-3 font-medium">{e.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>
                {e.request && (
                  <>
                    <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Request</div>
                    <div className="mt-2"><Code>{e.request}</Code></div>
                  </>
                )}
                <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Response</div>
                <div className="mt-2"><Code>{e.response}</Code></div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Webhooks</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add an endpoint in the dashboard to receive <code>message.sent</code>,
            <code> message.delivered</code>, <code>message.failed</code>, <code>message.inbound</code> and
            <code> alert.sent</code>. Every request carries an <code>X-Atlas-Signature</code> header.
          </p>
          <div className="mt-3"><Code>{`X-Atlas-Signature: t=1769750000,v1=<hex>

// v1 = HMAC_SHA256(signing_secret, "{t}." + rawBody)`}</Code></div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Errors</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">HTTP</th>
                  <th className="px-4 py-3 text-left font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {WAVE_ERROR_CODES.map(([code, status, meaning]) => (
                  <tr key={code} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5"><code>{code}</code></td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{status}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default WaveDocsPage;