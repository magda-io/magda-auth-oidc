import express, { Router } from "express";
import passport, { Authenticator } from "passport";
import { default as ApiClient } from "@magda/auth-api-client";
import {
    AuthPluginConfig,
    getAbsoluteUrl,
    redirectOnSuccess,
    redirectOnError,
    createOrGetUserToken
} from "@magda/authentication-plugin-sdk";
import OpenIdClient, {
    Issuer,
    custom,
    Strategy as OpenIdClientStrategy,
    TokenSet,
    UserinfoResponse
} from "openid-client";
import os from "os";
import urijs from "urijs";

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

async function createOpenIdClient(options: AuthPluginRouterOptions) {
    console.log("Creating OpenId Client...");

    const externalUrl = options.externalUrl;
    const loginBaseUrl = getAbsoluteUrl("/auth/login/plugin", externalUrl);
    const discoveryEndpoint = getAbsoluteUrl(
        "/.well-known/openid-configuration",
        options.issuer
    );
    const authPluginConfig = options.authPluginConfig;

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

    return client;
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

export default async function createAuthPluginRouter(
    options: AuthPluginRouterOptions
): Promise<Router> {
    const authorizationApi = options.authorizationApi;
    const passport = options.passport;
    const clientId = options.clientId;
    const clientSecret = options.clientSecret;
    const externalUrl = options.externalUrl;
    const authPluginConfig = options.authPluginConfig;
    const resultRedirectionUrl = getAbsoluteUrl(
        options.authPluginRedirectUrl,
        externalUrl
    );

    const issuer = options?.issuer;
    const scope = options.scope ? options.scope : DEFAULT_SCOPE;

    if (!clientId) {
        throw new Error("Required client id can't be empty!");
    }

    if (!clientSecret) {
        throw new Error("Required client secret can't be empty!");
    }

    if (!issuer) {
        throw new Error(
            "Required issuer url: (options.issuer) can't be empty!"
        );
    }

    console.log("scope settings: ", scope);

    const client = await createOpenIdClient(options);

    const oidcStrategy = new OpenIdClientStrategy(
        {
            params: {
                scope
            },
            client
        },
        (
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

            createOrGetUserToken(
                authorizationApi,
                userData,
                authPluginConfig.key
            )
                .then((userToken) => done(null, userToken))
                .catch((error) => done(error));
        }
    );

    passport.use(STRATEGY_NAME, oidcStrategy);

    const router: express.Router = express.Router();

    router.get("/", (req, res, next) => {
        const opts: any = {
            scope,
            state:
                typeof req?.query?.redirect === "string" && req.query.redirect
                    ? getAbsoluteUrl(req.query.redirect, externalUrl)
                    : resultRedirectionUrl
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
                normalizeRedirectionUrl(req.query.state as string),
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
                normalizeRedirectionUrl(req.query.state as string),
                req,
                res
            );
        }
    );

    return router;
}
