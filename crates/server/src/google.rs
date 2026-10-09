//! "Entrar com Google" (ADR 0029): the site gets an ID token from Google Identity Services and
//! sends it here; the server checks Google's RS256 signature, the audience (our client id), the
//! issuer and the expiry, and trusts only a verified e-mail.
//!
//! Google's public keys (JWKS) are fetched over HTTPS and cached as long as Google's
//! `Cache-Control` allows. An unknown key id triggers one refresh (Google rotates keys), at most
//! once a minute so forged tokens cannot make us hammer Google.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use base64::Engine as _;
use ring::signature::{RSA_PKCS1_2048_8192_SHA256, RsaPublicKeyComponents};
use serde::Deserialize;
use thiserror::Error;
use tokio::sync::RwLock;

const CERTS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS: [&str; 2] = ["accounts.google.com", "https://accounts.google.com"];
/// Clock difference tolerated between Google and us.
const LEEWAY_SECS: i64 = 60;
const DEFAULT_KEYS_TTL: Duration = Duration::from_hours(1);
const MIN_REFRESH_INTERVAL: Duration = Duration::from_mins(1);
/// Longest token accepted (Google's are about 1.2 KB).
const MAX_TOKEN_LEN: usize = 4096;

/// Why a Google ID token is refused.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GoogleError {
    /// Not a well-formed RS256 JWT.
    #[error("malformed token")]
    Malformed,
    /// Signed with a key Google does not publish.
    #[error("unknown signing key")]
    UnknownKey,
    /// The signature does not verify.
    #[error("invalid signature")]
    BadSignature,
    /// Expired, or issued in the future.
    #[error("token expired")]
    Expired,
    /// Issued for another application, or by someone other than Google.
    #[error("token not issued for this application")]
    WrongAudience,
    /// The Google account has no verified e-mail.
    #[error("e-mail not verified by Google")]
    EmailNotVerified,
    /// Google's keys could not be fetched.
    #[error("could not fetch Google keys: {0}")]
    Keys(String),
}

/// Who signed in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleIdentity {
    /// Google's stable account id (`sub`).
    pub subject: String,
    /// Verified e-mail, lowercase.
    pub email: String,
    /// Display name, if shared.
    pub name: Option<String>,
}

/// An RSA public key of Google, as published in the JWKS.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicKey {
    /// Modulus, big-endian.
    pub n: Vec<u8>,
    /// Public exponent, big-endian.
    pub e: Vec<u8>,
}

#[derive(Debug)]
struct KeySet {
    keys: HashMap<String, PublicKey>,
    expires_at: Instant,
    fetched_at: Instant,
}

/// Verifier of Google ID tokens for one OAuth client id.
#[derive(Debug)]
pub struct GoogleAuth {
    client_id: String,
    source: KeySource,
    cache: RwLock<Option<KeySet>>,
}

#[derive(Debug)]
enum KeySource {
    Http(reqwest::Client),
    /// Tests: fixed keys, never fetched.
    Static(HashMap<String, PublicKey>),
}

#[derive(Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

#[derive(Deserialize)]
struct Jwk {
    kid: String,
    #[serde(default)]
    kty: String,
    n: String,
    e: String,
}

#[derive(Deserialize)]
struct Header {
    alg: String,
    kid: String,
}

#[derive(Deserialize)]
struct Claims {
    iss: String,
    aud: String,
    sub: String,
    exp: i64,
    #[serde(default)]
    iat: i64,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    email_verified: Option<serde_json::Value>,
    #[serde(default)]
    name: Option<String>,
}

fn b64(part: &str) -> Result<Vec<u8>, GoogleError> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(part)
        .map_err(|_| GoogleError::Malformed)
}

