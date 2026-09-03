# Dependency Risk Register

Last reviewed: 3 September 2026

## Extended-features dependency review (3 September 2026)

The extended-features remediation regenerated `package-lock.json` from the reviewed
`package.json` (the previously committed lockfile did not match the manifest and blocked
`npm ci`), removed the unapproved `bun.lock`, and added exactly two production dependencies.
`npm audit` after regeneration still reports only the six moderate findings of the pre-existing
D-01 path; no new advisory of any severity was introduced.

| Package | Version | Placement | Purpose | Licence | Notes |
|---|---|---|---|---|---|
| `react-router-dom` | ^7.18 | Browser | Authenticated routes with deep links, history, and lazy loading | MIT | The specification permits one established router; no custom routing framework was written |
| `@googlemaps/js-api-loader` | ^2.1 | Browser, dynamically imported | Official on-demand Maps JavaScript API loader | Apache-2.0 | Loaded only inside the lazily routed map/location surfaces via `import()`; never part of the entry chunk |

Packages that the earlier commit had injected into the lockfile without manifest entries or any
import (`recharts`, `d3-*`, `date-fns`, a second `react-router` copy) were removed by the
regeneration. Charts are rendered by an internal accessible SVG component, and date/period
arithmetic uses the platform `Intl` API, so no charting or date library was added.

## Known advisories

| ID | Dependency path | Severity | Exposure in Cognaxis | Disposition |
|---|---|---:|---|---|
| D-01 | `firebase-admin -> @google-cloud/storage -> gaxios/teeny-request -> uuid@9` | Moderate | The advisory concerns caller-supplied buffers in UUID v3/v5/v6. Cognaxis does not call those UUID APIs and does not implement Cloud Storage in the MVP. | Track upstream Firebase Admin/Storage updates. Do not use `npm audit fix --force`, which currently proposes an unsupported Firebase Admin downgrade. Re-evaluate before release and after dependency updates. |
| D-02 | `firebase-tools -> @google-cloud/pubsub / @opentelemetry/core / nested express / body-parser / qs / re2 / gaxios` | Moderate (dev-only) | The pinned Firebase CLI is a development dependency used exclusively to run the local Auth/Firestore emulators for tests. No application code imports it, it never runs in production, and it processes only synthetic emulator traffic on loopback. | Accepted for development. Track `firebase-tools` releases and re-pin when upstream absorbs the fixed transitive versions. Do not use `npm audit fix --force` or overrides merely to empty the report. |

Current audit state (verified 3 September 2026):

- `npm audit --omit=dev` reports **six moderate** findings — all the single D-01 chain
  (`uuid`, `gaxios`, `teeny-request`, `retry-request`, `@google-cloud/storage`,
  `firebase-admin`). These are the only advisories touching anything that ships.
- Full `npm audit`, including development tooling, reports **thirteen moderate** findings — the
  six above plus seven inherited through the pinned Firebase CLI (D-02: `firebase-tools`,
  `@google-cloud/pubsub`, `@opentelemetry/core`, a nested `express`/`body-parser`, `qs`, `re2`).
- There are **no high or critical findings** at either level.

Release policy remains unchanged: no known Critical or High finding may ship. Moderate findings
require a documented reachability assessment and disposition, and neither incompatible
downgrades nor risky overrides are permitted merely to make the report empty.

## Authentication dependency review (31 August 2026)

Reviewed for the FirebaseUI authentication feature. All four packages are published from the
official `firebase/firebaseui-web` repository, carry npm registry signatures, and ship an
Apache-2.0 `LICENSE` file. `@firebase-oss/ui-core` declares `"license": "MIT"` in its
`package.json` while shipping the Apache-2.0 text; the shipped licence file governs, and the
inconsistency is an upstream metadata defect with no licence-compatibility impact for Cognaxis.

| Package | Version | Placement | Purpose | Licence | Notes |
|---|---|---|---|---|---|
| `@firebase-oss/ui-react` | 7.1.0 (exact) | Browser, lazy-loaded | Official React authentication forms, screens, and provider buttons | Apache-2.0 | Peer range `firebase ^11 \|\| ^12`, `react ^19` matches the approved stack |
| `@firebase-oss/ui-core` | 7.1.0 (exact) | Browser, lazy-loaded | Credential calls, behaviours, error translation, UI store | Apache-2.0 | All password handling is delegated to the Firebase JavaScript SDK |
| `@firebase-oss/ui-styles` | 7.1.0 (exact) | Browser, lazy-loaded | Baseline stylesheet for `fui-*` class names | Apache-2.0 | Compiled stylesheet only; no runtime code path |
| `@firebase-oss/ui-translations` | 7.1.0 (exact) | Browser, lazy-loaded | `registerLocale` for the Cognaxis enumeration-resistant locale | Apache-2.0 | Promoted from transitive to direct because Cognaxis imports `registerLocale` directly |

