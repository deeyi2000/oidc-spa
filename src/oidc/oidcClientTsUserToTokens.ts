import type { User as OidcClientTsUser } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { assert } from "../vendor/frontend/tsafe";
import { readExpirationTimeInJwt } from "../tools/readExpirationTimeInJwt";
import { decodeJwt } from "../tools/decodeJwt";
import type { Oidc } from "./Oidc";

export function oidcClientTsUserToTokens<DecodedIdToken extends Record<string, unknown>>(params: {
    oidcClientTsUser: OidcClientTsUser;
    decodedIdTokenSchema?: { parse: (data: unknown) => DecodedIdToken };
    log: ((message: string) => void) | undefined;
}): Oidc.Tokens<DecodedIdToken> {
    const { oidcClientTsUser, decodedIdTokenSchema, log } = params;

    const accessToken = oidcClientTsUser.access_token;

    const accessTokenExpirationTime = (() => {
        read_from_metadata: {
            const { expires_at } = oidcClientTsUser;

            if (expires_at === undefined) {
                break read_from_metadata;
            }

            return expires_at * 1000;
        }

        read_from_jwt: {
            const expirationTime = readExpirationTimeInJwt(accessToken);

            if (expirationTime === undefined) {
                break read_from_jwt;
            }

            return expirationTime;
        }

        assert(false, "Failed to get access token expiration time");
    })();

    const refreshToken = oidcClientTsUser.refresh_token;

    const refreshTokenExpirationTime = (() => {
        if (refreshToken === undefined) {
            return Number.POSITIVE_INFINITY;
        }

        read_from_jwt: {
            const expirationTime = readExpirationTimeInJwt(refreshToken);

            if (expirationTime === undefined) {
                break read_from_jwt;
            }

            return expirationTime;
        }

        log?.(
            [
                "Couldn't read the expiration time of the refresh token from the jwt",
                "It's ok. Some OIDC server like Microsoft Entra ID does not use JWT for the refresh token.",
                "Be aware that it prevent you from implementing the auto logout mechanism: https://docs.oidc-spa.dev/v/v6/auto-logout",
                "If you need auto logout you'll have to provide use the __unsafe_ssoSessionIdleSeconds param."
            ].join("\n")
        );

        return Number.POSITIVE_INFINITY;
    })();

    const idToken = oidcClientTsUser.id_token;

    assert(idToken !== undefined, "No id token provided by the oidc server");

    const tokens: Oidc.Tokens<DecodedIdToken> = {
        accessToken,
        accessTokenExpirationTime,
        refreshToken: refreshToken ?? "",
        refreshTokenExpirationTime,
        idToken,
        decodedIdToken: (() => {
            let decodedIdToken = decodeJwt(idToken) as DecodedIdToken;

            if (decodedIdTokenSchema !== undefined) {
                decodedIdToken = decodedIdTokenSchema.parse(decodedIdToken);
            }

            return decodedIdToken;
        })()
    };

    return tokens;
}
