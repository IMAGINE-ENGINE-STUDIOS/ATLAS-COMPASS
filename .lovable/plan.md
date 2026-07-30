# ATLAS Signal API — Developer Resale Platform

Sell the messaging + hazard-alert infrastructure as our own branded API. The upstream carrier provider is never named anywhere: not in docs, dashboards, error messages, API responses, invoices, or code identifiers visible to customers. Publicly it is the **ATLAS Signal Network**.

## Business model

**Prepaid credits.** Developers buy credit packs, balance drains per message. No invoicing, no bad debt, hard stop at zero.

- 1 credit = $0.01 USD (clean math for per-country pricing)
- Packs: $25 / $100 / $500 / $2,000 (with 0% / 3% / 7% / 12% bonus credits — volume discount without publishing a discount table)
- Every billable action has a published price in a **per-country rate card**, set at 2x our landed cost and rounded up to the nearest tenth of a cent
- Sub-cost floor: minimum $0.02 per outbound segment even where cost is tiny, so tiny-margin destinations never lose money
- Non-message billables priced flat: inbound message, hazard-alert broadcast fan-out (per recipient), number rental (monthly), delivery-status webhook (free)

**Rate card mechanics**
- A `pricing_rates` table holds `country_iso`, `channel`, `cost_per_segment`, `sell_per_segment`, `effective_from`
- Seeded from a cost table we maintain; `sell = max(round_up(cost * 2, 0.001), floor)`
- The multiplier lives in one config row so a future change to 1.8x or 2.5x is one update, not a migration
- Public `/pricing` page renders the rate card from the same table — one source of truth, no drift

## Developer surface

**Full suite, all under `/v1`:**

| Endpoint | Purpose |
|---|---|
| `POST /v1/messages` | Send an SMS (to, body, optional callback URL) |
| `GET /v1/messages/:id` | Delivery status + segments + credits charged |
| `GET /v1/messages` | Paginated message log |
| `POST /v1/subscriptions` | Register a phone for hazard alerts (lat/lon or address, radius, hazards, language) |
| `DELETE /v1/subscriptions/:id` | Unsubscribe |
| `POST /v1/alerts/broadcast` | Geo-targeted hazard broadcast to the caller's own subscribers |
| `GET /v1/alerts` | Alerts the caller has sent, with per-alert delivery/credit rollup |
| `GET /v1/balance` | Credit balance, spend rate, low-balance threshold |
| `GET /v1/pricing` | Live rate card |
| Inbound webhooks | Signed POSTs to the developer's URL for inbound messages and delivery receipts, signed with **our** scheme (`X-Atlas-Signature`, HMAC-SHA256 of timestamp + body) |

Every response is our own envelope. Upstream errors are mapped to our own error codes (`insufficient_credits`, `invalid_destination`, `destination_blocked`, `rate_limited`) — raw upstream error text is logged internally and never returned.

## Developer portal (`/developers`)

- **Overview** — balance, 30-day spend chart, messages sent, delivery rate
- **API keys** — create/revoke named keys (`sig_live_…` / `sig_test_…`), only the SHA-256 hash stored, plaintext shown once
- **Credits** — buy packs, auto-topup toggle, low-balance email threshold, transaction ledger
- **Logs** — message log with status, country, segments, credits
- **Webhooks** — endpoint URL, signing secret, recent deliveries + retry
- **Docs** — quickstart, auth, full endpoint reference, error codes, rate card

Test mode: `sig_test_` keys simulate the full lifecycle (queued → sent → delivered) with zero credits charged and no real delivery.

## Data model

- `api_keys` — owner, name, key_hash, prefix, mode (live/test), last_used_at, revoked_at
- `credit_accounts` — owner, balance_credits, auto_topup config, low_balance_threshold
- `credit_transactions` — append-only ledger: purchase, debit, refund, bonus, adjustment; running balance
- `pricing_rates` — per-country/channel cost + sell + effective_from
- `pricing_config` — single row holding the markup multiplier and the per-segment floor
- `api_messages` — outbound/inbound records, segments, country, credits_charged, status, provider ref (internal only, never exposed)
- `api_subscriptions` — developer-owned alert subscribers (separate from our own first-party subscribers)
- `api_webhooks` + `api_webhook_deliveries` — endpoint, secret, attempt log
- `api_usage_daily` — rollup for charts and rate limiting

All tables RLS-scoped to the owning account plus admin, with GRANTs; the API itself reads through a service-role edge function, never the browser.

## Charging flow (must be atomic)

1. Authenticate key → resolve account
2. Estimate segments (GSM-7 vs UCS-2) and destination country → price from rate card
3. **Reserve** credits in a single transaction (`debit` row + balance check). Insufficient → `402 insufficient_credits`, nothing sent
4. Dispatch upstream
5. On delivery-status callback, reconcile actual segments: refund or debit the delta
6. Upstream hard failure → automatic full refund row

Balance can never go negative; the reservation and the send are never allowed to drift.

## Abuse controls

- Per-key rate limits (default 10 msg/s, 5,000/day) raised on request
- Country allowlist per account, default set to the account's own country until they ask for more
- New accounts capped at $50 spend in the first 7 days
- Duplicate-destination flood detection (same number, >N messages/min) → auto-pause key + email
- Admin kill switch per key and per account in the existing dashboard

## Admin view

New **Signal Revenue** section inside the existing `/dashboard`: gross revenue, landed cost, realized margin %, credits sold vs consumed (deferred-revenue liability), top accounts, per-country margin outliers, and a rate-card editor that recomputes sell prices from the multiplier.

## Payments

Prepaid credit packs need a checkout. I'll enable Lovable's built-in Stripe payments and set up full compliance handling — Stripe handles tax compliance, disputes, and transaction support for buyers in ~80 countries — then create the four credit-pack products and wire the webhook to write `purchase` rows into `credit_transactions`.

## Technical notes

- New edge function `signal-api` handles all `/v1` routes (single function, internal router) so key auth, rate limiting, and credit reservation live in one place
- Existing `sms-broadcast` / `sms-webhook` are refactored so the send path is shared with the resale path, but our own first-party alerts stay on a separate non-billed account
- Naming discipline enforced in code: no upstream provider name in any file under a `public/` or docs path, in any API response field, or in any user-visible string. Internal secrets and `_shared` helpers keep their current names
- Docs page is generated from a single endpoint spec object so docs cannot drift from the router

## Build order

1. Schema + RLS + rate card seed + pricing config
2. `signal-api` edge function: auth, balance, pricing, `POST /v1/messages`, status
3. Credit ledger + Stripe packs + purchase webhook
4. Developer portal (`/developers`) with keys, credits, logs
5. Subscriptions, broadcast, and outbound webhooks
6. Public `/pricing` + docs
7. Admin Signal Revenue section
