# Dependency Risk Register

Last reviewed: 30 August 2026

| ID | Dependency path | Severity | Exposure in Cognaxis | Disposition |
|---|---|---:|---|---|
| D-01 | `firebase-admin -> @google-cloud/storage -> gaxios/teeny-request -> uuid@9` | Moderate | The advisory concerns caller-supplied buffers in UUID v3/v5/v6. Cognaxis does not call those UUID APIs and does not implement Cloud Storage in the MVP. | Track upstream Firebase Admin/Storage updates. Do not use `npm audit fix --force`, which currently proposes an unsupported Firebase Admin downgrade. Re-evaluate before release and after dependency updates. |

Release policy remains unchanged: no known Critical or High finding may ship. Moderate findings require a documented reachability assessment and disposition.