New transitive packages introduced by the four direct additions: `@nanostores/react` 1.1.0 (MIT),
`nanostores` 1.5.2 (MIT), `@nanostores/deepmap` 1.0.0 (MIT), `@radix-ui/react-slot` 1.3.3 (MIT),
`@tanstack/react-form` 1.33.0 (MIT), `libphonenumber-js` 1.13.12 (MIT), `qrcode-generator` 2.0.4
(MIT), `cva` 1.0.0-beta.4 (Apache-2.0), and a nested `zod` 4.4.3 (MIT) pinned by the FirebaseUI
packages alongside the application's own `zod` 4.5.4.

### Assessed risks

| Risk | Assessment | Disposition |
|---|---|---|
| FirebaseUI 7 is a recent major release and may contain integration defects | Accepted. Exact version pinning plus a lockfile entry keeps the artefact reproducible, and the superseded Google-only sign-in path was removed only after the replacement was tested. | Retain the exact pin. Re-review before any upgrade. |
| Default FirebaseUI English error copy discloses whether an email address is registered (`userNotFound`, `wrongPassword`, `emailAlreadyInUse`) | Confirmed by reading the shipped `en-US` translation set. This conflicts with the mandatory enumeration-resistance control. | Mitigated. Cognaxis registers its own locale with generic copy and additionally sanitises every rendered failure through `auth-errors.ts`. Covered by unit tests. |
| `cva@1.0.0-beta.4` is a pre-release version | Transitive, styling-only, no authorization or credential path. Pinned by `@firebase-oss/ui-styles`. | Accepted for this iteration; recorded for the next dependency review. |
| `libphonenumber-js` and `qrcode-generator` support phone and TOTP flows that Cognaxis does not use | Unused code paths reachable only through phone/MFA components that Cognaxis never renders. They add bundle weight to the lazily loaded authentication chunk only. | Accepted. Re-evaluate if bundle size becomes a release concern. |
| Duplicate `zod` major-compatible copies (4.5.4 application, 4.4.3 nested) | Both are `zod` v4. The nested copy is used only by FirebaseUI form schemas; Cognaxis request validation continues to use its own copy. | Accepted. No shared-instance assumption exists in either direction. |

### Test tooling added

Pinned exactly, development-only, never shipped in a browser or server artefact.

| Package | Version | Purpose | Licence |
|---|---|---|---|
| `jsdom` | 30.0.1 | DOM environment for component tests | MIT |
| `@testing-library/react` | 16.3.3 | React component interaction tests | MIT |
| `@testing-library/dom` | 10.4.1 | Required peer of the React testing library | MIT |
| `@testing-library/user-event` | 14.6.6 | Realistic keyboard and pointer interaction | MIT |
| `@testing-library/jest-dom` | 7.0.1 | DOM assertions | MIT |
| `axe-core` | 4.13.0 | Automated accessibility scanning of rendered screens | MPL-2.0 |

## Automated-testing dependency review (3 September 2026)

Added for the end-to-end and emulator test system. All are development dependencies, pinned in
the lockfile, never imported by application code, and not part of the production browser or
server bundles.

| Package | Version | Purpose | Licence | Notes |
|---|---|---|---|---|
| `@playwright/test` | 1.62.1 (exact) | Browser end-to-end runner (Chromium only) | Apache-2.0 | Traces/videos/reports are gitignored; no authentication state is persisted or committed |
| `firebase-tools` | 15.29.0 (exact) | Local Auth and Firestore emulators for tests | MIT | Source of the D-02 dev-only advisory chain above; loopback emulator traffic with synthetic data only |
| `@firebase/rules-unit-testing` | ^5.0.2 | Firestore Security Rules assertions against the emulator | Apache-2.0 | Talks only to the local emulator with the `demo-cognaxis-e2e` project id |

### Lockfile note

`package-lock.json` is the authoritative lockfile and is regenerated by `npm install`. A stale
`bun.lock` remains in the repository from an earlier tool evaluation and is not used by any
documented workflow; it should be removed in a separate housekeeping change so that two lockfiles
cannot drift apart.
