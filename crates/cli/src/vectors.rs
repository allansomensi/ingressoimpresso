//! Shared test vectors for ticket format v1 (`testdata/vectors/ticket-v1.json`).
//!
//! The vectors are a **specification**, not a snapshot: every expected decision below is written
//! by hand. The Rust core (`crates/ticket-core/tests/vectors.rs`) and the WebAssembly build
//! (`packages/ticket-core-wasm/test/vectors.test.ts`) must both agree with it.
//!
//! Generation is deterministic: seeds derive from fixed labels and Ed25519 signatures are
//! deterministic (RFC 8032), so regenerating yields byte-identical output. The seeds are
//! **test-only** and published on purpose.

use anyhow::{Context, Result, anyhow};
use curve25519_dalek::Scalar;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use ticket_core::dto::{
    DecisionDto, DoorEventDto, EntryDto, EventKeyDto, FirstEntryDto, InvalidReasonDto,
    VoidRangeDto, VoidReasonDto,
};
use ticket_core::{
    EventId, EventKey, EventSigningKey, EventTag, KeyId, KeyStatus, SignedTicket, TicketHeader,
    TicketIssuer, TicketNumber, base45,
};

/// Value of [`VectorsFile::format`].
pub const FORMAT: &str = "ingressoimpresso-ticket-vectors";

/// Root of the vectors file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct VectorsFile {
    /// Always [`FORMAT`].
    pub format: String,
    /// Ticket format version covered by these vectors.
    pub ticket_format_version: u8,
    /// Human notice.
    pub notice: String,
    /// Events used by the vectors.
    pub events: Vec<VectorEvent>,
    /// Tickets that the issuer must reproduce byte for byte.
    pub issued: Vec<IssuedVector>,
    /// Door decisions.
    pub cases: Vec<DecisionCase>,
}

/// One event with its test-only private seeds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct VectorEvent {
    /// Name referenced by issued vectors and cases.
    pub name: String,
    /// What a door device receives for this event.
    pub door: DoorEventDto,
    /// Test-only private seeds, one per key.
    pub seeds: Vec<VectorSeed>,
}

/// Test-only private seed of one key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct VectorSeed {
    /// Key generation.
    pub key_id: u8,
    /// 32-byte RFC 8032 secret key, hex.
    pub seed: String,
}

/// A ticket the issuer must reproduce exactly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct IssuedVector {
    /// Event name.
    pub event: String,
    /// Key generation used.
    pub key_id: u8,
    /// Ticket number.
    pub number: u32,
    /// 74-byte payload, hex.
    pub payload_hex: String,
    /// QR text (Base45 of the payload).
    pub qr_text: String,
}

/// A door decision: given an event, door state and scanned text, the expected outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct DecisionCase {
    /// Unique case name.
    pub name: String,
    /// What the case demonstrates.
    pub description: String,
    /// Event name of the door.
    pub door_event: String,
    /// Voided ranges known by the door.
    pub voids: Vec<VoidRangeDto>,
    /// Entries known by the door.
    pub entries: Vec<EntryDto>,
    /// Scanned text.
    pub qr_text: String,
    /// Expected decision.
    pub expected: DecisionDto,
}

/// Ed25519 group order L, little-endian (used to build a non-canonical `S`).
const GROUP_ORDER: [u8; 32] = [
    0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
];

const PRIMARY: &str = "primary";
const OTHER: &str = "other";
const TAG_COLLISION: &str = "tag-collision";
const PRIMARY_TAG: u32 = 0x1A2B_3C4D;
const OTHER_TAG: u32 = 0x0BAD_F00D;
/// 2026-01-01T00:00:00Z.
const ENTRY_TIME: i64 = 1_767_225_600_000;

struct EventSpec {
    name: &'static str,
    event_id: &'static str,
    tag: u32,
    keys: &'static [(u8, KeyStatus)],
}

