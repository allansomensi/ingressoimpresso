//! Digital tickets in the phone's wallet (ADR 0097): an Apple Wallet pass (`.pkpass`, signed
//! with the organizer-independent Pass Type ID certificate of the platform) and a "save to Google
//! Wallet" link (a JWT signed with a Google Cloud service account). Both carry the same QR v1 of
//! the paper ticket (invariant 11): the wallet only shows it, offline, and offers it on the lock
//! screen at the time of the event (`relevantDate`, the event's `dateTime`).
//!
//! Each wallet is on only with its credentials; without them the ticket page shows no button.
//! Signing uses `ring` (already in the tree): an RSA key in PKCS#8. The PKCS#7 signature Apple
//! asks for is a small DER structure written here; the certificates are copied as they are.

use std::io::{Cursor, Write as _};

use base64::Engine as _;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use ring::rand::SystemRandom;
use ring::signature::{RSA_PKCS1_SHA256, RsaKeyPair};
use serde_json::{Value, json};
use sha1::Sha1;
use sha2::Digest as _;
use thiserror::Error;
use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

use crate::config::ConfigError;

/// Icons of the pass (the product's mark): Apple requires `icon.png`.
const ICON: &[u8] = include_bytes!("../assets/wallet/icon.png");
const ICON_2X: &[u8] = include_bytes!("../assets/wallet/icon@2x.png");
const ICON_3X: &[u8] = include_bytes!("../assets/wallet/icon@3x.png");

/// A wallet pass that could not be made.
#[derive(Debug, Error)]
pub enum WalletError {
    /// The key refused to sign (never with a valid RSA key).
    #[error("could not sign the pass")]
    Sign,
    /// Writing the archive failed.
    #[error("could not write the pass: {0}")]
    Archive(String),
}

/// Apple Wallet credentials: the Pass Type ID certificate, its key and Apple's intermediate (WWDR).
pub struct AppleWallet {
    pass_type_id: String,
    team_id: String,
    certificate: Vec<u8>,
    intermediate: Vec<u8>,
    key: RsaKeyPair,
}

impl std::fmt::Debug for AppleWallet {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AppleWallet")
            .field("pass_type_id", &self.pass_type_id)
            .field("team_id", &self.team_id)
            .finish_non_exhaustive()
    }
}

/// Google Wallet credentials: the issuer and a service account allowed to issue its passes.
pub struct GoogleWallet {
    issuer_id: String,
    email: String,
    key: RsaKeyPair,
}

impl std::fmt::Debug for GoogleWallet {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("GoogleWallet")
            .field("issuer_id", &self.issuer_id)
            .field("email", &self.email)
            .finish_non_exhaustive()
    }
}

/// The wallets this server can issue.
#[derive(Debug, Default)]
pub struct Wallets {
    pub apple: Option<AppleWallet>,
    pub google: Option<GoogleWallet>,
}

/// The DER inside a PEM block (or a plain base64 body): headers and blanks dropped.
fn pem_der(name: &'static str, text: &str) -> Result<Vec<u8>, ConfigError> {
    let body: String = text
        .replace("\\n", "\n")
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .flat_map(str::chars)
        .filter(|c| !c.is_whitespace())
        .collect();
    STANDARD.decode(body).map_err(|error| ConfigError::Invalid {
        name,
        reason: error.to_string(),
    })
}

fn rsa_key(name: &'static str, text: &str) -> Result<RsaKeyPair, ConfigError> {
    RsaKeyPair::from_pkcs8(&pem_der(name, text)?).map_err(|error| ConfigError::Invalid {
        name,
        reason: format!("not an RSA key in PKCS#8: {error}"),
    })
}

