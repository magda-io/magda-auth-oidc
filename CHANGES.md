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