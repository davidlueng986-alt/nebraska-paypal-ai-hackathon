# Submission checklist

Official rules: https://paypalaihackathon.devpost.com/rules
Deadline: **2026-11-12 12:00 Pacific = 20:00 UTC = 21:00 Paris = 2026-11-13 04:00 Taipei**.

Status as of 2026-11-12 18:00 UTC.

## Done (with evidence)

- [x] Public repository with all source, assets and run instructions: https://github.com/davidlueng986-alt/nebraska-paypal-ai-hackathon
- [x] MIT `LICENSE` at the repository root (detected by GitHub).
- [x] PayPal developer platform is central: Subscriptions (budget mandate), Orders v2 (grants), Payouts (one batch per month), verified webhooks, read-only Agent Toolkit cross-check.
- [x] English README for judges, with a 3-minute local path and a "real vs simulated" table.
- [x] Working demo: hosted on Render in sandbox mode (https://nebraska-paypal-ai-hackathon.onrender.com, `/api/health` returned `mode: sandbox` on 2026-11-12), plus full local install steps.
- [x] PayPal sandbox app: OAuth verified; token scopes include Payouts, Subscriptions and Webhooks (2026-11-12).
- [x] Webhook registered for 14 event types and configured on Render (reported by the team).
- [x] Automated checks green on `main`: `npm run check` (54 tests + build), `check:api`, `check:mcp`.
- [x] AI disclosure in README and `docs/DEVPOST.md`.
- [x] Demo film sources and captions in `video/` and `artifacts/video/` (see `docs/VIDEO.md`).

## Must do before submitting

- [ ] Fill the three "TO FILL" rows in the README (sandbox workspace sign-in token, PayPal sandbox payer and maintainer test logins). Sandbox credentials only.
- [ ] Upload the film to YouTube as **Public**, under 3 minutes, and paste the link into Devpost (and optionally the README).
- [ ] Paste `docs/DEVPOST.md` into the Devpost form; add the hosted URL, repository URL and YouTube URL.
- [ ] Submit on Devpost before 20:00 UTC and keep the confirmation.

## Not done (do not claim)

- [ ] A complete real sandbox month (subscription approved → usage → grant → Payouts → webhooks → statement) recorded in `artifacts/sandbox-run/`.
- [ ] A successful runtime model inference (the OpenCode account returned "Insufficient balance").
- [ ] GitHub OAuth verified end to end.

## After judging

- Rotate the PayPal sandbox client secret and the model API key; both were shared in chat during the build.
- Rotate the judge sign-in token.