impl Wallets {
    /// Reads `APPLE_WALLET_*` (all five or none) and `GOOGLE_WALLET_*` (both or none).
    ///
    /// # Errors
    ///
    /// A wallet half configured, or a key or certificate that cannot be read.
    pub fn from_lookup(get: impl Fn(&'static str) -> Option<String>) -> Result<Self, ConfigError> {
        const APPLE: [&str; 5] = [
            "APPLE_WALLET_PASS_TYPE_ID",
            "APPLE_WALLET_TEAM_ID",
            "APPLE_WALLET_CERTIFICATE",
            "APPLE_WALLET_KEY",
            "APPLE_WALLET_WWDR",
        ];
        let apple_values: Vec<Option<String>> = APPLE.iter().map(|name| get(name)).collect();
        let apple = if apple_values.iter().all(Option::is_none) {
            None
        } else {
            let mut values = Vec::with_capacity(APPLE.len());
            for (name, value) in APPLE.iter().zip(apple_values) {
                values.push(value.ok_or(ConfigError::Missing(name))?);
            }
            let [pass_type_id, team_id, certificate, key, intermediate]: [String; 5] = values
                .try_into()
                .map_err(|_| ConfigError::Missing("APPLE_WALLET_PASS_TYPE_ID"))?;
            Some(AppleWallet {
                pass_type_id,
                team_id,
                certificate: pem_der("APPLE_WALLET_CERTIFICATE", &certificate)?,
                intermediate: pem_der("APPLE_WALLET_WWDR", &intermediate)?,
                key: rsa_key("APPLE_WALLET_KEY", &key)?,
            })
        };
        let google = match (
            get("GOOGLE_WALLET_ISSUER_ID"),
            get("GOOGLE_WALLET_SERVICE_ACCOUNT"),
        ) {
            (None, None) => None,
            (Some(_), None) => return Err(ConfigError::Missing("GOOGLE_WALLET_SERVICE_ACCOUNT")),
            (None, Some(_)) => return Err(ConfigError::Missing("GOOGLE_WALLET_ISSUER_ID")),
            (Some(issuer_id), Some(account)) => {
                // The JSON key Google Cloud downloads for a service account.
                let invalid = |reason: &str| ConfigError::Invalid {
                    name: "GOOGLE_WALLET_SERVICE_ACCOUNT",
                    reason: reason.to_owned(),
                };
                let account: Value = serde_json::from_str(&account)
                    .map_err(|_| invalid("not the service account's JSON key"))?;
                let email = account["client_email"]
                    .as_str()
                    .ok_or_else(|| invalid("no client_email"))?
                    .to_owned();
                let key = account["private_key"]
                    .as_str()
                    .ok_or_else(|| invalid("no private_key"))?;
                Some(GoogleWallet {
                    issuer_id: issuer_id.trim().to_owned(),
                    email,
                    key: rsa_key("GOOGLE_WALLET_SERVICE_ACCOUNT", key)?,
                })
            }
        };
        Ok(Self { apple, google })
    }
}

/// What a wallet pass shows: the ticket as on the holder's phone.
#[derive(Debug, Clone)]
pub struct PassContent {
    /// The link's id: one pass per link (a transfer makes another).
    pub serial: String,
    pub event_id: String,
    pub event_name: String,
    pub organization: String,
    pub starts_at: OffsetDateTime,
    pub ends_at: OffsetDateTime,
    pub venue: Option<String>,
    pub address: Option<String>,
    /// "Nº 0016".
    pub number: String,
    pub holder: Option<String>,
    pub category: Option<String>,
    pub seat: Option<String>,
    /// The signed QR v1 text.
    pub qr_text: String,
    /// Background of the pass (`#rrggbb`), dark enough for white text.
    pub color: String,
    /// The ticket's page (`/ingresso#token`), on the back of the pass.
    pub url: String,
    /// Consumption tokens (ADR 0084): the labels speak of a ficha.
    pub tokens: bool,
}

/// `#rrggbb` → `rgb(r, g, b)`, as Apple writes colours.
fn rgb(hex: &str) -> String {
    let channel = |at: usize| {
        hex.get(at..at + 2)
            .and_then(|pair| u8::from_str_radix(pair, 16).ok())
            .unwrap_or(0)
    };
    format!("rgb({}, {}, {})", channel(1), channel(3), channel(5))
}

fn rfc3339(at: OffsetDateTime) -> String {
    at.format(&Rfc3339).unwrap_or_default()
}

/// Labels of the pass, in Portuguese (ticket or ficha).
struct Labels {
    event: &'static str,
    number: &'static str,
    description: &'static str,
}

fn labels(tokens: bool) -> Labels {
    if tokens {
        Labels {
            event: "FICHA",
            number: "Ficha",
            description: "Ficha de",
        }
    } else {
        Labels {
            event: "EVENTO",
            number: "Ingresso",
            description: "Ingresso de",
        }
    }
}

impl AppleWallet {
    /// The pass description Apple reads (`pass.json`).
    fn pass_json(&self, pass: &PassContent) -> Value {
        let words = labels(pass.tokens);
        let field = |key: &str, label: &str, value: &str| json!({ "key": key, "label": label, "value": value });
        let mut secondary = vec![json!({
            "key": "date", "label": "DATA", "value": rfc3339(pass.starts_at),
            "dateStyle": "PKDateStyleMedium", "timeStyle": "PKDateStyleShort", "ignoresTimeZone": true,
        })];
        if let Some(category) = &pass.category {
            secondary.push(field("category", "CATEGORIA", category));
        }
        let mut auxiliary = Vec::new();
        if let Some(venue) = &pass.venue {
            auxiliary.push(field("venue", "LOCAL", venue));
        }
        if let Some(seat) = &pass.seat {
            auxiliary.push(field("seat", "LUGAR", seat));
        }
        if let Some(holder) = &pass.holder {
            auxiliary.push(field("holder", "NOME", holder));
        }
        let mut back = Vec::new();
        if let Some(address) = &pass.address {
            back.push(field("address", "Endereço", address));
        }
        back.push(field("organizer", "Organização", &pass.organization));
        back.push(field("link", "No celular", &pass.url));
        back.push(field(
            "about",
            "Ingresso Impresso",
            "Mostre o QR code na entrada com o brilho no máximo. Ele vale uma vez: a primeira leitura vale, cópias são barradas.",
        ));
        let barcode = json!({
            "format": "PKBarcodeFormatQR",
            "message": pass.qr_text,
            "messageEncoding": "iso-8859-1",
            "altText": pass.number,
        });
        json!({
            "formatVersion": 1,
            "passTypeIdentifier": self.pass_type_id,
            "teamIdentifier": self.team_id,
            "serialNumber": pass.serial,
            "groupingIdentifier": pass.event_id,
            "organizationName": pass.organization,
            "description": format!("{} {}", words.description, pass.event_name),
            "logoText": pass.organization,
            "foregroundColor": "rgb(255, 255, 255)",
            "labelColor": "rgb(235, 235, 245)",
            "backgroundColor": rgb(&pass.color),
            "relevantDate": rfc3339(pass.starts_at),
            "expirationDate": rfc3339(pass.ends_at + Duration::hours(12)),
            "sharingProhibited": true,
            "barcodes": [barcode.clone()],
            "barcode": barcode,
            "eventTicket": {
                "headerFields": [field("number", words.number, &pass.number)],
                "primaryFields": [field("event", words.event, &pass.event_name)],
                "secondaryFields": secondary,
                "auxiliaryFields": auxiliary,
                "backFields": back,
            },
        })
    }

