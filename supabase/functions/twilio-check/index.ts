// Temporary credential probe: confirms the Twilio SID/token pair authenticates.
Deno.serve(async (req) => {
  const sid = (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim();
  const token = (Deno.env.get("TWILIO_AUTH_TOKEN") ?? "").trim();
  const apiKeySid = (Deno.env.get("TWILIO_API_KEY_SID") ?? "").trim();
  const from = (Deno.env.get("TWILIO_PHONE_NUMBER") ?? "").replace(/[^\d+]/g, "");
  const user = apiKeySid || sid;
  const basic = `Basic ${btoa(`${user}:${token}`)}`;

  // POST rewires the number's inbound SMS webhook to our handler.
  if (req.method === "POST") {
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`,
      { headers: { Authorization: basic } },
    );
    const list = await listRes.json();
    const numberSid = list.incoming_phone_numbers?.[0]?.sid;
    if (!numberSid) {
      return new Response(JSON.stringify({ error: "number not found on account" }), { status: 404 });
    }
    const target = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sms-webhook`;
    const upd = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${numberSid}.json`,
      {
        method: "POST",
        headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ SmsUrl: target, SmsMethod: "POST" }),
      },
    );
    const updBody = await upd.text();
    if (!upd.ok) {
      console.error(`Failed to set SmsUrl [${upd.status}]: ${updBody}`);
      return new Response(JSON.stringify({ ok: false, status: upd.status }), { status: upd.status });
    }
    return new Response(
      JSON.stringify({ ok: true, sms_url: JSON.parse(updBody).sms_url }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: basic },
  });
  const body = await res.text();
  let friendly: string | null = null;
  let status: string | null = null;
  try {
    const j = JSON.parse(body);
    friendly = j.friendly_name ?? null;
    status = j.status ?? j.message ?? null;
  } catch { /* non-JSON error page */ }

  // Confirm the sending number is owned by this account and can send SMS.
  const numRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`,
    { headers: { Authorization: basic } },
  );
  const numBody = await numRes.text();
  let number: Record<string, unknown> | null = null;
  try {
    const j = JSON.parse(numBody);
    const n = j.incoming_phone_numbers?.[0];
    number = n
      ? { phone: n.phone_number, sms: n.capabilities?.sms, sms_url: n.sms_url }
      : { found: false, note: numBody.slice(0, 200) };
  } catch { /* ignore */ }

  return new Response(
    JSON.stringify({
      http: res.status,
      sid_prefix: sid.slice(0, 2),
      sid_len: sid.length,
      from_shape: /^\+[0-9]{7,15}$/.test(from) ? "e164_ok" : `unexpected(len ${from.length})`,
      account_friendly_name: friendly,
      account_status: status,
      number,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});