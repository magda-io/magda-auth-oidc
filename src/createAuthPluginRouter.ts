import express, { Router } from "express";
import passport, { Authenticator } from "passport";
import { default as ApiClient, User } from "@magda/auth-api-client";
import AuthApiClient from "@magda/auth-api-client";
import {
    AuthPluginConfig,
    getAbsoluteUrl,
    redirectOnSuccess,
    redirectOnError,
    createOrGetUserToken,
    destroyMagdaSession,
    CookieOptions
} from "@magda/authentication-plugin-sdk";
import OpenIdClient, {
    Issuer,
    custom,
    Strategy as OpenIdClientStrategy,
    TokenSet,
    UserinfoResponse,
    Client
} from "openid-client";
import os from "os";
import urijs from "urijs";
import { validate as uuidValidate } from "uuid";

const pkg = require("../package.json");

const OIDC_DEFAULT_TIMEOUT = 10000;
const OIDC_DEFAULT_MAX_CLOCK_SKEW = 120;
const STRATEGY_NAME = "oidc";
const DEFAULT_SCOPE = "openid profile email";

function normalizeRedirectionUrl(
    url: string,
    allowedExternalRedirectDomains?: string[]
) {
    if (!url) {
        return "/";
    }
    const allowedDomains = allowedExternalRedirectDomains?.length
        ? allowedExternalRedirectDomains
        : [];
    const redirectUri = urijs(url);
    const host = redirectUri.host();
    if (!host || allowedDomains.indexOf(host) === -1) {
        return redirectUri.resource();
    } else {
        return redirectUri.toString();
    }
}

/**
 * Determine redirect url based on req & authPluginRedirectUrl config.
 *
 * @param {express.Request} req
 * @param {string} authPluginRedirectUrl
 * @param {string} [externalUrl] optional; If provided, will attempt to convert the url into an absolute url.
 *  Otherwise, leave as it is.
 * @return {*}  {string}
 */
function determineRedirectUrl(
    req: express.Request,
    configOptions: AuthPluginRouterOptions,
    useState: boolean = false
): string {
    const externalUrl = configOptions.externalUrl;
    const authPluginRedirectUrl = configOptions.authPluginRedirectUrl;

    const resultRedirectionUrl = getAbsoluteUrl(
        authPluginRedirectUrl,
        externalUrl
    );

    let redirectUri = resultRedirectionUrl;

    if (
        !useState &&
        typeof req?.query?.redirect === "string" &&
        req.query.redirect
    ) {
        redirectUri = getAbsoluteUrl(req.query.redirect, externalUrl);
    }

    if (
        useState &&
        typeof req.query?.state === "string" &&
        req.query.state &&
        req.query.state.match(/[\/\.]+/i)
    ) {
        redirectUri = getAbsoluteUrl(req.query.state, externalUrl);
    }

    return normalizeRedirectionUrl(
        redirectUri,
        configOptions?.allowedExternalRedirectDomains
    );
}

export interface AuthPluginRouterOptions {
    authorizationApi: ApiClient;
    passport: Authenticator;
    issuer: string; // e.g. https://example.com/oidc
    clientId: string; // clientId that might be required by your IDP provider
    clientSecret: string; // clientSecret that might be required by your IDP provider
    externalUrl: string;
    authPluginRedirectUrl: string;
    authPluginConfig: AuthPluginConfig;
    allowedExternalRedirectDomains: string[];
    disableLogoutEndpoint: boolean;
    timeout?: number; // timeout of openid client. Default 10000 milseconds
    /**
     * Defaults to 120.
     * This is the maximum difference allowed between your server's clock and OIDC provider's in seconds.
     * Setting this to 0 is not recommended, because it increases the likelihood that valid jwts will fail verification due to nbf and exp issues.
     */
    maxClockSkew?: number;
    /**
     * Defaults to openid, which will only return the sub claim.
     * To obtain more information about the user, use openid profile.
     * For a list of scopes and claims, please refer to your provider document
     */
    scope?: string;
    sessionCookieOptions: CookieOptions;
    // target magda org unit id
    // when provided, the user will be assigned to this org unit
    userDefaultOrgUnitId?: string;
    // target magda role id
    // when provided, the user will be granted this role
    userDefaultRoleId?: string;
    autoMapOrg: boolean;
}

