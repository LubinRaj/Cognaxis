# Cloud Setup Checklist

This checklist covers external state that source code cannot create or prove. Replace every example with values from your own Firebase and Google Cloud project. Never paste secret values into documentation, screenshots, issues, or source.

## Deployment ownership

The maintained workflow is:

1. Develop and verify locally.
2. Push the reviewed commit to GitHub.
3. Sync that commit into Google AI Studio.
4. Verify the AI Studio Preview.
5. Publish from AI Studio to Cloud Run.
6. Verify the deployed revision and its external configuration.

AI Studio publishes the application to a Cloud Run revision. Keep the application and cloud configuration aligned across releases.

- Keep public Firebase build variables and the server Gemini secret configured in the AI Studio project/deployment surface when supported.
- Keep variable names stable. Ordinary UI and bug-fix commits must not introduce replacement values or rename deployment variables.
- Verify runtime identity, IAM, Secret Manager references, instance limits, labels, and Firebase console settings after publishing.
- Keep environment-specific values in managed configuration rather than source code.

## Firebase Authentication

- [ ] Google sign-in is enabled.
- [ ] Email/password sign-in is enabled if offered by the application.
- [ ] Email enumeration protection is enabled.
- [ ] The password policy matches the product policy.
- [ ] The production hostname is listed as an authorized domain.
- [ ] Verification and password-reset templates use approved links and branding.
- [ ] A new email/password user cannot access private routes before verification.
- [ ] Sign-out, account switching, and one-time token refresh recovery work on the deployed origin.

## Firestore

- [ ] A Native mode database exists in the intended region.
- [ ] `firestore.rules` is deployed. It intentionally denies direct confidential client access.
- [ ] Every composite and vector index in `firestore.indexes.json` is enabled.
- [ ] The runtime identity can perform only the Firestore operations required by the server.
- [ ] Cross-user and cross-organization requests fail through the deployed API.

Required index groups currently include personal check-ins, personal insights, organizations, filtered/paginated platform users, platform admin audit, and the 768-dimensional `memoryChunks` vector field.

The expected client policy is:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Deploy the checked-in rules and indexes from the repository root:

```bash
npx firebase deploy \
  --only firestore:rules,firestore:indexes \
  --project YOUR_PROJECT_ID
```

Cognaxis verifies Firebase identity and binds the verified UID or authorized organization scope in Cloud Run; authenticated browsers receive no direct Firestore access. Because Firebase Admin bypasses client rules, least-privilege IAM and server authorization are both mandatory.

## Firebase Storage

- [ ] The private bucket exists and `FIREBASE_STORAGE_BUCKET` uses its exact name.
- [ ] The Cloud Run identity can create, read, and delete application objects in that bucket.
- [ ] The bucket is not publicly readable.
- [ ] A user cannot fetch another user's or another organization's attachment through the API.
- [ ] Attachment deletion removes metadata and the stored object.

## Secret Manager

- [ ] The Gemini API key is stored in a dedicated secret.
- [ ] Cloud Run receives it as `GEMINI_API_KEY` through a Secret Manager reference.
- [ ] The reference uses a reviewed numeric version for predictable releases.
- [ ] The runtime identity has Secret Accessor only on that secret.
- [ ] No raw key appears in Cloud Run plaintext variables, repository files, build logs, screenshots, or client assets.

Rotate and revoke the key immediately if it is exposed. Removing it from the latest commit is not enough once it has been published.

## Runtime identity and IAM

- [ ] Cloud Run uses a dedicated service account with no user-managed JSON key.
- [ ] The runtime does not have Owner or Editor.
- [ ] Firestore, Storage, Secret Manager, and optional Agent Platform access are the minimum required.
- [ ] The Firebase Admin token-verification path works with Application Default Credentials.
- [ ] Operator and deployment access are separate from runtime access where practical.

## Cloud Run configuration

Required server settings:

| Variable | Requirement |
|---|---|
| `APP_ORIGIN` | Exact production origin with no path or trailing slash |
| `GOOGLE_CLOUD_PROJECT` | Project used by Firebase Admin and optional fallback |
| `GEMINI_MODEL` | Supported configured model |
| `GEMINI_API_KEY` | Secret Manager reference, not plaintext |
| `FIREBASE_STORAGE_BUCKET` | Exact private bucket name |
| `FIREBASE_AUTH_DOMAIN` | Exact authentication domain for CSP |

Optional server settings:

- `AGENT_PLATFORM_FALLBACK_ENABLED`
- `FEATURE_INSIGHTS`
- `FEATURE_MAPS`
- `FEATURE_ORGANIZATIONS`
- `FEATURE_ADMIN`

Public build settings managed by AI Studio:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- optional `VITE_GOOGLE_MAPS_API_KEY`

Also verify:

- [ ] The service listens on Cloud Run's supplied port.
- [ ] Maximum instances and request concurrency match the cost plan.
- [ ] Budget alerts and provider quotas are configured.
- [ ] Required challenge/service labels are present.
- [ ] The production revision serves no source maps or development configuration.
- [ ] `/api/health` returns only `{"status":"ok"}`.

## Browser API keys

Firebase web configuration is public by design. The Maps key is also visible in the browser. Protect them with Google Cloud restrictions:

- [ ] Allow only the required APIs.
- [ ] Add exact production HTTP referrers and approved preview origins.
- [ ] Remove unrelated APIs and origins.
- [ ] Never reuse either browser key as a Gemini or server credential.

## First super admin

The first super admin is created only after that user has signed in once:

```bash
GOOGLE_CLOUD_PROJECT=<project-id> npx tsx scripts/admin/bootstrap-super-admin.ts <firebase-uid>
```

Run this from a trusted operator environment with Application Default Credentials. Do not place the real UID in scripts or documentation. There is intentionally no public bootstrap endpoint.

## Release verification

Use dedicated synthetic accounts, never a real user's journal.

- [ ] Public landing, privacy, terms, and authentication routes load.
- [ ] Google and email/password authentication work.
- [ ] A reflection streams, persists after refresh, summarizes, archives, restores, and deletes.
- [ ] Ask Me returns a grounded source for known personal and team history.
- [ ] Image/document attachment and voice transcription paths work.
- [ ] Check-ins, insights, and Maps or its explicit fallback work.
- [ ] Owner/admin/member/viewer behavior matches the role matrix.
- [ ] Viewer-only teams do not appear in the Journal creation selector.
- [ ] User and audit administration APIs load for a super admin and reject an ordinary user.
- [ ] Admin responses contain no journal, message, check-in, location, attachment, or memory content.
- [ ] Browser console and server logs contain no credentials or private content.
- [ ] `npm run security:check` passes against a fresh production build.

Record only sanitized outcomes. Do not commit screenshots or reports that contain account identifiers or production configuration.
