# Dependency & Runtime Maintenance Policy

## Objective

Keep the platform supportable for years without turning dependency updates into emergency production changes.

## Supported runtime

The repository declares the supported Node/npm versions. Cloud Run container images and local verification should use the same major runtime family. A runtime change is a release, not an invisible maintenance action.

## Monthly maintenance review

At least monthly during active use:

- review Node LTS/security status and container base-image advisories;
- run `npm outdated` and `npm audit` in a clean branch;
- review Firebase, Firebase Admin, Google APIs, Express, TypeScript, Vite, and security middleware release notes when updates are proposed;
- review Google Cloud/Firebase deprecation notices and OAuth policy notifications;
- verify the production health endpoint and outbox error rate;
- record whether a change is required or consciously deferred.

## Update rules

1. Never run `npm audit fix --force` as a production maintenance strategy.
2. Never accept a breaking downgrade merely because npm proposes it automatically.
3. Update dependencies in a branch/change set with a reproducible `package-lock.json` change.
4. Run clean install, typecheck, tests, and production build.
5. Test authentication, approval, private PDF, notification, and reporting flows in staging/pilot.
6. Deploy with a known rollback target.
7. Record dependency changes in `CHANGELOG.md` or the release notes.

## Security advisories

Classify each advisory by:

- affected package and transitive path;
- whether the vulnerable API/path is actually exercised;
- attacker preconditions;
- internet exposure;
- available non-breaking upgrade;
- compensating controls;
- deadline/owner.

An unresolved advisory should be documented rather than hidden. Severity from a package scanner is an input, not a substitute for application-specific risk analysis.

## Annual continuity review

At least annually, or after a major architecture change, verify that:

- runtime versions are still supported;
- OAuth configuration remains valid;
- backup/restore procedures still match current Google Cloud capabilities;
- IAM roles still reflect least privilege;
- custom-domain/DNS ownership is recoverable;
- the new-developer onboarding instructions still work from a clean machine.
