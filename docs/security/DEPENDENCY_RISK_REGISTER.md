# Dependency Risk Register

Last reviewed: 31 August 2026

## Known advisories

| ID | Dependency path | Severity | Exposure in Cognaxis | Disposition |
|---|---|---:|---|---|
| D-01 | `firebase-admin -> @google-cloud/storage -> gaxios/teeny-request -> uuid@9` | Moderate | The advisory concerns caller-supplied buffers in UUID v3/v5/v6. Cognaxis does not call those UUID APIs and does not implement Cloud Storage in the MVP. | Track upstream Firebase Admin/Storage updates. Do not use `npm audit fix --force`, which currently proposes an unsupported Firebase Admin downgrade. Re-evaluate before release and after dependency updates. |

`npm audit` reports six moderate findings, all belonging to the single D-01 path. Installing the
authentication packages below introduced no new advisory of any severity.

Release policy remains unchanged: no known Critical or High finding may ship. Moderate findings
require a documented reachability assessment and disposition.

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

### Lockfile note

`package-lock.json` is the authoritative lockfile and is regenerated by `npm install`. A stale
`bun.lock` remains in the repository from an earlier tool evaluation and is not used by any
documented workflow; it should be removed in a separate housekeeping change so that two lockfiles
cannot drift apart.
