//! Pix keys (ADR 0085): the organization's and the sellers' keys, checked and normalized here so
//! the BR Code built on the phone (`apps/web/src/lib/pix.ts`) is always one a bank accepts. The
//! platform never moves money: it only stores where the buyer pays.

use thiserror::Error;

use crate::api::PixKeyType;

/// Longest receiver name of a BR Code (field 59).
pub const MAX_NAME: usize = 25;
/// Longest receiver city of a BR Code (field 60).
pub const MAX_CITY: usize = 15;
/// Longest e-mail key the Pix directory accepts.
const MAX_EMAIL: usize = 77;

/// Why a key, name or city is refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum PixError {
    /// The key does not match its type (wrong length, check digits, shape).
    #[error("invalid Pix key")]
    Key,
    /// The receiver's name is empty, too long or has control characters.
    #[error("invalid Pix receiver name")]
    Name,
    /// The city is empty, too long or has control characters.
    #[error("invalid Pix city")]
    City,
}

impl PixError {
    /// The stable error code the panel translates.
    pub const fn code(self) -> &'static str {
        match self {
            Self::Key => "invalid_pix_key",
            Self::Name => "invalid_pix_name",
            Self::City => "invalid_pix_city",
        }
    }
}

/// A key, its receiver and city, as stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PixAccount {
    /// Kind of key.
    pub key_type: PixKeyType,
    /// The key, normalized.
    pub key: String,
    /// Who receives (1–25 characters, as typed).
    pub name: String,
    /// City (1–15 characters, as typed).
    pub city: String,
}

/// Checks and normalizes a key, its receiver and city.
///
/// # Errors
///
/// [`PixError`] for the first field that is wrong.
pub fn account(
    key_type: PixKeyType,
    key: &str,
    name: &str,
    city: &str,
) -> Result<PixAccount, PixError> {
    let key = normalize_key(key_type, key)?;
    let name = label(name, MAX_NAME).ok_or(PixError::Name)?;
    let city = label(city, MAX_CITY).ok_or(PixError::City)?;
    Ok(PixAccount {
        key_type,
        key,
        name,
        city,
    })
}

/// A one-line label of 1–`max` characters, trimmed.
fn label(text: &str, max: usize) -> Option<String> {
    let text = text.trim();
    let count = text.chars().count();
    (count >= 1 && count <= max && !text.chars().any(char::is_control)).then(|| text.to_owned())
}

/// The key in the form the Pix directory stores it.
///
/// # Errors
///
/// [`PixError::Key`] when it does not match `key_type`.
pub fn normalize_key(key_type: PixKeyType, key: &str) -> Result<String, PixError> {
    let key = key.trim();
    match key_type {
        PixKeyType::Cpf => {
            let digits = only(key, |c| c.is_ascii_digit(), ".-/ ").ok_or(PixError::Key)?;
            valid_cpf(&digits).then_some(digits).ok_or(PixError::Key)
        }
        PixKeyType::Cnpj => {
            let chars = only(key, |c| c.is_ascii_alphanumeric(), ".-/ ")
                .ok_or(PixError::Key)?
                .to_ascii_uppercase();
            valid_cnpj(&chars).then_some(chars).ok_or(PixError::Key)
        }
        PixKeyType::Email => {
            let email = key.to_ascii_lowercase();
            valid_email(&email).then_some(email).ok_or(PixError::Key)
        }
        PixKeyType::Phone => phone(key).ok_or(PixError::Key),
        PixKeyType::Random => {
            let evp = key.to_ascii_lowercase();
            uuid::Uuid::parse_str(&evp)
                .ok()
                .filter(|_| evp.len() == 36)
                .map(|_| evp)
                .ok_or(PixError::Key)
        }
    }
}

/// `text` without the `separators`, when every other character passes `keep`.
fn only(text: &str, keep: impl Fn(char) -> bool, separators: &str) -> Option<String> {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if keep(c) {
            out.push(c);
        } else if !separators.contains(c) {
            return None;
        }
    }
    Some(out)
}

/// Check digit of the CPF/CNPJ modulo 11 rule over `values` with `weights`.
fn check_digit(values: &[u32], weights: &[u32]) -> u32 {
    let sum: u32 = values.iter().zip(weights).map(|(v, w)| v * w).sum();
    match sum % 11 {
        0 | 1 => 0,
        rest => 11 - rest,
    }
}

