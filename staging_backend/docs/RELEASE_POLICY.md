# Release Policy

## Current pilot and future environments

The existing `macrotech-approval-production` project is being used as a tightly controlled first pilot. Do not expose it broadly while integration testing is incomplete.

Before routine company-wide releases, create a separate staging Firebase/Google Cloud project. New code should pass staging before production. Google also recommends separate deployment projects for testing and production when preparing OAuth applications for production use.

## Permanent front door

Normal releases must not change the employee-facing Firebase Hosting domain. Hosting remains the stable front door and rewrites `/api/**` to the Cloud Run API in `asia-east1`.

## Release gates

A release requires clean dependency installation on the supported Node/npm versions, zero TypeScript errors, all automated tests passing, a successful production build, staging/pilot smoke tests, expected `/api/health` build ID, and a known rollback target.

The pilot API runs with minimum instances `0` and a conservative maximum instance count. Do not change scale or permissions merely to hide a deployment/configuration problem.

## Rollback

Firebase Hosting uses `pinTag: true` for the Cloud Run rewrite so the Hosting release can remain associated with its backend revision. If smoke testing fails, roll back to the last known-good Hosting/backend release and verify the prior build ID.

Application rollback must not mutate final approval records. Firestore schema changes must be backward compatible unless a separately tested data migration has completed.

## Dependency changes

Do not use `npm audit fix --force` as a release procedure. A security advisory must be evaluated for the actual dependency path and application exposure. Breaking downgrades are prohibited unless deliberately engineered and regression-tested.

Container base versions are pinned per release. Dependency/base-image updates should be reviewed as a new release rather than silently changing an existing build.

## Data safety

No deployment, setup, rollback, or diagnostic script may clear/recreate production Firestore collections, delete quotation objects, overwrite an unexpected reporting-sheet header, or make the quotation bucket public.
