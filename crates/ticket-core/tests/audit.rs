//! Tests added by the audit of format v1 (`docs/auditorias/qr-v1.md`): properties the audit
//! relied on that the existing suites did not pin down. The format and the shared vectors are
//! untouched; these tests only state what the current code already does.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

use curve25519_dalek::constants::EIGHT_TORSION;
use ed25519_dalek::{Signer, SigningKey};
use proptest::prelude::*;
use ticket_core::base45;
use ticket_core::dto::{DoorEventDto, DtoError, EventKeyDto, KeyStatusDto};
use ticket_core::{
    Decision, DecodeError, Door, DoorState, EntryInfo, EventId, EventKey, EventPublicKey,
    EventSigningKey, EventTag, EventVerifier, FORMAT_VERSION_V1, HEADER_LEN, KeyId, KeyStatus,
    PAYLOAD_LEN, PublicKeyError, QR_TEXT_LEN, Rejection, SIGNING_DOMAIN, SignedTicket,
    TicketHeader, TicketIssuer, TicketNumber,
};

/// The first bytes of the QR text encode `(version, tag[0])` as one Base45 triple whose first
/// symbol is `(256 + tag[0]) mod 45`. A space is symbol 36, so these six tag values (and only
/// these) make the text start with a space.
const SPACE_LEADING_TAG_BYTES: [u8; 6] = [5, 50, 95, 140, 185, 230];

fn number(value: u32) -> TicketNumber {
    TicketNumber::new(value).unwrap()
}

fn entry(at_unix_ms: i64, device_name: &str) -> EntryInfo {
    EntryInfo {
        at_unix_ms,
        device_name: device_name.to_owned(),
    }
}

struct Fixture {
    issuer: TicketIssuer,
    verifier: EventVerifier,
}

fn fixture(seed: [u8; 32], event_id: [u8; 16], tag: u32, key_id: u8) -> Fixture {
    let signing_key = EventSigningKey::from_seed(&seed);
    let public_key = signing_key.public_key();
    let event_id = EventId::from_bytes(event_id);
    let issuer = TicketIssuer::new(
        event_id,
        EventTag::new(tag),
        KeyId::new(key_id),
        signing_key,
    );
    let verifier = EventVerifier::new(
        event_id,
        EventTag::new(tag),
        vec![EventKey {
            key_id: KeyId::new(key_id),
            public_key,
            status: KeyStatus::Active,
        }],
    )
    .unwrap();
    Fixture { issuer, verifier }
}

/// The sample QR of previews and rehearsal sheets, rebuilt from its definition
/// (`ticket_render::sample_qr_text`: version byte 0x00, then 0xFF) rather than imported, so this
/// crate pins the constant the renderer and the door app (`SAMPLE_QR_TEXT`) agree on.
fn sample_qr_text() -> String {
    let mut payload = [0xFF; PAYLOAD_LEN];
    payload[0] = 0x00;
    base45::encode(&payload)
}

// --- Version byte and samples (audit items 6 and 10) ------------------------------------

#[test]
fn every_version_byte_but_v1_is_malformed() {
    let valid = fixture([1; 32], [2; 16], 3, 1)
        .issuer
        .issue(number(1))
        .to_bytes();
    for version in 0..=u8::MAX {
        let mut payload = valid;
        payload[0] = version;
        let result = SignedTicket::from_bytes(&payload);
        if version == FORMAT_VERSION_V1 {
            assert!(result.is_ok());
        } else {
            assert_eq!(result, Err(DecodeError::UnsupportedVersion(version)));
        }
    }
}

