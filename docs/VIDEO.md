# Demo video

A generated English narrated walkthrough is included at `artifacts/nebraska-demo.mp4` with `artifacts/nebraska-demo.srt`, poster, transcript, data bundle and generation metadata. Its duration is approximately **169 seconds** (under three minutes).

It is produced from a **fresh actual `npm run demo` execution**, combining its command output with data-driven visualizations. Transactions, decisions, identities and funding are explicitly simulated throughout. It is **not** browser footage and does **not** establish actual PayPal sandbox execution.

Regenerate with:

```bash
# Node dependencies: npm ci
# Python dependencies, if absent: python -m pip install --user Pillow
# ffmpeg must be installed.
npm run video
```

The script creates seven scenes, generates English narration using eSpeak-NG, enforces the sub-three-minute duration and creates captions. Assets are original programmatic visuals, system fonts and actual demo output; no music or external logo artwork is included. eSpeak-NG is a separate GPL-licensed development dependency; its generated speech output is used as narration.

## Final submission footage

Official rules ask for footage showing the project functioning on its intended device. The local-execution video is a useful prepared asset; add or replace scenes with browser and actual sandbox footage once accounts are connected. This environment lacks the Sites browser-control tool, so no browser recording was fabricated or claimed.

Suggested final cut, below 180 seconds:

| Time | Footage | Message |
|---|---|---|
| 0–18s | Maintainer dashboard, usage and starting balance | The people behind your agents’ dependencies need time to maintain them. |
| 18–38s | Payer authorizes budget on PayPal sandbox | This is the human mandate and its limit. |
| 38–58s | Actual meter command + dependency grid | Deterministic usage, with source code kept private. |
| 58–98s | Treasurer decisions, suspicious-recipient hold, grant proposal and separate PayPal approval | AI changes the amounts; code bounds the consequences. |
| 98–130s | Payout batch and provider item states; repeat settlement | One immutable batch and safe retries. |
| 130–155s | Maintainer income + statements + recompute command | Money buys maintenance time, with proof attached. |
| 155–169s | Closing title | You can still choose not to pay. You cannot say you did not know. |

Record at 1280×720 or higher. Use only dedicated sandbox accounts; avoid displaying secrets, full personal account information or unrelated tabs. Name the actual runtime AI models. Replace simulated evidence with genuine sandbox footage only after it is observed.

Upload the final video publicly to YouTube from the entrant’s account, then put its URL in Devpost. No YouTube upload or public publication was performed in this local build.
