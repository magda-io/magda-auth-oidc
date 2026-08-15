# 3.0.0

- Enforce TLS on the `session-db` connection when deployed against an enforced-SSL database (magda-io/magda#3742):
  - Upgrade `@magda/authentication-plugin-sdk` + the `magda-common` Helm chart dependency to v7 (`7.0.0-alpha.1`), and include the `magda.db-client-sslmode-env-v1` helper contract so the pod receives `PGSSLMODE` for its `session-db` connection. The v7 SDK derives the `node-postgres` `ssl` option from `PGSSLMODE`/`PGSSLROOTCERT` explicitly (fixes `SELF_SIGNED_CERT_IN_CHAIN` against Magda's self-signed server cert).
  - Support `sslmode: verify-ca`/`verify-full` (server-certificate verification): adopt the `magda.db-client-ca-env-v1` helper contract, mounting the PostgreSQL server CA and setting `PGSSLROOTCERT`. Under `disable`/`require` these render nothing (self-guarded).
  - Add `global.magdaCompatibilityCheck` (default `true`). Standalone `helm template`/`helm lint` (no `magda-core` present) must set it to `false`; the `helm-lint` script now does so.
- Modernize the toolchain: build as an **ES module** (matching the other Magda auth plugins), upgrade to **Node.js 22**, TypeScript 5, `tsx`/mocha 10, and `openid-client` v4. Upgrade `@magda/docker-utils` and `@magda/ci-utils`.
- **Requires Magda v7+** (breaking change; on the v7 pre-release line, `>= 7.0.0-alpha.1`, which first ships the `db-client-ca-env-v1` contract this chart now calls). Deploy as a chart dependency in the same Helm release as Magda; deploying against an unsupported Magda fails the `magda.compatibility-check` handshake at render time. Users on Magda v6 or lower should stay on the `2.x` line.

# v2.0.4

- #14 add `forceEnableLogoutEndpoint` config option for the use case where auth0 users use custom domains

# v2.0.3

- Add `autoMapOrg` feature to map user to Magda orgUnit based on `org_name` claim.

# v2.0.2

- #8: allow specify the default Magda role id that the user should be granted when logged in for the first time

# v2.0.1

- add OpenID Connect RP-Initiated Logout 1.0 support
- allow specify the default Magda orgUnit id that the user should be assigned to when logged in for the first time

# v2.0.0

- Upgrade nodejs to version 14
- Upgrade other dependencies
- Release all artifacts to GitHub Container Registry (instead of docker.io & https://charts.magda.io)
- Upgrade magda-common chart version to v2.2.5
- Build multi-arch docker images
- add support to allowedExternalRedirectDomains config options
- not set deployment replicas when autoscaler is on

# v1.2.2

- Fixed #1, timeout setting didn't apply to all HTTP connections

# v1.2.1

- Upgrade to magda-common lib chart v1.0.0-alpha.4
- Use named templates from magda-common lib chart for docker image related logic

# v1.2.0

- Change the way of locate session-db secret to be compatible with Magda v1 (still backwards compatible with earlier versions)
- Avoid using .Chart.Name for image name --- it will change when use chart dependency alias
- Adjustments to allow auth plugin to be used multiple times in a Magda deployment for different idPs (via Helm Chart Alias).