    /// The `.pkpass`: `pass.json`, the icons, the manifest of their SHA-1 and its signature.
    ///
    /// # Errors
    ///
    /// See [`WalletError`].
    pub fn pkpass(&self, pass: &PassContent, now: OffsetDateTime) -> Result<Vec<u8>, WalletError> {
        let pass_json = serde_json::to_vec(&self.pass_json(pass))
            .map_err(|error| WalletError::Archive(error.to_string()))?;
        let files: [(&str, &[u8]); 4] = [
            ("pass.json", &pass_json),
            ("icon.png", ICON),
            ("icon@2x.png", ICON_2X),
            ("icon@3x.png", ICON_3X),
        ];
        let manifest: serde_json::Map<String, Value> = files
            .iter()
            .map(|(name, bytes)| {
                (
                    (*name).to_owned(),
                    Value::String(hex::encode(Sha1::digest(bytes))),
                )
            })
            .collect();
        let manifest = serde_json::to_vec(&manifest)
            .map_err(|error| WalletError::Archive(error.to_string()))?;
        let signature = pkcs7::detached(
            &manifest,
            &self.certificate,
            &self.intermediate,
            &self.key,
            now,
        )?;
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        let write = |zip: &mut zip::ZipWriter<Cursor<Vec<u8>>>, name: &str, bytes: &[u8]| {
            zip.start_file(name, options)
                .and_then(|()| zip.write_all(bytes).map_err(Into::into))
                .map_err(|error| WalletError::Archive(error.to_string()))
        };
        for (name, bytes) in files {
            write(&mut zip, name, bytes)?;
        }
        write(&mut zip, "manifest.json", &manifest)?;
        write(&mut zip, "signature", &signature)?;
        zip.finish()
            .map(Cursor::into_inner)
            .map_err(|error| WalletError::Archive(error.to_string()))
    }
}

/// An id Google accepts (letters, digits, `.`, `_`, `-`).
fn google_id(issuer: &str, kind: &str, id: &str) -> String {
    let clean: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect();
    format!("{issuer}.{kind}_{clean}")
}

fn localized(text: &str) -> Value {
    json!({ "defaultValue": { "language": "pt-BR", "value": text } })
}

impl GoogleWallet {
    /// The "save to Google Wallet" address: a JWT with the event's class and the ticket's object,
    /// signed by the service account (RS256). Google creates both when the holder saves it.
    ///
    /// # Errors
    ///
    /// See [`WalletError`].
    pub fn save_url(
        &self,
        pass: &PassContent,
        origin: &str,
        now: OffsetDateTime,
    ) -> Result<String, WalletError> {
        let words = labels(pass.tokens);
        let class_id = google_id(&self.issuer_id, "ev", &pass.event_id);
        let mut venue = serde_json::Map::new();
        if let Some(name) = &pass.venue {
            venue.insert("name".to_owned(), localized(name));
        }
        if let Some(address) = &pass.address {
            venue.insert("address".to_owned(), localized(address));
        }
        let class = json!({
            "id": class_id,
            "issuerName": pass.organization,
            "reviewStatus": "UNDER_REVIEW",
            "eventName": localized(&pass.event_name),
            "dateTime": { "start": rfc3339(pass.starts_at), "end": rfc3339(pass.ends_at) },
            "venue": venue,
            "hexBackgroundColor": pass.color,
        });
        let mut object = json!({
            "id": google_id(&self.issuer_id, "tk", &pass.serial),
            "classId": class_id,
            "state": "ACTIVE",
            "ticketNumber": pass.number,
            "barcode": { "type": "QR_CODE", "value": pass.qr_text, "alternateText": pass.number },
            "hexBackgroundColor": pass.color,
            "validTimeInterval": { "end": { "date": rfc3339(pass.ends_at + Duration::hours(12)) } },
            "linksModuleData": { "uris": [{ "uri": pass.url, "description": words.number, "id": "ticket" }] },
        });
        if let Some(holder) = &pass.holder {
            object["ticketHolderName"] = Value::String(holder.clone());
        }
        if let Some(category) = &pass.category {
            object["ticketType"] = localized(category);
        }
        if let Some(seat) = &pass.seat {
            object["seatInfo"] = json!({ "seat": localized(seat) });
        }
        let claims = json!({
            "iss": self.email,
            "aud": "google",
            "typ": "savetowallet",
            "iat": now.unix_timestamp(),
            "origins": [origin],
            "payload": { "eventTicketClasses": [class], "eventTicketObjects": [object] },
        });
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"RS256","typ":"JWT"}"#);
        let body = URL_SAFE_NO_PAD.encode(
            serde_json::to_vec(&claims).map_err(|error| WalletError::Archive(error.to_string()))?,
        );
        let signing_input = format!("{header}.{body}");
        let signature = rsa_sha256(&self.key, signing_input.as_bytes())?;
        Ok(format!(
            "https://pay.google.com/gp/v/save/{signing_input}.{}",
            URL_SAFE_NO_PAD.encode(signature)
        ))
    }
}

