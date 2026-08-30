# Cognaxis Cloud Setup Checklist

Status: Not provisioned
Execution rule: Each state-changing Google Cloud or Firebase step requires project-owner approval before it is performed.

## 1. Decisions required first

- Confirm the Firebase/Firestore region. Prefer the region nearest the expected demo users and keep Cloud Run in a compatible nearby region.
- Confirm the final production origin and Cloud Run service name.
- Confirm whether the Gemini Developer API key requirement will be met by a key stored in Secret Manager or whether the event accepts Vertex AI identity-based access. The current code implements the challenge's explicit Secret Manager key path.

## 2. Firebase

- Attach Firebase to the existing ideathon Google Cloud project.
- Register a web application named `Cognaxis Web`.
- Enable Google as an Authentication sign-in provider.
- Add only localhost and the final Cloud Run/custom domains to authorized domains.
- Copy the Firebase web configuration identifiers into deployment environment variables; never add Admin SDK credentials to the browser.
- Create Firestore in Native mode in the approved region.
- Deploy `firestore.rules` only after emulator verification. These baseline rules deny all direct confidential client access.

## 3. Gemini secret

- Enable Secret Manager only when ready to configure the runtime.
- Create a secret named for the Cognaxis Gemini credential.
- Add the key as a secret version without displaying it in screenshots, logs, shell history, source, or chat.
- Use a pinned numeric version in `GEMINI_API_KEY_SECRET`; do not use `latest` for the production environment.

## 4. Runtime identity and IAM

- Create a dedicated keyless Cloud Run runtime service account.
- Do not create or download a service-account key.
- Grant only the datastore permissions required by the repository operations.
- Grant `roles/secretmanager.secretAccessor` on the single Gemini secret, not at project scope.
- Do not grant Owner, Editor, IAM administration, billing administration, or broad Secret Manager roles to the runtime.
- Record sanitized IAM evidence without principal email addresses or project identifiers.

## 5. Cloud Run

- Build from the reviewed commit using the included `Dockerfile`.
- Set `APP_ORIGIN`, `GOOGLE_CLOUD_PROJECT`, `GEMINI_MODEL`, and the pinned `GEMINI_API_KEY_SECRET` resource name.
- Never set `GEMINI_API_KEY_LOCAL` in production.
- Bind the dedicated runtime service account.
- Set conservative request concurrency, timeout, maximum instances, and minimum instances for the demo budget.
- Restrict unauthenticated access to the public HTTPS service only; all protected application routes still require Firebase tokens.
- Configure budget alerts and review logs for metadata-only behavior.

## 6. Release verification

- Run Firestore emulator rule tests and API integration tests with synthetic User A/User B accounts.
- Verify a forged, expired, wrong-project, and revoked token matrix.
- Verify User A cannot read, summarize, delete, or infer User B data.
- Inspect the production browser bundle for credentials and server-only modules.
- Verify exact-origin CORS, CSP, private/no-store responses, rate limits, and generic errors.
- Verify Secret Manager access works through runtime identity without a user-managed key.
- Verify deleting a session removes its messages and derived summary.
- Record the tested commit, environment, date, sanitized result, and residual risks.
