# Deploying

The Gilded Chamber is a single Cloudflare Worker named `council-night`. Its config is in `wrangler.jsonc`: the `ROOM`
Durable Object binding, the `AI` binding, the `AI_MODE` var, and Static Assets from `public/`.

## Normal path: wrangler

```sh
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run deploy
```

`npm run deploy` runs `wrangler deploy`, which uploads `public/` as Workers Static Assets.

## GitHub Actions

The workflows are kept in `docs/github-workflows/`. Copy them into `.github/workflows/` to turn them on.

- `test.yml` runs `npm test` on every push and pull request (Node 24).
- `deploy.yml` runs only when started by hand. It runs `npm ci` and `npm test`, then `npm run deploy`, then a short
  live smoke test (`GAMES=6 node scripts/sim-games.mjs` against the workers.dev URL). It needs the
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Domains

- The live site is https://secrethitler.hatethespurs.com. `wrangler.jsonc` has no `routes`, so the custom domain is
  configured on the Cloudflare side and a deploy does not change it.
- `workers_dev: true` and `preview_urls: false` in `wrangler.jsonc` match the live worker.
  `test/deploy-workersdev.test.js` pins both values.

## Gotchas

- **Service worker version.** `public/sw.js` has a `VERSION`, which is a hash of every precached file. If `public/`
  changes and the version does not, installed PWAs keep serving the old files. Run `node scripts/stamp-sw.mjs` to
  re-stamp it before you deploy. The script fails if the `PRECACHE` list no longer matches `public/`. In that case,
  regenerate the service worker and its precache list with the PWA generator, using `pwa/pwa.json`.
- **Durable Object migration.** `Room` is a SQLite-backed class created by migration tag `v1`
  (`new_sqlite_classes: ["Room"]`). The live worker already has `v1` applied. Do not edit or remove that migration. Add a
  new tag for any future class change. The API deploy path below sends no migrations, so a brand-new worker must be
  deployed with `npm run deploy` first.
- **AI stays off.** `AI_MODE` is `"dark"`. Only `"on"` lets the Worker call the model. Leave it off unless you mean to
  spend Workers AI quota.

## Deploying without wrangler credentials

`node scripts/build-deploy.mjs <outFile>` writes a deploy function for the Cloudflare API. It reads the worker name,
bindings, compatibility date and workers.dev settings from `wrangler.jsonc` only.

- It runs the full test suite first (`scripts/test-gate.mjs`). On any failure it prints
  `Deploy file NOT written: N test(s) failed`, exits 1, and leaves the out file untouched. There is no bypass.
- It refuses to write the file if the `public/sw.js` version is stale.
- It builds `dist-embedded/worker.js` (via `scripts/build-embedded.mjs`), with every file in `public/` inlined, so no
  separate asset upload is needed.

Every house rule and the test that guards it is listed in [`RULES.md`](../RULES.md).
