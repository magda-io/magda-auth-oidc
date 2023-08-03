# magda-auth-oidc

![Version: 2.0.0](https://img.shields.io/badge/Version-2.0.0-informational?style=flat-square)

A Generic Magda Authentication Plugin for OpenID Connect.

Requires MAGDA version v2.0.0 or above.

### How to Use

1. Add the auth plugin as a [Helm Chart Dependency](https://helm.sh/docs/helm/helm_dependency/)
```yaml
- name: magda-auth-oidc
  alias: magda-auth-my-idp
  version: "2.0.0" # or put the latest version number here
  repository: "oci://ghcr.io/magda-io/charts"
```

> Please note: `alias` field is optional. Its purpose is to give the helm chart an alias name (rather than the default `magda-auth-oidc`) so it's possible to use `magda-auth-oidc` plugins multiple times (for different idps) in your deployment.
> When `alias` is not specified, you should reference its name as `magda-auth-oidc`.

> Since v2.0.0, we use [Github Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) as our official Helm Chart & Docker Image release registry.

2. Config the auth plugin with OIDC client Id & issuer
```yaml
magda-auth-my-idp:
  issuer: "https://example.com/my-idp-issuer-url"
  clientId: "xxxxxxxx"
  # Optional; only when you've specified alias name and want to support multiple oidc idps at the same time
  authPluginConfig:
    key: "my-idp"
    name: "Login to My IDP"
```
> When `alias` is not specified when define [Helm Chart Dependency](https://helm.sh/docs/helm/helm_dependency/), you should reference its name as `magda-auth-oidc` in your config.

3. Config Gatway to add the auth plugin to Gateway's plugin list (More details see [here](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/gateway/README.md))
```yaml
gateway:
  authPlugins:
  # key should match the `authPluginConfig.key` you set above.
  # If you didn't specify, it should be `oidc` by default
  - key: "my-idp"
    # baseUrl should be http://[alias name of the auth plugin].
    # If you didn't specify, it's `http://magda-auth-oidc` by default.
    baseUrl: http://magda-auth-my-idp
```

4. Create a secret in your deployment Magda namespace with the correct value for `client-secret` key

The secret's name should match pattern `[alias name of the auth plugin]-secret`. If you didn't specify alias name for the auth plugin, the secret name should be `oidc-secret` by default.

5. Setup at OIDC identity provider

- Supply url `https://[your magda domain]/auth/login/plugin/[alias name of the auth plugin]/return` as login redirect url.
- Supply url `https://[your magda domain]/auth/login/plugin/[alias name of the auth plugin]/logout/return` as logout redirect url (Optional; Only for IDP supports [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)).

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| oci://ghcr.io/magda-io/charts | magda-common | 2.2.5 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| authPluginConfig.authenticationMethod | string | `"IDP-URI-REDIRECTION"` | The authentication method of the plugin. Support values are: <ul> <li>`IDP-URI-REDIRECTION`: the plugin will rediredct user agent to idp (identity provider) for authentication. e.g. Google & fackebook oauth etc.</li> <li>`PASSWORD`: the plugin expect frontend do a form post that contains username & password to the plugin for authentication.</li> <li>`QR-CODE`: the plugin offers a url that is used by the frontend to request auth challenge data. The data will be encoded into a QR-code image and expect the user scan the QR code with a mobile app to complete the authentication request.</li> </ul> See [Authentication Plugin Specification](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md) for more details |
| authPluginConfig.iconUrl | string | `"/icon.svg"` | the display icon URL of the auth plugin. |
| authPluginConfig.key | string | `"oidc"` | the unique key of the auth plugin. Allowed characters: [a-zA-Z0-9\-]. Max. 20 chars. |
| authPluginConfig.loginFormExtraInfoContent | string | `""` | Optional; Only applicable when authenticationMethod = "PASSWORD". If present, will displayed the content underneath the login form to provide extra info to users. e.g. how to reset password Can support content in markdown format. |
| authPluginConfig.loginFormExtraInfoHeading | string | `""` | Optional; Only applicable when authenticationMethod = "PASSWORD". If present, will displayed the heading underneath the login form to provide extra info to users. e.g. how to reset password |
| authPluginConfig.loginFormPasswordFieldLabel | string | "Password" | Optional; Only applicable when authenticationMethod = "PASSWORD". |
| authPluginConfig.loginFormUsernameFieldLabel | string | "Username" | Optional; Only applicable when authenticationMethod = "PASSWORD". |
| authPluginConfig.name | string | `"OpenID Connect"` | the display name of the auth plugin. |
| authPluginConfig.qrCodeAuthResultPollUrl | string | `""` | Only applicable & compulsory when authenticationMethod = "QR-CODE". The url that is used by frontend to poll the authentication processing result. See [Authentication Plugin Specification](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md) for more details |
| authPluginConfig.qrCodeExtraInfoContent | string | `""` | Only applicable & compulsory when authenticationMethod = "QR-CODE". If present, will displayed the content underneath the login form to provide extra info to users. e.g. how to download moile app to scan the QR Code. Can support content in markdown format. |
| authPluginConfig.qrCodeExtraInfoHeading | string | `""` | Only applicable & compulsory when authenticationMethod = "QR-CODE". If present, will displayed the heading underneath the QR Code image to provide extra instruction to users. e.g. how to download moile app to scan the QR Code |
| authPluginConfig.qrCodeImgDataRequestUrl | string | `""` | Only applicable & compulsory when authenticationMethod = "QR-CODE". The url that is used by frontend client to request auth challenge data from the authentication plugin. See [Authentication Plugin Specification](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md) for more details |
| authPluginRedirectUrl | string | `nil` | the redirection url after the whole authentication process is completed. Authentication Plugins will use this value as default. The following query paramaters can be used to supply the authentication result: <ul> <li>result: (string) Compulsory. Possible value: "success" or "failure". </li> <li>errorMessage: (string) Optional. Text message to provide more information on the error to the user. </li> </ul> This field is for overriding the value set by `global.authPluginRedirectUrl`. Unless you want to have a different value only for this auth plugin, you shouldn't set this value. |
| autoscaler.enabled | bool | `false` | turn on the autoscaler or not |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| clientId | string | `nil` | OIDC clientId |
| defaultAdminUserId | string | `"00000000-0000-4000-8000-000000000000"` | which system account we used to talk to auth api The value of this field will only be used when `global.defaultAdminUserId` has no value |
| defaultImage.imagePullSecret | bool | `false` |  |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| disableLogoutEndpoint | bool | `false` | Whether to disable the logout endpoint. Optional. Default: false. If set to true, the logout endpoint will be disabled. When set to false, the logout endpoint will be only enabled when the OIDC provider supports the `end_session_endpoint` endpoint. |
| global | object | `{"authPluginAllowedExternalRedirectDomains":[],"authPluginRedirectUrl":"/sign-in-redirect","externalUrl":"","image":{},"rollingUpdate":{}}` | only for providing appropriate default value for helm lint |
| global.authPluginAllowedExternalRedirectDomains | list | `[]` | By default, at end of authentication process, an auth plugin will never redirect the user to an external domain,  even if `authPluginRedirectUrl` is configured to an URL with an external domain. Unless an external domain is added to the whitelist i.e. this `authPluginAllowedExternalRedirectDomains` config,  any auth plugins will always ignore the domain part of the url (if supplied) and only redirect the user to the URL path under the current domain. Please note: you add a url host string to this list. e.g. "abc.com:8080" |
| image.name | string | `"magda-auth-oidc"` |  |
| issuer | string | `nil` | OIDC issuer url. e.g. https://example.com or https://example.com/oidc A valid issuer url must has `/.well-known/openid-configuration` endpoint. i.e. URL `<issuer>/.well-known/openid-configuration` must be accessible |
| maxClockSkew | string | `nil` | OIDC openid client clock skew tolerance (in seconds). Default to 120 if not provided |
| replicas | int | `1` | no. of initial replicas |
| resources.limits.cpu | string | `"50m"` |  |
| resources.requests.cpu | string | `"10m"` |  |
| resources.requests.memory | string | `"30Mi"` |  |
| scope | string | `nil` | OpenID Connect Scopes. Default to `openid profile email` if not provided. |
| timeout | string | `nil` | OIDC openid client HTTP request timeout (in milseconds).  Default to 10000 if not provided. |
| userDefaultOrgUnitId | string | `nil` | When a user login to the system for the first time, the user will be assigned to this org unit. If not provided, the user will be not be assigned to any org unit. Default: Nil |
