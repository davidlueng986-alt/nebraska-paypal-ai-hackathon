# Open questions and assumptions

One line each, with the agent name.

- Agent A: The worked example needs kleur's `need` to stay neutral. An out-of-range model answer (the injected README asks for 999) is **rejected to the neutral default 1.0**, not clamped to 2.0. In-range answers are bounded to 0.5–2.0 by the same validator. Kept as is, since the allocator and gate are not to be redesigned.
- Agent A: Month-end events are emitted per step (decisions are batched inside `Nebraska.analyze`), and the seven gate events are written after `executePayout` using the gate audit's own timestamp.
- Agent A: Observed 2026-11-12 against `api-m.sandbox.paypal.com` (no secrets recorded): OAuth client-credentials succeeded; the token scope list includes `https://uri.paypal.com/payments/payouts`, `.../services/subscriptions` and `.../services/applications/webhooks`; `GET /v1/payments/payouts/<unknown id>` returned 404 INVALID_RESOURCE_ID (not 403), so the Payouts API is reachable. A real batch submission has **not** been made yet, so Payouts entitlement and sandbox balance are still unproven.
- Agent A: `GET /v1/reporting/balances` returned 403 NOT_AUTHORIZED for this app (Transaction Search / reporting not enabled); the read-only reconcile cross-check may need that feature switched on in the PayPal app settings.