fn rsa_sha256(key: &RsaKeyPair, message: &[u8]) -> Result<Vec<u8>, WalletError> {
    let mut signature = vec![0; key.public().modulus_len()];
    key.sign(
        &RSA_PKCS1_SHA256,
        &SystemRandom::new(),
        message,
        &mut signature,
    )
    .map_err(|_| WalletError::Sign)?;
    Ok(signature)
}

/// A minimal DER writer and reader for the PKCS#7 (CMS) detached signature of a pass.
mod pkcs7 {
    use ring::signature::RsaKeyPair;
    use sha2::{Digest as _, Sha256};
    use time::OffsetDateTime;

    use super::{WalletError, rsa_sha256};

    // Object identifiers, DER-encoded contents.
    const OID_DATA: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01];
    const OID_SIGNED_DATA: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02];
    const OID_SHA256: &[u8] = &[0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01];
    const OID_RSA: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
    const OID_CONTENT_TYPE: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x03];
    const OID_MESSAGE_DIGEST: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04];
    const OID_SIGNING_TIME: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x05];

    /// A tag-length-value with a definite DER length.
    pub(super) fn tlv(tag: u8, content: &[u8]) -> Vec<u8> {
        let mut out = vec![tag];
        let len = content.len();
        if len < 0x80 {
            out.push(u8::try_from(len).unwrap_or(0));
        } else {
            let bytes: Vec<u8> = len
                .to_be_bytes()
                .into_iter()
                .skip_while(|byte| *byte == 0)
                .collect();
            out.push(0x80 | u8::try_from(bytes.len()).unwrap_or(0));
            out.extend(bytes);
        }
        out.extend_from_slice(content);
        out
    }

    fn seq(parts: &[&[u8]]) -> Vec<u8> {
        tlv(0x30, &parts.concat())
    }

    /// A DER `SET OF`: its elements sorted by their encoding.
    fn set(mut parts: Vec<Vec<u8>>) -> Vec<u8> {
        parts.sort();
        tlv(0x31, &parts.concat())
    }

    fn oid(value: &[u8]) -> Vec<u8> {
        tlv(0x06, value)
    }

    fn algorithm(value: &[u8]) -> Vec<u8> {
        seq(&[&oid(value), &[0x05, 0x00]])
    }

    /// The elements of a DER structure's content: `(tag, whole encoding)` each.
    pub(super) fn elements(content: &[u8]) -> Option<Vec<(u8, &[u8])>> {
        let mut out = Vec::new();
        let mut rest = content;
        while !rest.is_empty() {
            let tag = *rest.first()?;
            let first = *rest.get(1)?;
            let (len, header) = if first < 0x80 {
                (usize::from(first), 2)
            } else {
                let count = usize::from(first & 0x7f);
                let bytes = rest.get(2..2 + count)?;
                (
                    bytes
                        .iter()
                        .fold(0usize, |len, byte| (len << 8) | usize::from(*byte)),
                    2 + count,
                )
            };
            let whole = rest.get(..header + len)?;
            out.push((tag, whole));
            rest = rest.get(header + len..)?;
        }
        Some(out)
    }

    /// The content of a single TLV.
    pub(super) fn content(whole: &[u8]) -> Option<&[u8]> {
        let first = *whole.get(1)?;
        let header = if first < 0x80 {
            2
        } else {
            2 + usize::from(first & 0x7f)
        };
        whole.get(header..)
    }

    /// The issuer `Name` and `serialNumber` of a certificate, as encoded.
    pub(super) fn issuer_and_serial(certificate: &[u8]) -> Option<(Vec<u8>, Vec<u8>)> {
        // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
        let outer = elements(certificate)?;
        let fields = elements(content(outer.first()?.1)?)?;
        let parts = elements(content(fields.first()?.1)?)?;
        // An explicit version ([0]) comes first in v3 certificates.
        let skip = usize::from(parts.first()?.0 == 0xa0);
        let serial = parts.get(skip)?.1.to_vec();
        let issuer = parts.get(skip + 2)?.1.to_vec();
        Some((issuer, serial))
    }

    /// `YYMMDDHHMMSSZ`.
    fn utc_time(at: OffsetDateTime) -> Vec<u8> {
        let at = at.to_offset(time::UtcOffset::UTC);
        let text = format!(
            "{:02}{:02}{:02}{:02}{:02}{:02}Z",
            at.year().rem_euclid(100),
            u8::from(at.month()),
            at.day(),
            at.hour(),
            at.minute(),
            at.second()
        );
        tlv(0x17, text.as_bytes())
    }

    /// A detached `SignedData` over `content`, by `certificate` (and its `intermediate`).
    pub(super) fn detached(
        content: &[u8],
        certificate: &[u8],
        intermediate: &[u8],
        key: &RsaKeyPair,
        now: OffsetDateTime,
    ) -> Result<Vec<u8>, WalletError> {
        let (issuer, serial) = issuer_and_serial(certificate)
            .ok_or_else(|| WalletError::Archive("unreadable certificate".to_owned()))?;
        let digest = Sha256::digest(content);
        let attributes = vec![
            seq(&[&oid(OID_CONTENT_TYPE), &set(vec![oid(OID_DATA)])]),
            seq(&[&oid(OID_SIGNING_TIME), &set(vec![utc_time(now)])]),
            seq(&[&oid(OID_MESSAGE_DIGEST), &set(vec![tlv(0x04, &digest)])]),
        ];
        // Signed as a SET; stored with the context tag [0].
        let signed_attributes = set(attributes);
        let signature = rsa_sha256(key, &signed_attributes)?;
        let mut implicit = signed_attributes;
        if let Some(tag) = implicit.first_mut() {
            *tag = 0xa0;
        }
        let signer = seq(&[
            &[0x02, 0x01, 0x01],
            &seq(&[&issuer, &serial]),
            &algorithm(OID_SHA256),
            &implicit,
            &algorithm(OID_RSA),
            &tlv(0x04, &signature),
        ]);
        let signed_data = seq(&[
            &[0x02, 0x01, 0x01],
            &set(vec![algorithm(OID_SHA256)]),
            &seq(&[&oid(OID_DATA)]),
            &tlv(0xa0, &[certificate, intermediate].concat()),
            &set(vec![signer]),
        ]);
        Ok(seq(&[&oid(OID_SIGNED_DATA), &tlv(0xa0, &signed_data)]))
    }
}