#[test]
fn the_sample_qr_is_the_shared_constant_and_never_a_ticket() {
    let sample = sample_qr_text();
    assert_eq!(sample, format!("U50{}", "FGW".repeat(36)));
    assert_eq!(sample.len(), QR_TEXT_LEN);
    assert_eq!(
        SignedTicket::from_qr_text(&sample),
        Err(DecodeError::UnsupportedVersion(0x00))
    );

    // Under a door whose tag and key id happen to be the sample's (0xFFFFFFFF, 0xFF), the
    // sample is still not a ticket; with its version byte forced to 1 it is a forgery.
    let door = fixture([9; 32], [8; 16], u32::MAX, u8::MAX);
    assert!(matches!(
        door.verifier.verify_qr_text(&sample),
        Err(Rejection::Malformed(DecodeError::UnsupportedVersion(0)))
    ));
    let mut forced = base45::decode(&sample).unwrap();
    forced[0] = FORMAT_VERSION_V1;
    let forced = SignedTicket::from_bytes(&forced).unwrap();
    assert_eq!(forced.header().event_tag, EventTag::new(u32::MAX));
    assert_eq!(forced.header().key_id, KeyId::new(u8::MAX));
    assert_eq!(door.verifier.verify(&forced), Err(Rejection::BadSignature));
    assert!(
        !Door::new(door.verifier.clone())
            .check_in(&forced.to_qr_text(), entry(0, "Porta 1"))
            .is_admit()
    );
}

// --- Decoder robustness (audit item 2) -----------------------------------------------------

#[test]
fn a_signed_ticket_number_zero_is_still_malformed() {
    // The issuer cannot sign number zero (`TicketNumber` is non-zero), so sign the header by
    // hand with the raw key: the decoder refuses it before any signature is checked.
    let seed = [7u8; 32];
    let event_id = EventId::from_bytes([3; 16]);
    let header = [
        FORMAT_VERSION_V1,
        0x1A,
        0x2B,
        0x3C,
        0x4D,
        0x01,
        0x00,
        0x00,
        0x00,
        0x00,
    ];
    let mut message = Vec::with_capacity(SIGNING_DOMAIN.len() + 16 + HEADER_LEN);
    message.extend_from_slice(SIGNING_DOMAIN);
    message.extend_from_slice(event_id.as_bytes());
    message.extend_from_slice(&header);
    let signature = SigningKey::from_bytes(&seed).sign(&message).to_bytes();
    let mut payload = [0u8; PAYLOAD_LEN];
    payload[..HEADER_LEN].copy_from_slice(&header);
    payload[HEADER_LEN..].copy_from_slice(&signature);
    assert_eq!(
        SignedTicket::from_bytes(&payload),
        Err(DecodeError::ZeroTicketNumber)
    );
    let door = fixture(seed, [3; 16], 0x1A2B_3C4D, 1);
    assert!(matches!(
        door.verifier.verify_qr_text(&base45::encode(&payload)),
        Err(Rejection::Malformed(DecodeError::ZeroTicketNumber))
    ));
}

#[test]
fn oversized_and_non_ascii_texts_are_malformed_without_decoding() {
    let huge = "A".repeat(1 << 20);
    assert_eq!(
        SignedTicket::from_qr_text(&huge),
        Err(DecodeError::WrongTextLength { actual: 1 << 20 })
    );
    // 109 ASCII symbols plus one two-byte character: 111 bytes, so the length check passes and
    // the alphabet check must catch it (the byte offset of the character is reported).
    let sneaky = format!("{}Á", "A".repeat(109));
    assert_eq!(sneaky.len(), QR_TEXT_LEN);
    assert_eq!(
        SignedTicket::from_qr_text(&sneaky),
        Err(DecodeError::Base45(base45::Base45Error::InvalidCharacter {
            position: 109
        }))
    );
    // Whitespace variants a scanner app might add are not tolerated by the strict decoder.
    let valid = fixture([1; 32], [2; 16], 3, 1)
        .issuer
        .issue(number(1))
        .to_qr_text();
    for text in [
        format!(" {valid}"),
        format!("{valid} "),
        format!("{valid}\r\n"),
        format!("\u{feff}{valid}"),
    ] {
        assert!(SignedTicket::from_qr_text(&text).is_err(), "{text:?}");
    }
}

// --- The leading space (audit item 2, robustness) ------------------------------------------