impl GoogleAuth {
    /// A verifier that fetches Google's keys. A rustls crypto provider must be installed first.
    ///
    /// # Errors
    ///
    /// [`GoogleError::Keys`] if the HTTP client cannot be built.
    pub fn new(client_id: String) -> Result<Self, GoogleError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent(concat!(
                env!("CARGO_PKG_NAME"),
                "/",
                env!("CARGO_PKG_VERSION")
            ))
            .build()
            .map_err(|error| GoogleError::Keys(error.to_string()))?;
        Ok(Self {
            client_id,
            source: KeySource::Http(client),
            cache: RwLock::new(None),
        })
    }

    /// A verifier with fixed keys (tests).
    pub fn with_keys(client_id: String, keys: HashMap<String, PublicKey>) -> Self {
        Self {
            client_id,
            source: KeySource::Static(keys),
            cache: RwLock::new(None),
        }
    }

    /// The OAuth client id the site uses to show the button.
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// Verifies an ID token at `now` (Unix seconds).
    ///
    /// # Errors
    ///
    /// See [`GoogleError`].
    pub async fn verify(&self, token: &str, now: i64) -> Result<GoogleIdentity, GoogleError> {
        let kid = token_kid(token)?;
        let key = match self.key(&kid, false).await? {
            Some(key) => key,
            None => self.key(&kid, true).await?.ok_or(GoogleError::UnknownKey)?,
        };
        verify_token(token, &key, &self.client_id, now)
    }

    /// The key `kid`, from the cache or (when stale, missing or `refresh`) from Google.
    async fn key(&self, kid: &str, refresh: bool) -> Result<Option<PublicKey>, GoogleError> {
        let keys = match &self.source {
            KeySource::Static(keys) => return Ok(keys.get(kid).cloned()),
            KeySource::Http(client) => client,
        };
        {
            let cache = self.cache.read().await;
            if let Some(set) = cache.as_ref() {
                let fresh = Instant::now() < set.expires_at;
                let recently = set.fetched_at.elapsed() < MIN_REFRESH_INTERVAL;
                if (fresh && !refresh) || recently {
                    return Ok(set.keys.get(kid).cloned());
                }
            }
        }
        let mut cache = self.cache.write().await;
        // Another request may have refreshed while this one waited for the lock.
        if let Some(set) = cache.as_ref()
            && set.fetched_at.elapsed() < MIN_REFRESH_INTERVAL
        {
            return Ok(set.keys.get(kid).cloned());
        }
        let set = fetch_keys(keys).await?;
        let found = set.keys.get(kid).cloned();
        *cache = Some(set);
        Ok(found)
    }
}

async fn fetch_keys(client: &reqwest::Client) -> Result<KeySet, GoogleError> {
    let response = client
        .get(CERTS_URL)
        .send()
        .await
        .map_err(|error| GoogleError::Keys(error.to_string()))?;
    if !response.status().is_success() {
        return Err(GoogleError::Keys(format!("status {}", response.status())));
    }
    let ttl = response
        .headers()
        .get(reqwest::header::CACHE_CONTROL)
        .and_then(|value| value.to_str().ok())
        .and_then(max_age)
        .unwrap_or(DEFAULT_KEYS_TTL);
    let jwks: Jwks = response
        .json()
        .await
        .map_err(|error| GoogleError::Keys(error.to_string()))?;
    Ok(KeySet {
        keys: parse_jwks(jwks)?,
        expires_at: Instant::now() + ttl,
        fetched_at: Instant::now(),
    })
}

fn parse_jwks(jwks: Jwks) -> Result<HashMap<String, PublicKey>, GoogleError> {
    jwks.keys
        .into_iter()
        .filter(|key| key.kty.is_empty() || key.kty == "RSA")
        .map(|key| {
            Ok((
                key.kid,
                PublicKey {
                    n: b64(&key.n)?,
                    e: b64(&key.e)?,
                },
            ))
        })
        .collect()
}

/// `max-age` of a `Cache-Control` value.
fn max_age(value: &str) -> Option<Duration> {
    value
        .split(',')
        .filter_map(|directive| directive.trim().strip_prefix("max-age="))
        .find_map(|seconds| seconds.trim().parse::<u64>().ok())
        .map(Duration::from_secs)
}