const EVENTS: &[EventSpec] = &[
    EventSpec {
        name: PRIMARY,
        event_id: "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b",
        tag: PRIMARY_TAG,
        keys: &[
            (1, KeyStatus::Active),
            (2, KeyStatus::Retired),
            (3, KeyStatus::Revoked),
        ],
    },
    EventSpec {
        name: OTHER,
        event_id: "0d9b8a7c-6e5f-4a3b-9c2d-1e0f2a3b4c5d",
        tag: OTHER_TAG,
        keys: &[(1, KeyStatus::Active)],
    },
    EventSpec {
        name: TAG_COLLISION,
        event_id: "c4a1e2f3-5b6c-4d7e-8f90-a1b2c3d4e5f6",
        tag: PRIMARY_TAG,
        keys: &[(1, KeyStatus::Active)],
    },
];

const ISSUED: &[(&str, u8, u32)] = &[
    (PRIMARY, 1, 1),
    (PRIMARY, 1, 2),
    (PRIMARY, 1, 42),
    (PRIMARY, 1, 999),
    (PRIMARY, 1, u32::MAX),
    (PRIMARY, 2, 7),
    (PRIMARY, 3, 8),
    (OTHER, 1, 1),
    (TAG_COLLISION, 1, 42),
];

/// Builds the vectors file.
///
/// # Errors
///
/// Fails only if the hard-coded specification is inconsistent (a bug in this module).
pub fn generate() -> Result<VectorsFile> {
    let events = EVENTS.iter().map(vector_event).collect();
    let issued = ISSUED
        .iter()
        .map(|&(event, key_id, number)| {
            let ticket = issue(event, key_id, number)?;
            Ok(IssuedVector {
                event: event.to_owned(),
                key_id,
                number,
                payload_hex: hex::encode(ticket.to_bytes()),
                qr_text: ticket.to_qr_text(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(VectorsFile {
        format: FORMAT.to_owned(),
        ticket_format_version: ticket_core::FORMAT_VERSION_V1,
        notice: "Generated by `just vectors` from crates/cli/src/vectors.rs. Do not edit by hand. \
                 Seeds are TEST-ONLY and published on purpose."
            .to_owned(),
        events,
        issued,
        cases: cases()?,
    })
}

/// Serializes the file exactly as committed (pretty JSON, trailing newline).
///
/// # Errors
///
/// Fails only if serialization fails.
pub fn to_json(file: &VectorsFile) -> Result<String> {
    let mut json = serde_json::to_string_pretty(file).context("serializing vectors")?;
    json.push('\n');
    Ok(json)
}

/// Test-only seed of a key: SHA-256 of a fixed label.
fn seed(event: &str, key_id: u8) -> [u8; 32] {
    Sha256::digest(format!(
        "ingressoimpresso/test-vectors/v1/{event}/key-{key_id}"
    ))
    .into()
}

fn number(value: u32) -> Result<TicketNumber> {
    TicketNumber::new(value).ok_or_else(|| anyhow!("ticket number zero in vector spec"))
}

fn spec(name: &str) -> Result<&'static EventSpec> {
    EVENTS
        .iter()
        .find(|spec| spec.name == name)
        .ok_or_else(|| anyhow!("unknown vector event {name}"))
}

fn vector_event(spec: &EventSpec) -> VectorEvent {
    let keys = spec
        .keys
        .iter()
        .map(|&(key_id, status)| {
            EventKeyDto::from(&EventKey {
                key_id: KeyId::new(key_id),
                public_key: EventSigningKey::from_seed(&seed(spec.name, key_id)).public_key(),
                status,
            })
        })
        .collect();
    let seeds = spec
        .keys
        .iter()
        .map(|&(key_id, _)| VectorSeed {
            key_id,
            seed: hex::encode(seed(spec.name, key_id)),
        })
        .collect();
    VectorEvent {
        name: spec.name.to_owned(),
        door: DoorEventDto {
            event_id: spec.event_id.to_owned(),
            event_tag: spec.tag,
            keys,
        },
        seeds,
    }
}

fn issue(event: &str, key_id: u8, value: u32) -> Result<SignedTicket> {
    let spec = spec(event)?;
    let event_id: EventId = spec.event_id.parse().context("vector event id")?;
    let issuer = TicketIssuer::new(
        event_id,
        EventTag::new(spec.tag),
        KeyId::new(key_id),
        EventSigningKey::from_seed(&seed(event, key_id)),
    );
    Ok(issuer.issue(number(value)?))
}

fn text(event: &str, key_id: u8, value: u32) -> Result<String> {
    Ok(issue(event, key_id, value)?.to_qr_text())
}

#[allow(
    clippy::too_many_lines,
    reason = "a flat, readable list of specification cases"
)]
fn cases() -> Result<Vec<DecisionCase>> {
    let valid = issue(PRIMARY, 1, 1)?;
    let valid_text = valid.to_qr_text();
    let valid_bytes = valid.to_bytes();

    let admit = |value: u32| DecisionDto::Admit { number: value };
    let invalid = |reason: InvalidReasonDto| DecisionDto::Invalid { reason };
    let entry = |value: u32, device: &str| EntryDto {
        number: value,
        at_unix_ms: ENTRY_TIME,
        device_name: device.to_owned(),
    };
    let void = |first: u32, last: u32, reason: VoidReasonDto| VoidRangeDto {
        first,
        last,
        reason,
    };

    let mut flipped_signature = valid_bytes;
    if let Some(last) = flipped_signature.last_mut() {
        *last ^= 0x01;
    }
    let altered_number = SignedTicket::from_parts(
        TicketHeader {
            number: number(2)?,
            ..*valid.header()
        },
        *valid.signature(),
    );
    let unknown_key = with_key_id(&valid, 9);
    let mut unsupported_version = valid_bytes;
    unsupported_version[0] = 0x02;
    let mut zero_number = valid_bytes;
    zero_number[6..10].copy_from_slice(&[0; 4]);

    let mut cases = vec![
        case(
            "admit-active-key",
            "Authentic ticket signed with the active key, nothing known yet.",
            PRIMARY,
            &valid_text,
            admit(1),
        ),
        case(
            "admit-max-number",
            "Largest representable ticket number.",
            PRIMARY,
            &text(PRIMARY, 1, u32::MAX)?,
            admit(u32::MAX),
        ),
        case(
            "admit-retired-key",
            "Retired keys no longer sign but their tickets stay valid.",
            PRIMARY,
            &text(PRIMARY, 2, 7)?,
            admit(7),
        ),
        case(
            "revoked-key",
            "Tickets of a revoked key are rejected.",
            PRIMARY,
            &text(PRIMARY, 3, 8)?,
            invalid(InvalidReasonDto::RevokedKey),
        ),
        DecisionCase {
            entries: vec![entry(42, "Porta 1")],
            ..case(
                "already-entered",
                "A copy of a ticket that already entered is blocked and shows the first entry.",
                PRIMARY,
                &text(PRIMARY, 1, 42)?,
                DecisionDto::AlreadyEntered {
                    number: 42,
                    first_entry: FirstEntryDto {
                        at_unix_ms: ENTRY_TIME,
                        device_name: "Porta 1".to_owned(),
                    },
                },
            )
        },
        DecisionCase {
            entries: vec![entry(2, "Porta 1"), entry(42, "Porta 2")],
            ..case(
                "other-entries-do-not-matter",
                "Entries of other numbers do not affect this ticket.",
                PRIMARY,
                &valid_text,
                admit(1),
            )
        },
        DecisionCase {
            voids: vec![void(2, 10, VoidReasonDto::Unsold)],
            ..case(
                "voided-unsold",
                "A ticket in a range returned unsold is blocked.",
                PRIMARY,
                &text(PRIMARY, 1, 2)?,
                DecisionDto::Voided {
                    number: 2,
                    reason: VoidReasonDto::Unsold,
                },
            )
        },
        DecisionCase {
            voids: vec![void(1, 5, VoidReasonDto::Lost)],
            entries: vec![entry(2, "Porta 1")],
            ..case(
                "void-precedes-entry",
                "When a ticket is both voided and entered, the void is shown.",
                PRIMARY,
                &text(PRIMARY, 1, 2)?,
                DecisionDto::Voided {
                    number: 2,
                    reason: VoidReasonDto::Lost,
                },
            )
        },
        DecisionCase {
            voids: vec![
                void(1, 998, VoidReasonDto::Unsold),
                void(1000, 2000, VoidReasonDto::Lost),
            ],
            ..case(
                "void-range-boundaries",
                "Void ranges are inclusive and do not leak past their bounds.",
                PRIMARY,
                &text(PRIMARY, 1, 999)?,
                admit(999),
            )
        },
        DecisionCase {
            voids: vec![void(999, 999, VoidReasonDto::Revoked)],
            ..case(
                "single-number-void",
                "A one-number void range.",
                PRIMARY,
                &text(PRIMARY, 1, 999)?,
                DecisionDto::Voided {
                    number: 999,
                    reason: VoidReasonDto::Revoked,
                },
            )
        },
        DecisionCase {
            voids: vec![
                void(1, 10, VoidReasonDto::Lost),
                void(2, 3, VoidReasonDto::Unsold),
            ],
            ..case(
                "first-overlapping-void-wins",
                "With overlapping voids, the first in the list gives the reason.",
                PRIMARY,
                &text(PRIMARY, 1, 2)?,
                DecisionDto::Voided {
                    number: 2,
                    reason: VoidReasonDto::Lost,
                },
            )
        },
        case(
            "other-event",
            "A genuine ticket of another event.",
            PRIMARY,
            &text(OTHER, 1, 1)?,
            DecisionDto::OtherEvent {
                event_tag: OTHER_TAG,
            },
        ),
        case(
            "other-event-reverse",
            "The primary event's ticket at the other event's door.",
            OTHER,
            &valid_text,
            DecisionDto::OtherEvent {
                event_tag: PRIMARY_TAG,
            },
        ),
        case(
            "tag-collision",
            "Same tag, different event UUID: the signature binds the full event id.",
            PRIMARY,
            &text(TAG_COLLISION, 1, 42)?,
            invalid(InvalidReasonDto::BadSignature),
        ),
        case(
            "flipped-signature-bit",
            "One bit of the signature changed.",
            PRIMARY,
            &base45::encode(&flipped_signature),
            invalid(InvalidReasonDto::BadSignature),
        ),
        case(
            "altered-number",
            "The number was edited, the signature kept.",
            PRIMARY,
            &altered_number.to_qr_text(),
            invalid(InvalidReasonDto::BadSignature),
        ),
        case(
            "unknown-key",
            "Key id not present in the event.",
            PRIMARY,
            &unknown_key.to_qr_text(),
            invalid(InvalidReasonDto::UnknownKey),
        ),
        case(
            "non-canonical-signature",
            "S + L (same scalar, non-canonical encoding): malleated signatures are rejected.",
            PRIMARY,
            &non_canonical(&valid).to_qr_text(),
            invalid(InvalidReasonDto::BadSignature),
        ),
        case(
            "small-order-r",
            "R is the identity point: the plain verification equation holds, verify_strict rejects it.",
            PRIMARY,
            &small_order_r(&valid)?.to_qr_text(),
            invalid(InvalidReasonDto::BadSignature),
        ),
        case(
            "other-event-before-unknown-key",
            "The tag is checked before the key: another event's ticket with a key id this door lacks.",
            PRIMARY,
            &with_key_id(&issue(OTHER, 1, 1)?, 9).to_qr_text(),
            DecisionDto::OtherEvent {
                event_tag: OTHER_TAG,
            },
        ),
        case(
            "other-event-before-revoked-key",
            "The tag is checked before the key: another event's ticket with a key id revoked here.",
            PRIMARY,
            &with_key_id(&issue(OTHER, 1, 1)?, 3).to_qr_text(),
            DecisionDto::OtherEvent {
                event_tag: OTHER_TAG,
            },
        ),
        case(
            "unsupported-version",
            "Version byte 0x02 is not understood by v1 readers.",
            PRIMARY,
            &base45::encode(&unsupported_version),
            invalid(InvalidReasonDto::Malformed),
        ),
        case(
            "zero-number",
            "Number zero is never issued.",
            PRIMARY,
            &base45::encode(&zero_number),
            invalid(InvalidReasonDto::Malformed),
        ),
        case(
            "truncated",
            "One character missing.",
            PRIMARY,
            valid_text.get(..110).unwrap_or_default(),
            invalid(InvalidReasonDto::Malformed),
        ),
        case(
            "trailing-newline",
            "No trimming: extra whitespace is malformed.",
            PRIMARY,
            &format!("{valid_text}\n"),
            invalid(InvalidReasonDto::Malformed),
        ),
        case(
            "lowercase",
            "No case folding: Base45 is uppercase only.",
            PRIMARY,
            &valid_text.to_lowercase(),
            invalid(InvalidReasonDto::Malformed),
        ),
        case(
            "base45-out-of-range",
            "A Base45 triple above 65535.",
            PRIMARY,
            &format!("GGW{}", valid_text.get(3..).unwrap_or_default()),
            invalid(InvalidReasonDto::Malformed),
        ),
        case(
            "empty",
            "Empty scan.",
            PRIMARY,
            "",
            invalid(InvalidReasonDto::Malformed),
        ),
        case(
            "foreign-qr",
            "Another QR on the ticket art (e.g. the band's Instagram).",
            PRIMARY,
            "https://instagram.com/minhabanda",
            invalid(InvalidReasonDto::Malformed),
        ),
    ];
    // Keep the file stable and easy to diff.
    cases.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(cases)
}

fn case(
    name: &str,
    description: &str,
    door_event: &str,
    qr_text: &str,
    expected: DecisionDto,
) -> DecisionCase {
    DecisionCase {
        name: name.to_owned(),
        description: description.to_owned(),
        door_event: door_event.to_owned(),
        voids: Vec::new(),
        entries: Vec::new(),
        qr_text: qr_text.to_owned(),
        expected,
    }
}

/// Returns the ticket with `S` replaced by `S + L` (same value mod L, non-canonical encoding).
fn non_canonical(ticket: &SignedTicket) -> SignedTicket {
    let mut signature = *ticket.signature();
    let mut carry = 0u16;
    for (byte, order) in signature.iter_mut().skip(32).zip(GROUP_ORDER) {
        let sum = u16::from(*byte) + u16::from(order) + carry;
        let [low, high] = sum.to_le_bytes();
        *byte = low;
        carry = u16::from(high);
    }
    SignedTicket::from_parts(*ticket.header(), signature)
}

/// Returns the ticket with its key id replaced (signature kept, so it no longer verifies).
fn with_key_id(ticket: &SignedTicket, key_id: u8) -> SignedTicket {
    SignedTicket::from_parts(
        TicketHeader {
            key_id: KeyId::new(key_id),
            ..*ticket.header()
        },
        *ticket.signature(),
    )
}

/// Re-signs `ticket` (primary event, key 1) with `R` = identity and `S = k·a mod L`.
///
/// `[S]B = R + [k]A` still holds, so a non-strict verifier accepts it; `verify_strict` rejects
/// small-order `R`. Built from the RFC 8032 equations with the test-only seed.
fn small_order_r(ticket: &SignedTicket) -> Result<SignedTicket> {
    let spec = spec(PRIMARY)?;
    let event_id: EventId = spec.event_id.parse().context("vector event id")?;
    let key_seed = seed(PRIMARY, ticket.header().key_id.get());
    let public_key = EventSigningKey::from_seed(&key_seed)
        .public_key()
        .to_bytes();

    let expanded: [u8; 64] = Sha512::digest(key_seed).into();
    let mut clamped = [0u8; 32];
    clamped.copy_from_slice(&expanded[..32]);
    clamped[0] &= 0b1111_1000;
    clamped[31] &= 0b0111_1111;
    clamped[31] |= 0b0100_0000;
    let secret_scalar = Scalar::from_bytes_mod_order(clamped);

    let mut identity = [0u8; 32];
    identity[0] = 1;
    let challenge: [u8; 64] = Sha512::new()
        .chain_update(identity)
        .chain_update(public_key)
        .chain_update(ticket_core::SIGNING_DOMAIN)
        .chain_update(event_id.as_bytes())
        .chain_update(ticket.header().to_bytes())
        .finalize()
        .into();
    let s = Scalar::from_bytes_mod_order_wide(&challenge) * secret_scalar;

    let mut signature = [0u8; 64];
    signature[..32].copy_from_slice(&identity);
    signature[32..].copy_from_slice(&s.to_bytes());
    Ok(SignedTicket::from_parts(*ticket.header(), signature))
}
