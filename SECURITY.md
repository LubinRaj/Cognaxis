# Security Policy

## Project status

Cognaxis is pre-release software under active development. No version is currently supported for production use.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, private data, or a reproducible tenant-isolation bypass.

Use GitHub private vulnerability reporting for this repository when available. If it is unavailable, contact the repository owner privately through the owner's GitHub profile and provide only enough initial detail to establish a secure communication path.

Include:

- the affected component or document;
- the security impact;
- minimal reproduction steps using synthetic data;
- prerequisites and affected identities or scopes;
- any known workaround.

Never test against accounts, organizations, data, or infrastructure you do not own or have explicit authorization to assess.

## Security expectations

Security reports are evaluated against the documented architecture and threat model. Model instructions are defense-in-depth development controls; they are not accepted as runtime authentication or authorization controls.
