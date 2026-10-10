//! Two-step verification (ADR 0045): an authenticator app's codes (TOTP, RFC 6238: HMAC-SHA1,
//! 30-second steps, 6 digits) or a one-time recovery code, asked for after the e-mail code or
//! Google whenever the account turned it on. The secret is sealed with the master key; recovery
//! codes are kept as keyed hashes.

use std::fmt::Write as _;
use std::time::Duration;

use hmac::{Hmac, KeyInit as _, Mac as _};
use sha1::Sha1;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::error::{ApiError, ApiResult, bad_request};
use crate::keys;
use crate::state::AppState;

/// Length of a TOTP step.
pub const STEP_SECONDS: i64 = 30;
/// Bytes of a new secret (160 bits, as RFC 4226 recommends).
pub const SECRET_LEN: usize = 20;
/// Recovery codes handed out at once.
pub const RECOVERY_CODES: usize = 10;
/// Name shown in the authenticator app.
pub const ISSUER: &str = "Ingresso Impresso";
/// Purpose of the sealed secret ([`keys::seal_data`]).
pub const SEAL_PURPOSE: &str = "totp-secret";
/// Wrong second-factor codes per account in [`ATTEMPT_WINDOW`]. Counted in the database
/// (`second_factor_attempts`), so a restart never resets a lockout.
const MAX_ATTEMPTS: i64 = 10;
const ATTEMPT_WINDOW: Duration = Duration::from_mins(15);
/// Recovery codes avoid look-alikes (0/O, 1/I/L).
const RECOVERY_ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_LEN: usize = 8;
const BASE32: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// A fresh random secret.
///
/// # Errors
///
/// The system's random source failed.
pub fn generate_secret() -> ApiResult<Zeroizing<[u8; SECRET_LEN]>> {
    let mut secret = Zeroizing::new([0u8; SECRET_LEN]);
    getrandom::fill(secret.as_mut_slice())
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("{error}")))?;
    Ok(secret)
}

/// RFC 4648 base32 without padding, as authenticator apps expect.
pub fn base32(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(5) * 8);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for &byte in bytes {
        buffer = (buffer << 8) | u32::from(byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(char::from(BASE32[((buffer >> bits) & 31) as usize]));
        }
    }
    if bits > 0 {
        out.push(char::from(BASE32[((buffer << (5 - bits)) & 31) as usize]));
    }
    out
}

/// HOTP (RFC 4226) of `counter`, as a 6-digit number.
fn hotp(secret: &[u8], counter: u64) -> u32 {
    let Ok(mut mac) = Hmac::<Sha1>::new_from_slice(secret) else {
        return u32::MAX;
    };
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = usize::from(digest.last().copied().unwrap_or(0) & 0x0f);
    let Some(window) = digest.get(offset..offset + 4) else {
        return u32::MAX;
    };
    let value = u32::from_be_bytes([window[0] & 0x7f, window[1], window[2], window[3]]);
    value % 1_000_000
}

/// The code of a step, zero-padded.
pub fn code_at(secret: &[u8], step: i64) -> String {
    format!("{:06}", hotp(secret, u64::try_from(step).unwrap_or(0)))
}

