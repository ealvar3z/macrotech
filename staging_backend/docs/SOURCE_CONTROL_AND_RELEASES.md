# Source Control, Releases & Reproducibility

## Source of truth for code

Production code must live in an owner-controlled private source repository. A ZIP on one PC is not an acceptable long-term source-of-truth strategy.

Until a repository is established, preserve immutable release ZIPs in at least two independent secure locations and generate a release manifest for each one.

## Branch/release convention

Recommended minimum model:

- `main` — last approved/releasable line;
- short-lived feature/fix branches;
- semantic version tags such as `v1.0.0`, `v1.0.1`;
- no direct emergency edits to production files outside source control.

## Every production release records

- application version;
- commit SHA/tag when Git is available;
- release/build ID;
- UTC release time;
- operator;
- target project/region;
- Cloud Run revision;
- Firebase Hosting release/version reference;
- package-lock SHA-256;
- key configuration-file hashes;
- successful verification result;
- previous known-good release/build ID.

Use `scripts/release-manifest.ps1` to generate the local source/tool portion of this evidence before deployment.

## Rollback prerequisite

Do not deploy if the previous known-good release cannot be identified. A successful deployment is not complete until its own rollback target is recorded for the next release.

## Schema compatibility

Application rollback is only safe when the deployed code remains compatible with current Firestore records. Breaking schema migrations require a separate migration/rollback plan and staging test.

## Backup rule

Source control protects code history; it does not back up Firestore or quotation PDFs. Cloud data protection must be managed separately.
