# Dependency Security

Last reviewed: 7 September 2026

`package-lock.json` is the authoritative dependency lockfile. Production, development, and CI dependencies are reviewed separately according to where they execute.

## Controls

- Use maintained packages from recognized sources.
- Keep one JavaScript package-manager lockfile.
- Pin security-sensitive development and CI tooling where reproducibility is important.
- Review dependency purpose, license, maintenance, install scripts, native code, transitive packages, and browser/server placement before adoption.
- Keep development and emulator tooling out of the production runtime path.
- Run production and complete dependency audits during release verification.
- Treat High and Critical findings as release blockers unless a documented security review approves a specific exception.
- Test application behavior after every dependency or lockfile update.
- Never use a forced audit rewrite without reviewing the resulting dependency graph and compatibility impact.

## Verification

```bash
npm audit --omit=dev
npm audit
npm run typecheck
npm test
npm run build
npm run security:check
```

Audit results are time-sensitive and should be generated for the commit being released rather than copied into permanent claims.