/**
 * Modified from @okta/oidc-middleware Apache 2.0 license
 * Change UserAgent header of OpenIdClient
 *
 * @param {OpenIdClient.HttpOptions} options
 * @return {*}
 */
function customizeUserAgent(options: OpenIdClient.HttpOptions) {
    /**
     * Parse out the default user agent for the openid-client library, which currently looks like:
     *
     * openid-client/1.15.0 (https://github.com/panva/node-openid-client)
     *
     * We strip off the github link because it's not necessary.
     */
    options = options || {};
    const headers = options.headers || {};
    let clientUserAgent = headers["User-Agent"];
    if (typeof clientUserAgent === "string") {
        clientUserAgent = " " + clientUserAgent.split(" ")[0];
    } else {
        clientUserAgent = "";
    }

    const userAgent = `${pkg.name}/${pkg.version}${clientUserAgent} node/${
        process.versions.node
    } ${os.platform()}/${os.release()}`;
    headers["User-Agent"] = userAgent;

    options.headers = headers;
    return options;
}

async function createOpenIdIssuerWithClient(
    options: AuthPluginRouterOptions
): Promise<[Issuer<OpenIdClient.Client>, Client]> {
    console.log("Creating OpenId Client...");

    const externalUrl = options.externalUrl;
    const loginBaseUrl = getAbsoluteUrl("/auth/login/plugin", externalUrl);
    const discoveryEndpoint = getAbsoluteUrl(
        "/.well-known/openid-configuration",
        options.issuer
    );
    const authPluginConfig = options.authPluginConfig;
    const issuerUri = urijs(options.issuer);

    custom.setHttpOptionsDefaults({
        ...customizeUserAgent({}),
        timeout: options?.timeout || OIDC_DEFAULT_TIMEOUT
    });

    Issuer[custom.http_options] = function (opts) {
        opts = customizeUserAgent(opts);
        opts.timeout = options?.timeout || OIDC_DEFAULT_TIMEOUT;
        return opts;
    };

    console.log(`Fetching OIDC configuration from ${discoveryEndpoint}...`);

    const iss = await Issuer.discover(discoveryEndpoint);

    console.log("OIDC configuration:", iss.metadata);

    // Somehow, auth0 will not include `end_session_endpoint` in OIDC discovery endpoint by default (unless you contact support)
    // the `end_session_endpoint` does exist at https://YOUR_DOMAIN/oidc/logout though
    if (
        issuerUri.host().toLowerCase().endsWith("auth0.com") &&
        !iss["end_session_endpoint"]
    ) {
        const auth0LogoutUrl = getAbsoluteUrl("/oidc/logout", options.issuer);
        Object.defineProperty(iss, "end_session_endpoint", {
            get() {
                return auth0LogoutUrl;
            },
            enumerable: true
        });
        console.log(
            `Patched auth0 issuer metadata with \`end_session_endpoint\` endpoint: ${auth0LogoutUrl}`
        );
    }

    const client = new iss.Client({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uris: [
            getAbsoluteUrl(`/${authPluginConfig.key}/return`, loginBaseUrl)
        ]
    });

    console.log("OIDC clientId: ", options.clientId);

    client[custom.http_options] = (options) => {
        options = customizeUserAgent(options);
        options.timeout = options.timeout || OIDC_DEFAULT_TIMEOUT;
        return options;
    };
    client[custom.clock_tolerance] =
        typeof options?.maxClockSkew === "undefined"
            ? OIDC_DEFAULT_MAX_CLOCK_SKEW
            : options.maxClockSkew;

    console.log("Timeout Setting: ", options.timeout || OIDC_DEFAULT_TIMEOUT);
    console.log("clock_tolerance Setting: ", client[custom.clock_tolerance]);
    console.log("OpenId Client Created!");

    return [iss, client];
}