#[test]
fn qr_texts_start_with_a_space_for_exactly_six_tag_values_and_never_end_with_one() {
    for first_tag_byte in 0..=u8::MAX {
        let mut payload = [0xA5u8; PAYLOAD_LEN];
        payload[0] = FORMAT_VERSION_V1;
        payload[1] = first_tag_byte;
        let text = base45::encode(&payload);
        assert_eq!(
            text.starts_with(' '),
            SPACE_LEADING_TAG_BYTES.contains(&first_tag_byte),
            "tag byte {first_tag_byte}"
        );
        assert!(!text.ends_with(' '));
        // Such a text decodes as it is, and loses its ticket if any tool trims it.
        assert!(SignedTicket::from_qr_text(&text).is_ok());
        if text.starts_with(' ') {
            assert_eq!(
                SignedTicket::from_qr_text(text.trim_start()),
                Err(DecodeError::WrongTextLength {
                    actual: QR_TEXT_LEN - 1
                })
            );
        }
    }
}

// --- Public keys from the manifest (audit item 1) -------------------------------------------

#[test]
fn every_small_order_public_key_is_refused() {
    for (index, point) in EIGHT_TORSION.iter().enumerate() {
        let bytes = point.compress().to_bytes();
        assert_eq!(
            EventPublicKey::from_bytes(&bytes),
            Err(PublicKeyError::WeakKey),
            "torsion point {index}"
        );
        let dto = EventKeyDto {
            key_id: 1,
            public_key: hex::encode(bytes),
            status: KeyStatusDto::Active,
        };
        assert_eq!(
            EventKey::try_from(&dto),
            Err(DtoError::InvalidPublicKey {
                key_id: 1,
                source: PublicKeyError::WeakKey,
            })
        );
    }
    // Non-canonical encodings of small-order points (y = p + 1, and y = p with the sign bit).
    let mut identity_plus_p = [0xFFu8; 32];
    identity_plus_p[0] = 0xEE;
    identity_plus_p[31] = 0x7F;
    assert!(EventPublicKey::from_bytes(&identity_plus_p).is_err());
    let mut p_with_sign = [0xFFu8; 32];
    p_with_sign[0] = 0xED;
    assert!(EventPublicKey::from_bytes(&p_with_sign).is_err());
    // And a manifest carrying one such key cannot build a door at all.
    let dto = DoorEventDto {
        event_id: "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b".to_owned(),
        event_tag: 1,
        keys: vec![EventKeyDto {
            key_id: 1,
            public_key: hex::encode(EIGHT_TORSION[1].compress().to_bytes()),
            status: KeyStatusDto::Retired,
        }],
    };
    assert!(EventVerifier::try_from(&dto).is_err());
}

#[test]
fn a_manifest_with_an_unknown_status_or_a_bad_uuid_is_refused_without_panicking() {
    let json = serde_json::json!({
        "eventId": "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b",
        "eventTag": 1,
        "keys": [{ "keyId": 1, "publicKey": "00".repeat(32), "status": "compromised" }]
    });
    assert!(serde_json::from_value::<DoorEventDto>(json).is_err());
    let dto = DoorEventDto {
        event_id: "not-a-uuid".to_owned(),
        event_tag: 1,
        keys: Vec::new(),
    };
    assert_eq!(
        EventVerifier::try_from(&dto).err(),
        Some(DtoError::InvalidEventId)
    );
    // No keys at all: a door that refuses every ticket as unknown key, never one that admits.
    let empty = DoorEventDto {
        event_id: "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b".to_owned(),
        event_tag: 3,
        keys: Vec::new(),
    };
    let verifier = EventVerifier::try_from(&empty).unwrap();
    let ticket = fixture([1; 32], [2; 16], 3, 1).issuer.issue(number(1));
    assert_eq!(
        verifier.verify(&ticket),
        Err(Rejection::UnknownKey(KeyId::new(1)))
    );
}

// --- Door state edge cases (audit item 5) -----------------------------------------------------

#[test]
fn extreme_clocks_and_names_never_break_the_first_entry_rule() {
    let mut state = DoorState::new();
    assert!(state.record_entry(number(1), entry(i64::MAX, "Porta Z")));
    assert!(state.record_entry(number(1), entry(i64::MIN, "Porta A")));
    assert!(!state.record_entry(number(1), entry(i64::MIN, "Porta B")));
    assert_eq!(
        state.entry_for(number(1)),
        Some(&entry(i64::MIN, "Porta A"))
    );
    assert!(!state.record_entry(number(1), entry(0, "")));
    assert_eq!(state.entry_count(), 1);
    assert!(matches!(
        state.decide(Ok(fixture([1; 32], [2; 16], 3, 1)
            .verifier
            .verify(&fixture([1; 32], [2; 16], 3, 1).issuer.issue(number(1)))
            .unwrap())),
        Decision::AlreadyEntered { .. }
    ));
}

