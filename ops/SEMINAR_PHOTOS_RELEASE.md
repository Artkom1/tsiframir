# Seminar illustration refresh — 2026-10-15

Base live release and rollback target: `ac872875a66fcc5392123d7b3b974d4fbb4965c0`. Branch: `feature/tsiframir-seminar-photos-20261015`. The seminar remains 1 November 2026, 12:00–15:00 Moscow time; tariffs, contacts, PayKeeper protocol and all payment logic are unchanged. No production invoice or charge is authorized by this release.

## Composition and provenance

The owner supplied `/home/mikhail/Загрузки/PHOTO-2026-10-15-09-56-22.jpg` and `/home/mikhail/Загрузки/PHOTO-2026-10-15-09-56-22 (1).jpg`. Both promotional collages contained an embedded financial guarantee incompatible with the owner's earlier content requirement. Built-in imagegen removed the promotional headline, event copy and drawn CTA, retaining the source composition. These are adapted illustrations, not documentary evidence of attendance or pixel-identical photographs. The originals are untouched.

The first illustration is the complete square seminar hero and upcoming event card through `event.heroImage`, and its JPEG is the social preview. The second accompanies the existing explanation of the author's method, with a neutral illustration caption. Neither is cropped or stretched. The existing approved `/img/kuznetsov-masterclass-2026.webp` source remains `event.speakerImage` and appears in the author section using the previously approved left-aligned 2:3 CSS portrait crop. The archived event image is unchanged. The homepage's existing date graphic is independent of `event.heroImage` and remains unchanged.

Generated source PNGs are in `/home/mikhail/.codex/generated_images/01a13e7d-ce29-7992-9bf7-304472f4cb94/`: `exec-2e3ffc60-8b25-4e70-b45f-41e719417cb9.png` (cover) and `exec-ac772d9e-9d1f-44f5-8518-50ae9f390b34.png` (supporting). FFmpeg Lanczos resizing to 1024×1024, WebP quality82/compression6 and JPEG q3 produce four same-origin assets with the prefix `img/seminar-kuznetsov-` and date `20261015`. Only the hero WebP is preloaded; supporting and author images are lazy. The changed seminar stylesheet uses `v=20261015-photos`. No dependencies, external font requests or new runtime are introduced.

## Verification and release

Task evidence and reviewed release helpers: `/home/mikhail/tsiframir-seminar-photos-evidence-20261015/`. Use `package-release.py` and `deploy-reviewed-release.py` adapted from the previous release. The release helper's exact hash and final archive manifest must be included in the fresh independent Astra xhigh final review.

1. Early fresh Astra xhigh review of the coherent diff, concurrent with scoped unit and layout checks. Resolve findings; review expires after changes.
2. Freeze a clean final commit; fresh independent Astra xhigh review and one complete gate (`npm test`, `npm run test:browser`, production build and exact-commit archive hash manifest). Capture seminar and catalogue at 375/768/1440, inspect both illustrations, real author portrait, keyboard access, no overflow and same-origin loading.
3. Read-only baseline: require current site symlink to equal the base above; record website health and existing nginx PID/vhost hashes, app content hash, and original dirty checkout. Do not read or modify production environment values.
4. Push only the reviewed feature branch after review PASS and gates. Package only `api`, `assets/data/events.json`, `public-dist`, `scripts/serve-production.js`, `scripts/existing-ai-backend.js`, `package.json`; exclude dependencies. Verify every packaged byte against final HEAD, reject links/unsafe paths/duplicates, verify archive SHA256 after upload.
5. Extract into a new root-owned `/opt/tsiframir-site/releases/<FINAL_SHA>` (directories0755/files0644), verify syntax with the existing Node runtime and unprivileged-service permissions. Atomically switch `/opt/tsiframir-site/current`; restart only `tsiframir-site.service`.
6. Verify loopback/public TLS, health, quote and image hashes; three bounded full-body smoke rounds, public screenshots375/768/1440, existing routes/calculators/archive, and read-only negative callback/status checks. Confirm the exact installed manifest, unchanged app, nginx/vhosts, runtime and owner's dirty checkout. No live payment, DNS, TLS, app, API policy, database, Telegram or other-product mutation.

## Rollback

On deployment failure atomically restore `/opt/tsiframir-site/current` to `/opt/tsiframir-site/releases/ac872875a66fcc5392123d7b3b974d4fbb4965c0` and restart only `tsiframir-site.service`. Verify health, seminar, quote and protected app/nginx guards. This restores the previous illustrations while preserving the same three-hour event and payment semantics. No environment, DNS, nginx, TLS or PayKeeper ledger change.