/// The step `code` matches at `unix_time` (allowing one step of clock drift either way), if it
/// comes after `last_step`: a code is accepted once.
pub fn verify(secret: &[u8], code: &str, unix_time: i64, last_step: Option<i64>) -> Option<i64> {
    if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let now = unix_time.div_euclid(STEP_SECONDS);
    (now - 1..=now + 1).find(|&step| {
        step >= 0
            && last_step.is_none_or(|last| step > last)
            && constant_time_eq(code_at(secret, step).as_bytes(), code.as_bytes())
    })
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

/// The `otpauth://` link the QR code carries.
pub fn otpauth_uri(secret: &[u8], account: &str) -> String {
    let label = format!("{ISSUER}:{account}");
    format!(
        "otpauth://totp/{}?secret={}&issuer={}&algorithm=SHA1&digits=6&period={STEP_SECONDS}",
        percent_encode(&label),
        base32(secret),
        percent_encode(ISSUER),
    )
}

fn percent_encode(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'@') {
            out.push(char::from(byte));
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

/// New recovery codes, formatted `ABCD-EFGH`.
///
/// # Errors
///
/// The system's random source failed.
pub fn generate_recovery_codes() -> ApiResult<Vec<String>> {
    let mut random = [0u8; RECOVERY_CODES * RECOVERY_LEN];
    getrandom::fill(&mut random).map_err(|error| ApiError::Internal(anyhow::anyhow!("{error}")))?;
    Ok(random
        .chunks(RECOVERY_LEN)
        .map(|chunk| {
            let code: String = chunk
                .iter()
                // 248 = 8 × 31: values past it would make some letters likelier; rare enough
                // that folding them back costs almost nothing.
                .map(|&byte| {
                    char::from(RECOVERY_ALPHABET[usize::from(byte) % RECOVERY_ALPHABET.len()])
                })
                .collect();
            format!("{}-{}", &code[..4], &code[4..])
        })
        .collect())
}

/// A recovery code as typed (any case, with or without the dash), normalized; `None` when it
/// cannot be one.
pub fn normalize_recovery(input: &str) -> Option<String> {
    let code: String = input
        .chars()
        .filter(|c| !matches!(c, '-' | ' '))
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (code.len() == RECOVERY_LEN && code.bytes().all(|byte| RECOVERY_ALPHABET.contains(&byte)))
        .then_some(code)
}

/// The stored hash of a recovery code.
pub fn recovery_hash(state: &AppState, user_id: Uuid, normalized: &str) -> Vec<u8> {
    let mut data = user_id.as_bytes().to_vec();
    data.extend_from_slice(normalized.as_bytes());
    keys::keyed_hash(&state.config.master_key, "recovery-code", &data).to_vec()
}

/// Seals a secret for a user.
pub fn seal(state: &AppState, user_id: Uuid, secret: &[u8]) -> ApiResult<Vec<u8>> {
    keys::seal_data(&state.config.master_key, SEAL_PURPOSE, user_id, secret)
        .map_err(|error| ApiError::Internal(error.into()))
}

/// Unseals a user's secret.
pub fn unseal(state: &AppState, user_id: Uuid, sealed: &[u8]) -> ApiResult<Zeroizing<Vec<u8>>> {
    keys::unseal_data(&state.config.master_key, SEAL_PURPOSE, user_id, sealed)
        .map_err(|error| ApiError::Internal(error.into()))
}

/// Replaces a user's recovery codes; returns the new ones, shown once.
pub async fn replace_recovery_codes(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> ApiResult<Vec<String>> {
    sqlx::query!("delete from recovery_codes where user_id = $1", user_id)
        .execute(&mut **tx)
        .await?;
    let codes = generate_recovery_codes()?;
    for code in &codes {
        let normalized = normalize_recovery(code).unwrap_or_default();
        sqlx::query!(
            "insert into recovery_codes (id, user_id, code_hash) values ($1, $2, $3)",
            Uuid::new_v4(),
            user_id,
            recovery_hash(state, user_id, &normalized),
        )
        .execute(&mut **tx)
        .await?;
    }
    Ok(codes)
}

/// The second step of a sign-in, and the check before turning it off: passes when the account
/// has no two-step verification, or when `input` is a fresh authenticator code or an unused
/// recovery code (which is then spent). Without `input` it answers `two_factor_required`.
pub async fn check(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    input: Option<&str>,
) -> ApiResult<()> {
    let row = sqlx::query!(
        "select totp_secret, totp_enabled_at, totp_last_step from users where id = $1 for no key update",
        user_id
    )
    .fetch_one(&mut **tx)
    .await?;
    let (Some(sealed), Some(_)) = (row.totp_secret, row.totp_enabled_at) else {
        return Ok(());
    };
    let Some(input) = input.map(str::trim).filter(|input| !input.is_empty()) else {
        return Err(ApiError::Refused(
            "two_factor_required",
            "enter the code of your authenticator app".to_owned(),
        ));
    };
    if locked(state, user_id).await? {
        return Err(ApiError::TooManyRequests);
    }
    let digits: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    if digits.len() == 6 && digits.bytes().all(|byte| byte.is_ascii_digit()) {
        let secret = unseal(state, user_id, &sealed)?;
        let now = time::OffsetDateTime::now_utc().unix_timestamp();
        if let Some(step) = verify(&secret, &digits, now, row.totp_last_step) {
            sqlx::query!(
                "update users set totp_last_step = $2 where id = $1",
                user_id,
                step
            )
            .execute(&mut **tx)
            .await?;
            return Ok(());
        }
    } else if let Some(code) = normalize_recovery(input) {
        let spent = sqlx::query_scalar!(
            "update recovery_codes set used_at = now()
             where user_id = $1 and code_hash = $2 and used_at is null returning id",
            user_id,
            recovery_hash(state, user_id, &code),
        )
        .fetch_optional(&mut **tx)
        .await?;
        if spent.is_some() {
            return Ok(());
        }
    }
    Err(failed(state, user_id).await)
}

/// Counts a wrong second-factor code (only wrong ones count toward [`MAX_ATTEMPTS`]) and answers
/// the error for it. The row is written outside the caller's transaction, which rolls back.
pub async fn failed(state: &AppState, user_id: Uuid) -> ApiError {
    let recorded = sqlx::query!(
        "insert into second_factor_attempts (user_id) values ($1)",
        user_id
    )
    .execute(&state.pool)
    .await;
    if let Err(error) = recorded {
        return ApiError::Internal(error.into());
    }
    bad_request("invalid_two_factor_code", "wrong or used verification code")
}

/// Whether the account ran out of second-factor tries for now.
///
/// # Errors
///
/// Database errors.
pub async fn locked(state: &AppState, user_id: Uuid) -> ApiResult<bool> {
    let window = i32::try_from(ATTEMPT_WINDOW.as_secs()).unwrap_or(900);
    let failures = sqlx::query_scalar!(
        r#"select count(*) as "count!" from second_factor_attempts
           where user_id = $1 and created_at > now() - make_interval(secs => $2::int)"#,
        user_id,
        window,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(failures >= MAX_ATTEMPTS)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 6238 appendix B, SHA-1 key, last 6 of the 8 digits.
    #[test]
    fn matches_the_rfc_vectors() {
        let secret = b"12345678901234567890";
        for (time, expected) in [
            (59, "287082"),
            (1_111_111_109, "081804"),
            (1_111_111_111, "050471"),
            (1_234_567_890, "005924"),
            (2_000_000_000, "279037"),
        ] {
            assert_eq!(code_at(secret, time / STEP_SECONDS), expected, "t = {time}");
        }
    }

    #[test]
    fn accepts_one_step_of_drift_and_each_step_once() {
        let secret = b"12345678901234567890";
        let now = 1_111_111_111;
        let step = now / STEP_SECONDS;
        let code = code_at(secret, step);
        assert_eq!(verify(secret, &code, now, None), Some(step));
        assert_eq!(verify(secret, &code, now + STEP_SECONDS, None), Some(step));
        assert_eq!(verify(secret, &code, now + 3 * STEP_SECONDS, None), None);
        assert_eq!(verify(secret, &code, now, Some(step)), None, "replay");
        assert_eq!(verify(secret, "12345", now, None), None);
        assert_eq!(verify(secret, "abcdef", now, None), None);
    }

    #[test]
    fn base32_matches_rfc_4648() {
        assert_eq!(base32(b""), "");
        assert_eq!(base32(b"f"), "MY");
        assert_eq!(base32(b"foobar"), "MZXW6YTBOI");
        assert_eq!(
            base32(b"12345678901234567890"),
            "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        );
    }

    #[test]
    fn otpauth_links_name_the_issuer_and_account() {
        let uri = otpauth_uri(b"12345678901234567890", "banda@exemplo.com");
        assert_eq!(
            uri,
            "otpauth://totp/Ingresso%20Impresso%3Abanda@exemplo.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Ingresso%20Impresso&algorithm=SHA1&digits=6&period=30"
        );
    }

    #[test]
    fn recovery_codes_are_readable_and_normalize() {
        let codes = generate_recovery_codes().unwrap();
        assert_eq!(codes.len(), RECOVERY_CODES);
        for code in &codes {
            assert_eq!(code.len(), 9);
            assert_eq!(normalize_recovery(code).unwrap(), code.replace('-', ""));
            assert_eq!(
                normalize_recovery(&code.to_lowercase().replace('-', " ")).unwrap(),
                code.replace('-', "")
            );
        }
        assert_eq!(
            normalize_recovery("ABCD-EFG0"),
            None,
            "0 is not in the alphabet"
        );
        assert_eq!(normalize_recovery("ABC"), None);
    }
}