/// SHA-256 of the manifest, for tests that check the signed digest.
#[cfg(test)]
fn sha256(bytes: &[u8]) -> Vec<u8> {
    sha2::Sha256::digest(bytes).to_vec()
}

#[cfg(test)]
mod tests {
    use std::io::Read as _;

    use ring::signature::{RSA_PKCS1_2048_8192_SHA256, UnparsedPublicKey};
    use time::macros::datetime;

    use super::pkcs7::{content, elements, tlv};
    use super::*;

    const KEY_B64: &str = include_str!("../tests/fixtures/wallet/key.pk8.b64");
    const CERT_B64: &str = include_str!("../tests/fixtures/wallet/cert.der.b64");

    fn pass() -> PassContent {
        PassContent {
            serial: "6b1f0c5e-0d6c-4a43-9f43-2f1b3e0f9a10".to_owned(),
            event_id: "0a5b7c9e-1111-4222-8333-444455556666".to_owned(),
            event_name: "Arraiá São José".to_owned(),
            organization: "Escola Estadual".to_owned(),
            starts_at: datetime!(2026-11-21 19:00 -3),
            ends_at: datetime!(2026-11-21 23:30 -3),
            venue: Some("Quadra".to_owned()),
            address: Some("Rua das Flores, 120".to_owned()),
            number: "Nº 0016".to_owned(),
            holder: Some("Maria".to_owned()),
            category: Some("Meia".to_owned()),
            seat: None,
            qr_text: "II1:ABC 123%*+-./:".to_owned(),
            color: "#1a1a2e".to_owned(),
            url: "https://ingressoimpresso.com.br/ingresso#x".to_owned(),
            tokens: false,
        }
    }