/// A CPF: 11 digits, not all equal, with both check digits right.
fn valid_cpf(digits: &str) -> bool {
    let values: Vec<u32> = digits.chars().filter_map(|c| c.to_digit(10)).collect();
    if values.len() != 11 || values.windows(2).all(|pair| pair.first() == pair.last()) {
        return false;
    }
    let first = check_digit(
        values.get(..9).unwrap_or_default(),
        &[10, 9, 8, 7, 6, 5, 4, 3, 2],
    );
    let second = check_digit(
        values.get(..10).unwrap_or_default(),
        &[11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
    );
    values.get(9) == Some(&first) && values.get(10) == Some(&second)
}

/// A CNPJ, numeric or alphanumeric (Receita Federal, from July 2026): 12 letters or digits and 2
/// check digits, each character worth its ASCII code minus 48.
fn valid_cnpj(chars: &str) -> bool {
    if chars.len() != 14
        || !chars
            .chars()
            .all(|c| c.is_ascii_digit() || c.is_ascii_uppercase())
        || !chars.chars().skip(12).all(|c| c.is_ascii_digit())
    {
        return false;
    }
    let values: Vec<u32> = chars.chars().map(|c| u32::from(c) - 48).collect();
    if values.windows(2).all(|pair| pair.first() == pair.last()) {
        return false;
    }
    let first = check_digit(
        values.get(..12).unwrap_or_default(),
        &[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    );
    let second = check_digit(
        values.get(..13).unwrap_or_default(),
        &[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    );
    values.get(12) == Some(&first) && values.get(13) == Some(&second)
}

/// An e-mail key: ASCII, one `@`, a dotted domain, no spaces, up to 77 characters.
fn valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    email.len() <= MAX_EMAIL
        && email.is_ascii()
        && !local.is_empty()
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !email.chars().any(|c| c.is_whitespace() || c.is_control())
}

/// A Brazilian mobile as typed (`(11) 99999-8888`, `+55 11 …`, `011 …`) to the directory's
/// `+55` + area code + number. Only mobiles (9 digits, starting with 9) are Pix keys.
fn phone(text: &str) -> Option<String> {
    let international = text.starts_with('+');
    let digits = only(text, |c| c.is_ascii_digit(), " ()-.+")?;
    let national = if international {
        digits.strip_prefix("55")?.to_owned()
    } else {
        digits.strip_prefix('0').unwrap_or(&digits).to_owned()
    };
    let area_ok = national
        .get(..2)
        .is_some_and(|area| area.chars().all(|c| ('1'..='9').contains(&c)));
    let mobile = national.len() == 11 && national.as_bytes().get(2) == Some(&b'9');
    (area_ok && mobile).then(|| format!("+55{national}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpf_keys_need_their_check_digits() {
        assert_eq!(
            normalize_key(PixKeyType::Cpf, "123.456.789-09"),
            Ok("12345678909".to_owned())
        );
        assert_eq!(
            normalize_key(PixKeyType::Cpf, "123.456.789-08"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Cpf, "111.111.111-11"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Cpf, "1234567890"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Cpf, "123x56789-09"),
            Err(PixError::Key)
        );
    }

    #[test]
    fn cnpj_keys_numeric_and_alphanumeric() {
        assert_eq!(
            normalize_key(PixKeyType::Cnpj, "11.222.333/0001-81"),
            Ok("11222333000181".to_owned())
        );
        assert_eq!(
            normalize_key(PixKeyType::Cnpj, "11.222.333/0001-82"),
            Err(PixError::Key)
        );
        // The Receita Federal's example of the alphanumeric CNPJ.
        assert_eq!(
            normalize_key(PixKeyType::Cnpj, "12.abc.345/01de-35"),
            Ok("12ABC34501DE35".to_owned())
        );
        assert_eq!(
            normalize_key(PixKeyType::Cnpj, "12ABC34501DE3A"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Cnpj, "00000000000000"),
            Err(PixError::Key)
        );
    }

    #[test]
    fn email_phone_and_random_keys() {
        assert_eq!(
            normalize_key(PixKeyType::Email, " Tesouraria@Escola.org.br "),
            Ok("tesouraria@escola.org.br".to_owned())
        );
        assert_eq!(
            normalize_key(PixKeyType::Email, "sem-arroba.com"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Email, &format!("{}@x.com", "a".repeat(72))),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Phone, "(11) 99999-8888"),
            Ok("+5511999998888".to_owned())
        );
        assert_eq!(
            normalize_key(PixKeyType::Phone, "+55 21 98888-4444"),
            Ok("+5521988884444".to_owned())
        );
        // A landline is no Pix key.
        assert_eq!(
            normalize_key(PixKeyType::Phone, "+55 21 3333-4444"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Phone, "011 99999-8888"),
            Ok("+5511999998888".to_owned())
        );
        assert_eq!(
            normalize_key(PixKeyType::Phone, "+1 415 555 0100"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Phone, "9999-8888"),
            Err(PixError::Key)
        );
        assert_eq!(
            normalize_key(PixKeyType::Random, "123E4567-E12B-12D1-A456-426655440000"),
            Ok("123e4567-e12b-12d1-a456-426655440000".to_owned())
        );
        assert_eq!(
            normalize_key(PixKeyType::Random, "123e4567e12b12d1a456426655440000"),
            Err(PixError::Key)
        );
    }

    #[test]
    fn names_and_cities_fit_the_br_code() {
        let ok = account(
            PixKeyType::Cpf,
            "12345678909",
            " Grêmio Estudantil ",
            "Recife",
        )
        .unwrap();
        assert_eq!(ok.name, "Grêmio Estudantil");
        assert_eq!(
            account(PixKeyType::Cpf, "12345678909", &"x".repeat(26), "Recife"),
            Err(PixError::Name)
        );
        assert_eq!(
            account(PixKeyType::Cpf, "12345678909", "Banda", "Rio de Janeiro RJ"),
            Err(PixError::City)
        );
        assert_eq!(
            account(PixKeyType::Cpf, "12345678909", "Banda\nX", "Recife"),
            Err(PixError::Name)
        );
    }
}
