# Security, money boundaries and recovery

## Threat model

A package author has a direct financial incentive to manipulate the decision model. README text, issue summaries, funding links and security advisories are untrusted. Assume the decision model can be completely fooled. The effect must remain within bounded weights and verified recipients; model confidence is not a security guarantee.

The application host, configured administrator, signing secret, database superuser and PayPal sandbox credentials are trusted. Admins can authorize fiscal hosts, release holds and initiate guarded settlement. An append-only trigger prevents ordinary application mutation, but does not protect against a hostile database superuser. Hash-chain replay detects edits against the retained chain; externally anchored signatures/checkpoints are not implemented.

## Authentication and privacy

Sandbox requires a 32+ character session secret and independent admin token. Browser cookies are HttpOnly, SameSite=Lax, and Secure for HTTPS APP_URL. GitHub OAuth state expires after ten minutes. The GitHub token is AES-256-GCM encrypted before it enters the signed session cookie. Sessions expire within eight hours. Scoped organization tokens have explicit expiry and cannot access another payer or initiate global payouts. Rotate the session secret to revoke all signed sessions/tokens.

Mutations reject unexpected Origin headers. Webhooks bypass browser auth only after PayPal’s signature verification endpoint returns SUCCESS for the configured webhook ID. Payloads are bounded to two MB and usage batches to 100. Production should add a reverse-proxy rate limit and a database user with minimal privileges before wider exposure.

Maintainers see organization and repository counts. Organization names appear only when the payer opts in. Raw source, repository URLs from the meter and PayPal/model secrets never enter the Treasurer context. Metadata repositories are public sources and not payout destinations; recipients come from verified claim records or authorized hosts.

Demo mode has no authentication and uses a separate default local database. It deliberately accepts simulated approval actions. Do not attach real credentials or confidential usage to an exposed demo instance. Sandbox has no demo approval API and never calls PayPal live endpoints.

## Recipient protection

GitHub admin/maintain permission is checked against the package’s canonical repository. Admin permission is required to customize shares. New claims and email changes cool down for 14 days. Changed payment recipients are held for human review. Risk >=0.3 or uncertain risk also creates a hold. Models can create a hold but cannot release one.

Fiscal hosts require an administrator’s recorded identity/authority attestation plus the maintainer’s separate consent. Host verification is a human operation, not an automatic legal identity claim. New host details/authorization cool down for 14 days. The payout receiver is derived from these trusted records and checked again at execution.

## Payment recovery

| Situation | Correct action |
|---|---|
| Provider request times out | Keep reservations; retry `payout.execute` with the exact stored batch within 29 days; never change the ID/payload |
| PayPal reports DUPLICATE_BATCH_ID | Resolve the original batch through PayPal’s validated self link; record its provider ID |
| More than 29 days since uncertain preparation | Gate rejects resubmission. Reconcile provider history and manually investigate; never create another batch for that period |
| Recipient changes after reservation | Gate rejects retry to a different receiver; reconcile the uncertain original before any manual repair |
| UNCLAIMED / HELD / BLOCKED | Funds remain reserved. The exception model may hold and surface an in-app review notice; it cannot make them available |
| Confirmed FAILED / RETURNED / CANCELED | Restore the exact original credit references once; schedule in a later monthly batch |
| Batch DENIED | Query authoritative batch state; release its reserved credits as failed and preserve its period identity |
| Success notification arrives after confirmed return | Do not regress the final state or remove returned credit |
| Late recurring payment | Record once by sale ID in the next open organization period |
| Grant capture arrives after batch freeze | Credit for the following monthly batch; never append to the stored payload |
| Funds under the minimum | Keep in the ledger, aggregate across payers in that currency next month |
| Unclaimed for six months | Recycle once into the original payer’s following-month pool |
| Model unavailable | c/n become neutral; unknown risk holds; emergency grants are not proposed |

Provider status overrides are not a public API. Manual accounting intervention should be a separately reviewed append-only event/migration with independent PayPal evidence; rewriting or deleting journal rows destroys the audit chain.

The implementation handles the lifecycle events listed in the supplied design. Chargebacks, subscription refunds, regulatory escrow, tax/KYC reporting, production treasury liquidity and foreign-exchange execution are outside the sandbox product. A real-money rollout must add a regulated arrangement and refund/dispute accounting before accepting live funds.