    fn apple() -> AppleWallet {
        let cert = STANDARD.decode(CERT_B64.trim()).unwrap();
        AppleWallet {
            pass_type_id: "pass.test.ingressoimpresso".to_owned(),
            team_id: "ABCDE12345".to_owned(),
            intermediate: cert.clone(),
            certificate: cert,
            key: RsaKeyPair::from_pkcs8(&STANDARD.decode(KEY_B64.trim()).unwrap()).unwrap(),
        }
    }

    /// The RSA public key of the test certificate (subjectPublicKeyInfo's bit string).
    fn public_key() -> Vec<u8> {
        let cert = STANDARD.decode(CERT_B64.trim()).unwrap();
        let outer = elements(&cert).unwrap();
        let fields = elements(content(outer[0].1).unwrap()).unwrap();
        let tbs = elements(content(fields[0].1).unwrap()).unwrap();
        let spki = elements(content(tbs[6].1).unwrap()).unwrap();
        let bits = content(spki[1].1).unwrap();
        bits[1..].to_vec()
    }

    #[test]
    fn a_pkpass_carries_the_qr_and_a_valid_signature() {
        let wallet = apple();
        let bytes = wallet
            .pkpass(&pass(), datetime!(2026-10-20 12:00 UTC))
            .unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut read = |name: &str| {
            let mut out = Vec::new();
            archive
                .by_name(name)
                .unwrap()
                .read_to_end(&mut out)
                .unwrap();
            out
        };
        let pass_json: Value = serde_json::from_slice(&read("pass.json")).unwrap();
        assert_eq!(pass_json["barcodes"][0]["message"], "II1:ABC 123%*+-./:");
        assert_eq!(
            pass_json["serialNumber"],
            "6b1f0c5e-0d6c-4a43-9f43-2f1b3e0f9a10"
        );
        assert_eq!(pass_json["relevantDate"], "2026-11-21T19:00:00-03:00");
        assert_eq!(pass_json["backgroundColor"], "rgb(26, 26, 46)");
        let manifest_bytes = read("manifest.json");
        let manifest: Value = serde_json::from_slice(&manifest_bytes).unwrap();
        assert_eq!(
            manifest["icon.png"],
            hex::encode(Sha1::digest(ICON)),
            "the manifest lists every file's SHA-1"
        );

        // signature: ContentInfo → [0] SignedData → signerInfos → SignerInfo.
        let signature = read("signature");
        let info = elements(content(&signature).unwrap()).unwrap();
        let signed_data = elements(content(content(info[1].1).unwrap()).unwrap()).unwrap();
        assert_eq!(signed_data.len(), 5);
        let signer = elements(content(content(signed_data[4].1).unwrap()).unwrap()).unwrap();
        let attributes = signer[3].1;
        // The signed attributes are verified as a SET (tag 0x31).
        let mut as_set = attributes.to_vec();
        as_set[0] = 0x31;
        let rsa = content(signer[5].1).unwrap();
        UnparsedPublicKey::new(&RSA_PKCS1_2048_8192_SHA256, public_key())
            .verify(&as_set, rsa)
            .expect("the signature verifies with the certificate's key");
        // And they carry the manifest's digest.
        let digest = tlv(0x04, &sha256(&manifest_bytes));
        assert!(
            attributes
                .windows(digest.len())
                .any(|window| window == digest.as_slice())
        );
    }