function createNameFromProfile(profile: UserinfoResponse) {
    if (profile?.name) {
        return profile.name;
    }
    const names: string[] = [
        profile?.given_name,
        profile?.middle_name,
        profile?.family_name
    ].filter((item) => !!item);

    if (names.length) {
        return names.join(" ");
    }

    return profile.email;
}

const isValidRoleId = (id?: string) =>
    typeof id === "string" &&
    (uuidValidate(id) || id.match(/^\d{8}-\d{4}-\d{4}-\d{4}-\d{12}$/));

export default async function createAuthPluginRouter(
    options: AuthPluginRouterOptions
): Promise<Router> {
    const authorizationApi = options.authorizationApi;
    const passport = options.passport;
    const clientId = options.clientId;
    const clientSecret = options.clientSecret;
    const externalUrl = options.externalUrl;
    const authPluginConfig = options.authPluginConfig;
    const sessionCookieOptions = options.sessionCookieOptions;
    const autoMapOrg = options.autoMapOrg;

    const issuerUrl = options?.issuer;
    const scope = options.scope ? options.scope : DEFAULT_SCOPE;

    if (!clientId) {
        throw new Error("Required client id can't be empty!");
    }

    if (!clientSecret) {
        throw new Error("Required client secret can't be empty!");
    }

    if (!issuerUrl) {
        throw new Error(
            "Required issuer url: (options.issuer) can't be empty!"
        );
    }

    console.log("scope settings: ", scope);
    console.log(`Default user role ID: ${options?.userDefaultRoleId}`);
    console.log(`Default user orgUnit ID: ${options?.userDefaultOrgUnitId}`);
    console.log(`Auto Map User Org: ${autoMapOrg}`);

    const [issuer, client] = await createOpenIdIssuerWithClient(options);
    const disableLogoutEndpoint = !issuer["end_session_endpoint"]
        ? true
        : options?.disableLogoutEndpoint === true;

    console.log("RP-Initiated Logout feature is: " + !disableLogoutEndpoint);

    const oidcStrategy = new OpenIdClientStrategy(
        {
            params: {
                scope
            },
            client
        },
        async (
            tokenSet: TokenSet,
            profile: UserinfoResponse,
            done: (err: any, user?: any) => void
        ) => {
            if (!profile?.email) {
                return done(
                    new Error(
                        "Cannot locate email address from the user profile."
                    )
                );
            }

            const hasUserDefaultOrgUnitId = uuidValidate(
                options?.userDefaultOrgUnitId
            );
            const org_name = profile?.["org_name"] as string;
            const org_id = profile?.["org_id"] as string;
            if (autoMapOrg && !hasUserDefaultOrgUnitId && !org_name) {
                // we rely on the `org_name` claim to map the user to an organization
                // unless `userDefaultOrgUnitId` option is provided (which indicate the user without `org_name` claim should be mapped to `userDefaultOrgUnitId`)
                // otherwise, we should always throw an error if `org_name` claim is not present.
                const error = !org_id
                    ? // if `org_id` claim is not present, the user is not a member of an organization.
                      // the admin should add the user to an organization in identity store before the user can sign in.
                      new Error(
                          "Only members of an organization is allowed to sign in."
                      )
                    : // otherwise, the `org_name` claim is missing for technical reason.
                      // e.g. auth0 requires the admin to turn on the "Allow Organisation Names in Authentication API" option.
                      new Error(
                          "Cannot locate `org_name` claim from the user ID token."
                      );
                return done(error);
            }

            const userData: passport.Profile = {
                id: profile?.sub,
                provider: authPluginConfig.key,
                displayName: createNameFromProfile(profile),
                name: {
                    familyName: profile?.family_name,
                    givenName: profile?.given_name
                },
                emails: [{ value: profile.email }]
            };

            const beforeUserCreated =
                hasUserDefaultOrgUnitId || autoMapOrg
                    ? async (
                          authApi: AuthApiClient,
                          userData: User,
                          profile: passport.Profile
                      ) => {
                          if (!autoMapOrg) {
                              return {
                                  ...userData,
                                  orgUnitId: options.userDefaultOrgUnitId
                              };
                          } else {
                              if (!org_name) {
                                  return {
                                      ...userData,
                                      orgUnitId: options.userDefaultOrgUnitId
                                  };
                              } else {
                                  const orgUnits =
                                      await authApi.getOrgUnitsByName(org_name);
                                  if (!orgUnits?.length) {
                                      const rootOrgUnit =
                                          await authApi.getRootOrgUnit();
                                      const newNode =
                                          await authApi.createOrgNode(
                                              rootOrgUnit.id,
                                              {
                                                  name: org_name,
                                                  description: `auto-created org unit ${
                                                      org_id
                                                          ? `(org_id: ${org_id})`
                                                          : ""
                                                  }`
                                              }
                                          );
                                      return {
                                          ...userData,
                                          orgUnitId: newNode.id
                                      };
                                  } else {
                                      return {
                                          ...userData,
                                          orgUnitId: orgUnits[0].id
                                      };
                                  }
                              }
                          }
                      }
                    : undefined;

            const afterUserCreated = isValidRoleId(options?.userDefaultRoleId)
                ? async (
                      authApi: AuthApiClient,
                      user: User,
                      profile: passport.Profile
                  ) => {
                      await authApi.addUserRoles(user.id, [
                          options.userDefaultRoleId
                      ]);
                  }
                : undefined;

            try {
                const userToken = await createOrGetUserToken(
                    authorizationApi,
                    userData,
                    authPluginConfig.key,
                    beforeUserCreated,
                    afterUserCreated
                );

                const authPluginData: any = {
                    key: authPluginConfig.key,
                    tokenSet
                };

                if (!disableLogoutEndpoint) {
                    // when logout endpoint is available, set `logoutUrl` so the gateway will forward logout request to authPlugin
                    authPluginData.logoutUrl = `/auth/login/plugin/${authPluginConfig.key}/logout`;
                }

                done(null, {
                    ...userToken,
                    authPlugin: authPluginData
                });
            } catch (error) {
                done(error);
            }
        }
    );

    passport.use(STRATEGY_NAME, oidcStrategy);

    const router: express.Router = express.Router();

    router.get("/", (req, res, next) => {
        const opts: any = {
            scope,
            state: determineRedirectUrl(req, options)
        };
        passport.authenticate(STRATEGY_NAME, opts)(req, res, next);
    });

    router.get(
        "/return",
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            passport.authenticate(STRATEGY_NAME, {
                failWithError: true
            })(req, res, next);
        },
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            redirectOnSuccess(
                determineRedirectUrl(req, options, true),
                req,
                res
            );
        },
        (
            err: any,
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ): any => {
            redirectOnError(
                err,
                determineRedirectUrl(req, options, true),
                req,
                res
            );
        }
    );

    if (disableLogoutEndpoint) {
        return router;
    }

    router.get(
        "/logout",
        async (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            const idToken = (req?.user as any)?.authPlugin?.tokenSet?.id_token;
            // no matter what, attempt to destroy magda session first
            // this function is safe to call even when session doesn't exist
            await destroyMagdaSession(req, res, sessionCookieOptions);
            if (!idToken) {
                // can't find tokenSet from session
                // likely already signed off
                // redirect user agent back
                res.redirect(determineRedirectUrl(req, options));
            } else {
                // notify idP
                const redirectUrl = determineRedirectUrl(req, options);

                res.redirect(
                    client.endSessionUrl({
                        id_token_hint: idToken,
                        state: redirectUrl,
                        post_logout_redirect_uri: getAbsoluteUrl(
                            `/auth/login/plugin/${authPluginConfig.key}/logout/return`,
                            externalUrl
                        )
                    })
                );
            }
        }
    );

    router.get(
        "/logout/return",
        async (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            if (req?.user) {
                await destroyMagdaSession(req, res, sessionCookieOptions);
            }
            res.redirect(determineRedirectUrl(req, options, true));
        }
    );

    return router;
}