/// The key id in a token's header (alg must be RS256).
fn token_kid(token: &str) -> Result<String, GoogleError> {
    if token.len() > MAX_TOKEN_LEN {
        return Err(GoogleError::Malformed);
    }
    let header = token.split('.').next().ok_or(GoogleError::Malformed)?;
    let header: Header =
        serde_json::from_slice(&b64(header)?).map_err(|_| GoogleError::Malformed)?;
    if header.alg != "RS256" {
        return Err(GoogleError::Malformed);
    }
    Ok(header.kid)
}

/// Checks signature and claims of a token signed by `key`.
fn verify_token(
    token: &str,
    key: &PublicKey,
    client_id: &str,
    now: i64,
) -> Result<GoogleIdentity, GoogleError> {
    let mut parts = token.split('.');
    let (Some(header), Some(payload), Some(signature), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(GoogleError::Malformed);
    };
    let signed = &token[..header.len() + 1 + payload.len()];
    RsaPublicKeyComponents {
        n: &key.n,
        e: &key.e,
    }
    .verify(
        &RSA_PKCS1_2048_8192_SHA256,
        signed.as_bytes(),
        &b64(signature)?,
    )
    .map_err(|_| GoogleError::BadSignature)?;

    let claims: Claims =
        serde_json::from_slice(&b64(payload)?).map_err(|_| GoogleError::Malformed)?;
    if !ISSUERS.contains(&claims.iss.as_str()) || claims.aud != client_id {
        return Err(GoogleError::WrongAudience);
    }
    if claims.exp + LEEWAY_SECS < now || claims.iat - LEEWAY_SECS > now {
        return Err(GoogleError::Expired);
    }
    // Google sends a boolean; older tokens used the string "true".
    let verified = matches!(claims.email_verified, Some(serde_json::Value::Bool(true)))
        || matches!(&claims.email_verified, Some(serde_json::Value::String(text)) if text == "true");
    let email = claims
        .email
        .map(|email| email.trim().to_lowercase())
        .filter(|email| !email.is_empty() && verified)
        .ok_or(GoogleError::EmailNotVerified)?;
    if claims.sub.is_empty() || claims.sub.len() > 255 {
        return Err(GoogleError::Malformed);
    }
    Ok(GoogleIdentity {
        subject: claims.sub,
        email,
        name: claims
            .name
            .map(|name| name.trim().chars().take(100).collect::<String>())
            .filter(|name| !name.is_empty()),
    })
}

/// Test helpers: an RSA key pair that signs ID tokens like Google does.
#[cfg(any(test, feature = "test-util"))]
pub mod testing {
    use std::collections::HashMap;

    use base64::Engine as _;
    use ring::rand::SystemRandom;
    use ring::rsa::PublicKeyComponents;
    use ring::signature::{RSA_PKCS1_SHA256, RsaKeyPair};

    use super::PublicKey;

    /// A 2048-bit RSA key generated for these tests only (PKCS#8, base64).
    const TEST_KEY_PKCS8: &str = include_str!("../tests/fixtures/google-test-key.pk8.b64");
    /// Key id of [`TEST_KEY_PKCS8`] in the fake JWKS.
    pub const TEST_KID: &str = "test-key-1";

    /// Signs tokens for tests.
    #[derive(Debug)]
    pub struct TestSigner {
        key: RsaKeyPair,
    }

    impl TestSigner {
        /// The test key.
        ///
        /// # Panics
        ///
        /// If the embedded key is invalid (it is not).
        #[expect(clippy::expect_used, reason = "test helper with a fixed, valid key")]
        pub fn new() -> Self {
            let der = base64::engine::general_purpose::STANDARD
                .decode(TEST_KEY_PKCS8.trim())
                .expect("valid base64");
            Self {
                key: RsaKeyPair::from_pkcs8(&der).expect("valid PKCS#8 RSA key"),
            }
        }

        /// The fake JWKS holding the public half.
        pub fn keys(&self) -> HashMap<String, PublicKey> {
            let public = PublicKeyComponents::<Vec<u8>>::from(self.key.public());
            HashMap::from([(
                TEST_KID.to_owned(),
                PublicKey {
                    n: public.n,
                    e: public.e,
                },
            )])
        }

