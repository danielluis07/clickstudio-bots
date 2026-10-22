# Bun 1.4.4 assessment

Assessed 2026-10-22 at HEAD `2bc202b`. This is a release-focused source audit, not a full security/performance audit or implementation plan. Only this note was added.

## Verified release and local environment

Bun 1.4.4 was released October 22, 2026: [official GitHub release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4), commit `38afee6`. The [official article](https://bun.com/blog/bun-v1.4.4) was successfully fetched with PowerShell after browser extraction failed; publication metadata is `2026-10-22T00:58:24.788Z`. Search results showing 1.4.3 were stale.

Local Windows Bun is already 1.4.4. Both `bun check --help` and `bun fmt --help` work. `process.versions.typescript` reports `7.0.2`. Neither reviewed command is labeled experimental in its documentation.

## Priorities

### [DX-01] Align runtime declarations and CI

- **Evidence:** `package.json:63` declares `bun@1.4.3`; `.github/workflows/ci.yml:22` installs 1.4.3; `package.json:51` declares `@types/bun` as `^1.4.3`. `vercel.json:2` selects `1.4.x`.
- **Impact:** Local development and CI exercise different patch versions. Alignment also brings install retry improvements and Windows installation fixes. [Release notes](https://bun.com/blog/bun-v1.4.4).
- **Effort / risk / confidence:** S (hours), LOW, HIGH.
- **Fix sketch:** Pin manifest and CI to 1.4.4 together. Refresh Bun types deliberately and review lockfile changes; a caret range does not update an existing pin. Preserve frozen CI installs. Keep Vercel's supported minor selector and verify the deployed patch in logs.

### [DX-02] Add an optional fast typecheck

- **Evidence:** `package.json:10` runs `next typegen` then `tsc --noEmit`; `package.json:61` uses TypeScript `^5`. `tsconfig.json:5` already includes Bun types, and `tsconfig.json:22` uses relative aliases without `baseUrl`.
- **Impact:** Faster local feedback is promising: both checkers passed; one sequential Windows measurement was approximately **0.94 s for Bun versus 17.03 s for tsc**, with incremental caching disabled. Bun checked 318 files.
- **Effort / risk / confidence:** S for an optional command; MED risk for replacement; HIGH confidence in this smoke result, MED in migration suitability.
- **Fix sketch:** Add `typecheck:fast` preserving `next typegen`, followed by `bun check`. Keep `tsc` authoritative while establishing diagnostic parity and editor compatibility.

The [checker documentation](https://bun.com/docs/runtime/check) specifies bundled TypeScript 7 rules regardless of installed TypeScript. Bun does not emit declarations or `.tsbuildinfo`; language-service plugins do not load. The timing above excludes Next type generation, uses one run each, and is not an everyday speed ratio: existing incremental tsc runs may be faster. Release checker benchmarks compare Bun 1.4.4 against 1.4.3, not tsc.

### [DX-03] Establish formatting with Bun

- **Evidence:** `package.json:9` provides ESLint, with no formatter script/configuration found. `package.json:59` installs Tailwind 4. A read-only scan over explicit source/configuration paths flagged 305 files with default formatter options.
- **Impact:** Consistent formatting without another formatter dependency; a deliberate baseline is needed before CI enforcement.
- **Effort / risk / confidence:** S–M including baseline review; LOW for optional checks, MED for bulk changes; HIGH.
- **Fix sketch:** Choose options matching current code, establish a separate formatting baseline, then add format/check scripts. Retain ESLint. Trial optional Tailwind sorting; decide import sorting separately.

The [formatter documentation](https://bun.com/docs/format) supports `[fmt]`, read-only `--check`, targeted paths, and sorting using installed Tailwind 3/4. `--staged` re-stages files and refuses partially staged files needing formatting. `--doctor` inspects configuration; `--debug-check` helps validate a trial. Compatibility does not guarantee identical Prettier output. [Compatibility notes](https://bun.com/blog/bun-v1.4.4#testing-bun-fmt).

### [DX-04] Restore Bun's dependency cache in CI

- **Evidence:** `.github/workflows/ci.yml:20` sets up Bun and line 24 performs a frozen install, without explicit dependency-cache restoration. `test/support/database.ts:27` already reuses a migrated PGlite dump. No Docker workflow was found.
- **Impact:** Avoid repeated registry downloads; actual CI savings remain unmeasured.
- **Effort / risk / confidence:** S, LOW, HIGH about the missing step; MED about speedup.
- **Fix sketch:** Resolve the cache path using `bun pm cache`, restore it before installation, and measure. Key by platform, Bun version, and lockfile. Keep frozen installs authoritative.

New `bun pm fetch` fills only the cache; cache `pack`/`unpack` support portable archives. Consider these only when ordinary caching leaves a concrete problem. Advertised warm-linking gains apply to Linux hoisted installs, not Windows. [Cache features](https://bun.com/blog/bun-v1.4.4#bun-pm-fetch).

### [DEP-01] Consider a dependency release-age policy

- **Evidence:** Ranges appear at `package.json:23` and `package.json:61`; no release-age policy exists. CI already freezes the lockfile.
- **Impact:** Optional delay before newly published dependency adoption, at the cost of delayed legitimate updates.
- **Effort / risk / confidence:** S, LOW–MED, HIGH support confidence; MED policy fit.
- **Fix sketch:** Consider `minimumReleaseAge = "3d"` with narrow `package@version` exceptions. Filtering predates this release; readable units and per-version exclusions are new. Frozen locked versions are not re-filtered. [Release-age changes](https://bun.com/blog/bun-v1.4.4#minimumreleaseage-supports-units-and-per-version-exclusions).

## No current adoption case

Keep the shared `pg` pool and `attachDatabasePool`: `db/index.ts:11` and ADR `0003:3` document the integration. No release evidence establishes that the alias-cache workaround at `next.config.ts:5` is fixed. Ably browser Realtime/server Rest usage does not justify native WebSocket migration. Yarn migration, workspace publishing, and Bun's own development server do not address this private single Next.js app.

## Validation

On Bun 1.4.4: **221 tests passed, zero failed**, 1,004 assertions across 31 files, approximately 44.52 s. Both checkers passed as described above. No dependency install/update, formatting application, lint, production build, or deployment was performed. The release fixes coverage accounting; future coverage percentages may change without a code regression.

## Follow-up: upgrading TypeScript itself

TypeScript 7.0 is stable; TypeScript 7.1 is currently a beta, announced October 20. The existing Bun checker passing this project is encouraging evidence about source compatibility, but it does not validate a TypeScript package replacement.

**The current ESLint parser prevents a simple root dependency replacement.** `eslint.config.mjs:3` imports Next's TypeScript rules. The installed `typescript-eslint` and `@typescript-eslint/typescript-estree` are both 8.71.2 and require TypeScript `>=4.8.4 <6.1.0`. The parser resolves the current root `typescript@5.9.3` and calls `ts.createSourceFile` in `node_modules/@typescript-eslint/typescript-estree/dist/create-program/createSourceFile.js:50`, even without typed linting. [Official supported versions](https://typescript-eslint.io/users/dependency-versions/).

TypeScript 7.0 has no compiler API; Microsoft recommends keeping the compatibility API beside its native compiler. Its documented dependency arrangement is `typescript: npm:@typescript/typescript6@^6.0.2` plus `@typescript/native: npm:typescript@^7.0.2`: tools importing `typescript` retain the old API, while the native package supplies `tsc`. [Official migration guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/). This is a viable migration candidate requiring validation, not a completed change.

The [7.1 beta API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/) uses new entry points such as `typescript/sync` and `typescript/ast`; its existence does not make the installed ESLint parser compatible. Prefer stable 7.0 with deliberate compatibility handling over a beta for this project.

**Next build needs separate handling.** Installed Next 16.4.2 defaults to `useTypeScriptCli: true` (`node_modules/next/dist/server/config-shared.js:263`), but `getTypeScriptPackageInfo` in `node_modules/next/dist/lib/typescript/runTypeScriptCli.js` resolves `typescript/package.json` and selects that package's `tsc` or `tscN` executable directly. It does not choose `tsc` from PATH. Consequently, the official aliases can make a standalone `tsc` script use TypeScript 7 while `next build` still uses compatibility TypeScript 6. Do not claim that arrangement upgrades both checks automatically.

Installed `tsx@4.23.15` uses esbuild; `drizzle-kit@1.0.0-rc.4` uses esbuild/get-tsconfig/jiti and has no runtime TypeScript dependency or direct `require("typescript")` found in its published executable. Neither is an established blocker from this inspection. At the time of this assessment, official TypeScript 7 had not been installed or tested; the implementation results below supersede that validation limit.

## Implementation results

Implemented after the user's selection on 2026-10-22:

- Bun 1.4.4 is declared in `package.json`; CI reads the manifest using `bun-version-file`. Vercel retains its supported `1.4.x` selector.
- Native TypeScript 7.0.2 supplies `tsc` through `@typescript/native`. The TypeScript 6 compatibility package supplies the JavaScript API for ESLint and Next's build checker; its resolved underlying compiler is 6.0.3.
- Added `typecheck:fast`, preserving `next typegen` before Bun's checker. The authoritative CI typecheck uses native TypeScript 7.
- Added Bun formatting and CI enforcement, with a 100-column code baseline and Tailwind class sorting. Generated migrations and Markdown are excluded; import order is preserved. `.gitattributes` standardizes LF checkouts across Windows and Linux.
- CI restores Bun's package cache using keys containing OS, architecture, Bun version, and lockfile hash. Frozen installs remain mandatory. Cache savings require a GitHub Actions run to measure.
- The registry's latest `@types/bun` is still 1.4.3, so its existing range is retained. No release-age policy was added.

Validation passed: frozen installation, native TypeScript 7 typecheck, Bun typecheck, ESLint, formatting check (325 files), formatter semantic debug check, migration generation with no drift, all 221 tests (1,004 assertions), and a production build using placeholder database and service settings. The source-formatting review found no domain or test logic changes; the additional type-parentheses change in `platform/diagnostics.ts` is equivalent. No migrations or deployment were performed.