    #[test]
    fn a_google_link_is_a_signed_jwt() {
        let google = GoogleWallet {
            issuer_id: "3388000000012345678".to_owned(),
            email: "wallet@projeto.iam.gserviceaccount.com".to_owned(),
            key: RsaKeyPair::from_pkcs8(&STANDARD.decode(KEY_B64.trim()).unwrap()).unwrap(),
        };
        let url = google
            .save_url(
                &pass(),
                "https://ingressoimpresso.com.br",
                datetime!(2026-10-20 12:00 UTC),
            )
            .unwrap();
        let jwt = url
            .strip_prefix("https://pay.google.com/gp/v/save/")
            .unwrap();
        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3);
        let claims: Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).unwrap()).unwrap();
        assert_eq!(claims["aud"], "google");
        let object = &claims["payload"]["eventTicketObjects"][0];
        assert_eq!(object["barcode"]["value"], "II1:ABC 123%*+-./:");
        assert_eq!(
            object["id"],
            "3388000000012345678.tk_6b1f0c5e0d6c4a439f432f1b3e0f9a10"
        );
        assert_eq!(
            object["classId"],
            claims["payload"]["eventTicketClasses"][0]["id"]
        );
        UnparsedPublicKey::new(&RSA_PKCS1_2048_8192_SHA256, public_key())
            .verify(
                format!("{}.{}", parts[0], parts[1]).as_bytes(),
                &URL_SAFE_NO_PAD.decode(parts[2]).unwrap(),
            )
            .expect("RS256 signature");
    }

    #[test]
    fn wallets_need_every_setting() {
        assert!(Wallets::from_lookup(|_| None).unwrap().apple.is_none());
        let half =
            Wallets::from_lookup(|name| (name == "APPLE_WALLET_TEAM_ID").then(|| "X".to_owned()));
        assert!(matches!(
            half,
            Err(ConfigError::Missing("APPLE_WALLET_PASS_TYPE_ID"))
        ));
        let google = Wallets::from_lookup(|name| {
            (name == "GOOGLE_WALLET_ISSUER_ID").then(|| "1".to_owned())
        });
        assert!(matches!(
            google,
            Err(ConfigError::Missing("GOOGLE_WALLET_SERVICE_ACCOUNT"))
        ));
    }
}