        /// A signed token with these claims.
        ///
        /// # Panics
        ///
        /// If signing fails (it does not).
        #[expect(clippy::expect_used, reason = "test helper")]
        pub fn token(&self, claims: &serde_json::Value) -> String {
            let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
            let header = engine.encode(
                serde_json::json!({ "alg": "RS256", "kid": TEST_KID, "typ": "JWT" }).to_string(),
            );
            let payload = engine.encode(claims.to_string());
            let signed = format!("{header}.{payload}");
            let mut signature = vec![0; self.key.public().modulus_len()];
            self.key
                .sign(
                    &RSA_PKCS1_SHA256,
                    &SystemRandom::new(),
                    signed.as_bytes(),
                    &mut signature,
                )
                .expect("signing");
            format!("{signed}.{}", engine.encode(signature))
        }
    }

    impl Default for TestSigner {
        fn default() -> Self {
            Self::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::testing::TestSigner;
    use super::*;

    const CLIENT: &str = "123.apps.googleusercontent.com";
    const NOW: i64 = 1_800_000_000;

    fn claims() -> serde_json::Value {
        json!({
            "iss": "https://accounts.google.com",
            "aud": CLIENT,
            "sub": "1234567890",
            "email": "Banda@Exemplo.com",
            "email_verified": true,
            "name": "Banda Exemplo",
            "iat": NOW - 10,
            "exp": NOW + 3600,
        })
    }

    async fn verify(token: &str) -> Result<GoogleIdentity, GoogleError> {
        let signer = TestSigner::new();
        GoogleAuth::with_keys(CLIENT.to_owned(), signer.keys())
            .verify(token, NOW)
            .await
    }

    #[tokio::test]
    async fn accepts_a_valid_token() {
        let token = TestSigner::new().token(&claims());
        assert_eq!(
            verify(&token).await.unwrap(),
            GoogleIdentity {
                subject: "1234567890".to_owned(),
                email: "banda@exemplo.com".to_owned(),
                name: Some("Banda Exemplo".to_owned()),
            }
        );
    }

    #[tokio::test]
    async fn refuses_wrong_audience_issuer_and_expiry() {
        let signer = TestSigner::new();
        let mut other_app = claims();
        other_app["aud"] = json!("other.apps.googleusercontent.com");
        assert_eq!(
            verify(&signer.token(&other_app)).await,
            Err(GoogleError::WrongAudience)
        );
        let mut other_issuer = claims();
        other_issuer["iss"] = json!("https://evil.example");
        assert_eq!(
            verify(&signer.token(&other_issuer)).await,
            Err(GoogleError::WrongAudience)
        );
        let mut expired = claims();
        expired["exp"] = json!(NOW - 3600);
        assert_eq!(
            verify(&signer.token(&expired)).await,
            Err(GoogleError::Expired)
        );
        let mut unverified = claims();
        unverified["email_verified"] = json!(false);
        assert_eq!(
            verify(&signer.token(&unverified)).await,
            Err(GoogleError::EmailNotVerified)
        );
    }

    #[tokio::test]
    async fn refuses_tampered_and_malformed_tokens() {
        let token = TestSigner::new().token(&claims());
        let mut parts: Vec<&str> = token.split('.').collect();
        let mut forged = claims();
        forged["email"] = json!("admin@exemplo.com");
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(forged.to_string());
        parts[1] = &payload;
        assert_eq!(
            verify(&parts.join(".")).await,
            Err(GoogleError::BadSignature)
        );
        for bad in ["", "a.b", "a.b.c.d", "not-a-token"] {
            assert!(verify(bad).await.is_err(), "{bad}");
        }
        let none = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(json!({ "alg": "none", "kid": "test-key-1" }).to_string());
        assert_eq!(
            verify(&format!("{none}.e30.")).await,
            Err(GoogleError::Malformed)
        );
    }

    #[test]
    fn reads_max_age() {
        assert_eq!(
            max_age("public, max-age=19800, must-revalidate"),
            Some(Duration::from_mins(330))
        );
        assert_eq!(max_age("no-store"), None);
    }
}
