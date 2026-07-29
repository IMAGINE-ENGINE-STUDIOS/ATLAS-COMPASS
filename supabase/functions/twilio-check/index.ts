// Temporary credential probe: confirms the Twilio SID/token pair authenticates.
Deno.serve(async () => {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const from = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
  });
  const body = await res.text();
  let friendly: string | null = null;
  let status: string | null = null;
  try {
    const j = JSON.parse(body);
    friendly = j.friendly_name ?? null;
    status = j.status ?? j.message ?? null;
  } catch { /* non-JSON error page */ }

  return new Response(
    JSON.stringify({
      http: res.status,
      sid_prefix: sid.slice(0, 2),
      sid_len: sid.length,
      from_shape: /^\+[0-9]{7,15}$/.test(from) ? "e164_ok" : `unexpected(len ${from.length})`,
      account_friendly_name: friendly,
      account_status: status,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});