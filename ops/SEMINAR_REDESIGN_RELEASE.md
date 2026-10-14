# Seminar redesign release — 2026-10-14

Base live release: `aedc08458e592d7b4f96ccbf2b5f0158f18e6dba`. Only the existing Nizhny Novgorod seminar page and its event references are updated. The event remains `seminar-2026-nizhny-novgorod`, with the same order prefix, merchant, signature and receipt protocol. No new production invoices, bank attempts or charges are permitted for this release.

The meeting is now 1 November 2026, 12:00–15:00 Moscow time: 180 contiguous minutes including a 15-minute break. New sales close at 15:00. Existing provider records and signed receipts remain authoritative independently of the revised display title. Tariffs remain 1600/1800/2000 RUB on the existing date boundaries. Only event-specific contacts become +79202997772 and +79087305573. June archive and global contacts remain unchanged.

## Content and assets

Source: the public post https://t.me/cifra_miir/14 and the owner's written corrections. The post's original 800×536 poster is optimized as `/img/kuznetsov-masterclass-2026.webp`; the portrait is displayed with a left-aligned CSS 2:3 crop that excludes the right-side guarantee. No face is generated, retouched or raster-cropped. The separately generated decorative image is `/img/masterclass-pi-2026.webp` (1200×800). Both assets are served from the same origin. The portrait alone is preloaded; the decorative image is lazy. All fonts use the existing system stacks. No third-party critical requests or new dependencies.

The page presents an author's numerological approach, without scientific validation or guaranteed income claims. Program timing inside the confirmed three-hour meeting is explicitly preliminary. Individual analysis for every participant is not promised.

The owner's subsequent catalogue correction applies to both upcoming and archived event cards on `/forums/`: their existing graphics use centered `contain` without repetition, preserving the complete images on desktop and mobile. This does not change the June archive's content, image source or payment policy, and is separate from the explicitly approved seminar portrait crop.

The seminar's changed CSS/JS and catalogue stylesheet use the release query `v=20261014-masterclass`. This prevents previously cached five-minute assets from mixing the new HTML with the old portrait layout or six-hour receipt text. The existing adapter preserves query handling and the global cache policy stays unchanged.

## Gates

1. Early fresh Astra xhigh review of the first coherent commit, concurrent with scoped unit and browser checks. Resolve findings.
2. Freeze final clean commit; obtain a fresh independent Astra xhigh exact-diff review. Run one complete release gate: `npm test`, `npm run test:browser`, production build, archive membership/hash manifest verification. Check 375/768/1440 layouts, source-photo crop, keyboard access, no overflow, image loading and no external critical requests.
3. Build locally. Package only `api`, `assets/data/events.json`, `public-dist`, `scripts/serve-production.js`, `scripts/existing-ai-backend.js`, `package.json`; no node_modules or development dependencies. Record SHA256/size and file manifest for the exact final commit. Compare unchanged public assets and June data against base. Push only the reviewed feature branch; never release old main.

## Deployment after review PASS and local gates

1. Read-only baseline: current symlink equals the accepted base, only the website service is healthy on 127.0.0.1:8093, existing six nginx vhost hashes and master PID match phase1 evidence; app's HTTP content/hash and original owner's 22 dirty changes remain unchanged. Record memory, time and service restart count. Existing Node runtime is `/opt/tsiframir-site/runtime/bin/node` v22.23.3.
2. Upload archive into a task-scoped directory using existing owner SSH access to 201.51.29.219. Verify its hash before extracting to a new `/opt/tsiframir-site/releases/<FINAL_SHA>` directory. Reject unsafe paths, links, duplicate members and unexpected members before extraction. Normalize root:root, directories0755/files0644. The unprivileged `tsiframir-site` user must not write the release or current-link parent. Do not read/export/modify production ENV.
3. Validate the new release using the existing Node binary's syntax checks, then atomically replace `/opt/tsiframir-site/current` with a symlink to the new release and restart **only** `tsiframir-site.service`. Do not reload nginx, change DNS/TLS/system packages or touch any other service.
4. Verify loopback health, event page, payment quote (`paymentAvailable=true`, amount1600, end/salesClose15:00), same-origin assets, original routes/calculators/archive and real public TLS. Perform three bounded full-body public smoke rounds, browser screenshots375/768/1440 and read-only callback/status negative tests. No live invoice or charge. Existing phase1 unpaid expiry evidence remains historical and is not re-created.
5. Final read-only guards: exact file manifest, current symlink/commit, service state and memory, no unexpected restart loop, unchanged nginx master/vhosts/app content and original22dirty checkout. Record Git branch, remote SHA, review/test/screenshot paths and limitations in phase2 report. Parent writes the final desktop mirror after all work.

## Rollback

On release failure atomically restore `current` to `/opt/tsiframir-site/releases/aedc08458e592d7b4f96ccbf2b5f0158f18e6dba`, restart only `tsiframir-site.service`, verify loopback/public page, quote and app guards. This restores the old six-hour displayed event; report that content rollback explicitly. DNS, nginx, TLS, site secrets and PayKeeper ledger are unchanged. No app/global-service restart.

## Operational limits

Reuse existing website restart-on-failure, scoped certificate renewal and workstation five-minute external health check. The workstation check is not always-on monitoring or proof for all Russian ISPs. Optional cloud AI retains the reviewed existing Vercel backend and its capacity/availability limits. Phase2 does not change this path or repeat paid AI inference. No email delivery or paid E2E is claimed.