#[test]
fn key_ids_cover_the_whole_byte_and_the_header_binds_them() {
    // 256 generations are representable; a ticket of generation N never verifies as N+1 even
    // when both ids share the same public key (the key id is part of the signed message).
    let seed = [4u8; 32];
    let public_key = EventSigningKey::from_seed(&seed).public_key();
    let event_id = EventId::from_bytes([5; 16]);
    let keys: Vec<EventKey> = (0..=u8::MAX)
        .map(|key_id| EventKey {
            key_id: KeyId::new(key_id),
            public_key,
            status: KeyStatus::Active,
        })
        .collect();
    let verifier = EventVerifier::new(event_id, EventTag::new(6), keys).unwrap();
    for key_id in [0u8, 1, 127, 255] {
        let issuer = TicketIssuer::new(
            event_id,
            EventTag::new(6),
            KeyId::new(key_id),
            EventSigningKey::from_seed(&seed),
        );
        let ticket = issuer.issue(number(10));
        assert_eq!(
            verifier.verify(&ticket).unwrap().key_id(),
            KeyId::new(key_id)
        );
        let other = SignedTicket::from_parts(
            TicketHeader {
                key_id: KeyId::new(key_id.wrapping_add(1)),
                ..*ticket.header()
            },
            *ticket.signature(),
        );
        assert_eq!(verifier.verify(&other), Err(Rejection::BadSignature));
    }
}

// --- Properties (audit items 1 and 2) --------------------------------------------------------

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    /// Any change to any bytes of a genuine payload (not only one bit) is rejected.
    #[test]
    fn any_byte_mutation_is_rejected(
        seed in any::<[u8; 32]>(),
        event_id in any::<[u8; 16]>(),
        tag in any::<u32>(),
        value in 1..=u32::MAX,
        mask in proptest::collection::vec(any::<u8>(), PAYLOAD_LEN),
    ) {
        prop_assume!(mask.iter().any(|byte| *byte != 0));
        let door = fixture(seed, event_id, tag, 1);
        let genuine = door.issuer.issue(number(value)).to_bytes();
        let mut mutated = genuine;
        for (byte, flip) in mutated.iter_mut().zip(&mask) {
            *byte ^= flip;
        }
        let result = SignedTicket::from_bytes(&mutated)
            .map_err(Rejection::from)
            .and_then(|ticket| door.verifier.verify(&ticket));
        prop_assert!(result.is_err());
    }

    /// Whatever the door knows, arbitrary text never gets in, and genuine tickets of another
    /// event are told apart from forgeries only by their tag.
    #[test]
    fn arbitrary_text_is_never_admitted(
        seed in any::<[u8; 32]>(),
        event_id in any::<[u8; 16]>(),
        tag in any::<u32>(),
        text in any::<String>(),
        voids in proptest::collection::vec((1u32..100, 0u32..10), 0..4),
    ) {
        let door = fixture(seed, event_id, tag, 1);
        let mut door_state = Door::new(door.verifier.clone());
        door_state.state_mut().replace_voids(
            voids
                .iter()
                .map(|&(first, len)| {
                    ticket_core::VoidRange::new(number(first), number(first + len), ticket_core::VoidReason::Lost).unwrap()
                })
                .collect(),
        );
        let decision = door_state.check_in(&text, entry(0, "Porta 1"));
        prop_assert!(!decision.is_admit());
        prop_assert_eq!(door_state.state().entry_count(), 0);
    }

    /// Base45 of a long random payload never panics and round-trips (lengths well past a QR).
    #[test]
    fn long_payloads_round_trip(bytes in proptest::collection::vec(any::<u8>(), 0..4096)) {
        let text = base45::encode(&bytes);
        prop_assert_eq!(text.len(), base45::encoded_len(bytes.len()));
        prop_assert_eq!(base45::decode(&text).unwrap(), bytes);
    }
}
