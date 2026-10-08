//! Property tests for the ticket format and its verification.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

use proptest::prelude::*;
use ticket_core::base45;
use ticket_core::{
    Decision, DecodeError, DoorState, EntryInfo, EventId, EventKey, EventSigningKey, EventTag,
    EventVerifier, KeyId, KeyStatus, QR_TEXT_LEN, Rejection, SignedTicket, TicketHeader,
    TicketIssuer, TicketNumber, VoidRange, VoidReason,
};

fn number() -> impl Strategy<Value = TicketNumber> {
    (1..=u32::MAX).prop_map(|value| TicketNumber::new(value).unwrap())
}

fn header() -> impl Strategy<Value = TicketHeader> {
    (any::<u32>(), any::<u8>(), number()).prop_map(|(tag, key_id, number)| TicketHeader {
        event_tag: EventTag::new(tag),
        key_id: KeyId::new(key_id),
        number,
    })
}

#[derive(Debug)]
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

fn fixture_strategy() -> impl Strategy<Value = Fixture> {
    (
        any::<[u8; 32]>(),
        any::<[u8; 16]>(),
        any::<u32>(),
        any::<u8>(),
    )
        .prop_map(|(seed, event_id, tag, key_id)| fixture(seed, event_id, tag, key_id))
}

fn is_base45_symbol(c: char) -> bool {
    c.is_ascii_digit() || c.is_ascii_uppercase() || " $%*+-./:".contains(c)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    #[test]
    fn base45_round_trips(bytes in proptest::collection::vec(any::<u8>(), 0..256)) {
        let text = base45::encode(&bytes);
        prop_assert!(text.chars().all(is_base45_symbol));
        prop_assert_eq!(base45::decode(&text).unwrap(), bytes);
    }

    #[test]
    fn base45_is_canonical(text in "[0-9A-Z $%*+\\-./:]{0,64}") {
        if let Ok(bytes) = base45::decode(&text) {
            prop_assert_eq!(base45::encode(&bytes), text);
        }
    }

    #[test]
    fn base45_never_panics(text in any::<String>()) {
        let _ = base45::decode(&text);
    }

    #[test]
    fn payload_round_trips(header in header(), signature in any::<[u8; 64]>()) {
        let ticket = SignedTicket::from_parts(header, signature);
        let text = ticket.to_qr_text();
        prop_assert_eq!(text.len(), QR_TEXT_LEN);
        prop_assert!(text.chars().all(is_base45_symbol));
        prop_assert_eq!(SignedTicket::from_qr_text(&text).unwrap(), ticket.clone());
        prop_assert_eq!(SignedTicket::from_bytes(&ticket.to_bytes()).unwrap(), ticket);
    }

    #[test]
    fn decoding_arbitrary_text_never_panics(text in any::<String>()) {
        let _ = SignedTicket::from_qr_text(&text);
    }

    /// Random alphabet strings almost never decode as Base45 (each triple fits in u16 with
    /// p ≈ 0.72, so 37 triples with p ≈ 5e-6). Build valid Base45 instead, so the payload checks
    /// behind the decoder are reached for arbitrary headers.
    #[test]
    fn decoding_valid_base45_payloads_is_exact(
        mut bytes in any::<[u8; 74]>(),
        force_v1 in any::<bool>(),
        zero_number in proptest::bool::weighted(0.2),
    ) {
        if force_v1 {
            bytes[0] = 0x01;
        }
        if zero_number {
            bytes[6..10].copy_from_slice(&[0; 4]);
        }
        let text = base45::encode(&bytes);
        prop_assert_eq!(text.len(), QR_TEXT_LEN);
        match SignedTicket::from_qr_text(&text) {
            Ok(ticket) => prop_assert_eq!(ticket.to_bytes(), bytes),
            Err(DecodeError::UnsupportedVersion(version)) => {
                prop_assert_eq!(version, bytes[0]);
                prop_assert_ne!(version, 0x01);
            }
            Err(DecodeError::ZeroTicketNumber) => {
                prop_assert_eq!(bytes[0], 0x01);
                prop_assert_eq!(&bytes[6..10], &[0u8; 4]);
            }
            Err(other) => prop_assert!(false, "unexpected error {:?}", other),
        }
    }

    #[test]
    fn issued_tickets_verify(fixture in fixture_strategy(), number in number()) {
        let ticket = fixture.issuer.issue(number);
        let verified = fixture.verifier.verify_qr_text(&ticket.to_qr_text()).unwrap();
        prop_assert_eq!(verified.number(), number);
    }

    #[test]
    fn any_single_bit_flip_is_rejected(
        fixture in fixture_strategy(),
        number in number(),
        bit in 0usize..(74 * 8),
    ) {
        let mut payload = fixture.issuer.issue(number).to_bytes();
        payload[bit / 8] ^= 1 << (bit % 8);
        let result = SignedTicket::from_bytes(&payload)
            .map_err(Rejection::from)
            .and_then(|ticket| fixture.verifier.verify(&ticket));
        prop_assert!(result.is_err(), "bit {} flip was accepted", bit);
    }

    #[test]
    fn signatures_are_bound_to_the_full_event_id(
        seed in any::<[u8; 32]>(),
        event_a in any::<[u8; 16]>(),
        event_b in any::<[u8; 16]>(),
        tag in any::<u32>(),
        number in number(),
    ) {
        prop_assume!(event_a != event_b);
        // Same key and same tag (a tag collision), different event UUID.
        let issued = fixture(seed, event_a, tag, 1).issuer.issue(number);
        let other = fixture(seed, event_b, tag, 1);
        prop_assert_eq!(other.verifier.verify(&issued), Err(Rejection::BadSignature));
    }

    #[test]
    fn signatures_are_bound_to_the_key(
        seed_a in any::<[u8; 32]>(),
        seed_b in any::<[u8; 32]>(),
        event_id in any::<[u8; 16]>(),
        number in number(),
    ) {
        prop_assume!(seed_a != seed_b);
        let issued = fixture(seed_a, event_id, 7, 1).issuer.issue(number);
        let other = fixture(seed_b, event_id, 7, 1);
        prop_assert_eq!(other.verifier.verify(&issued), Err(Rejection::BadSignature));
    }

    #[test]
    fn verification_of_arbitrary_text_never_panics(fixture in fixture_strategy(), text in any::<String>()) {
        let _ = fixture.verifier.verify_qr_text(&text);
    }

    #[test]
    fn void_lookup_matches_naive_model(
        ranges in proptest::collection::vec((1u32..200, 0u32..50), 0..8),
        probe in 1u32..260,
    ) {
        let voids: Vec<VoidRange> = ranges
            .iter()
            .map(|&(first, len)| {
                VoidRange::new(
                    TicketNumber::new(first).unwrap(),
                    TicketNumber::new(first + len).unwrap(),
                    VoidReason::Lost,
                )
                .unwrap()
            })
            .collect();
        let mut state = DoorState::new();
        state.replace_voids(voids);
        let expected = ranges.iter().any(|&(first, len)| first <= probe && probe <= first + len);
        prop_assert_eq!(state.void_for(TicketNumber::new(probe).unwrap()).is_some(), expected);
    }

    #[test]
    fn entries_converge_in_any_order(
        entries in proptest::collection::vec((1u32..20, 0i64..1_000, 0u8..4), 0..32),
    ) {
        let to_info = |&(_, at, device): &(u32, i64, u8)| EntryInfo {
            at_unix_ms: at,
            device_name: format!("Porta {device}"),
        };
        let mut forward = DoorState::new();
        for entry in &entries {
            forward.record_entry(TicketNumber::new(entry.0).unwrap(), to_info(entry));
        }
        let mut backward = DoorState::new();
        for entry in entries.iter().rev() {
            backward.record_entry(TicketNumber::new(entry.0).unwrap(), to_info(entry));
        }
        prop_assert_eq!(&forward, &backward);
        for entry in &entries {
            let first = forward.entry_for(TicketNumber::new(entry.0).unwrap()).unwrap();
            prop_assert!(first.at_unix_ms <= entry.1);
        }
    }

    #[test]
    fn check_in_admits_each_ticket_at_most_once(
        fixture in fixture_strategy(),
        numbers in proptest::collection::vec(1u32..30, 1..40),
    ) {
        let mut door = ticket_core::Door::new(fixture.verifier.clone());
        let mut admitted = std::collections::HashSet::new();
        for (index, value) in numbers.iter().enumerate() {
            let number = TicketNumber::new(*value).unwrap();
            let text = fixture.issuer.issue(number).to_qr_text();
            let entry = EntryInfo { at_unix_ms: i64::try_from(index).unwrap(), device_name: "Porta 1".to_owned() };
            match door.check_in(&text, entry) {
                Decision::Admit { number: admitted_number } => {
                    prop_assert_eq!(admitted_number, number);
                    prop_assert!(admitted.insert(*value), "ticket {} admitted twice", value);
                }
                Decision::AlreadyEntered { number: seen, .. } => {
                    prop_assert_eq!(seen, number);
                    prop_assert!(admitted.contains(value));
                }
                other => prop_assert!(false, "unexpected decision {:?}", other),
            }
        }
    }
}

#[test]
fn non_canonical_signature_scalar_is_rejected() {
    // S + L is the same scalar mod L with a non-canonical encoding (malleability). ed25519-dalek
    // rejects it in both verify paths unless `legacy_compatibility` is enabled, so this guards
    // against that feature. The small-order-R vector is what pins `verify_strict` itself.
    const L: [u8; 32] = [
        0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde,
        0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x10,
    ];
    let fixture = fixture([3; 32], [4; 16], 5, 1);
    let ticket = fixture.issuer.issue(TicketNumber::new(42).unwrap());
    let mut signature = *ticket.signature();
    let mut carry = 0u16;
    for (byte, l) in signature[32..].iter_mut().zip(L) {
        let sum = u16::from(*byte) + u16::from(l) + carry;
        *byte = u8::try_from(sum & 0xff).unwrap();
        carry = sum >> 8;
    }
    assert_eq!(carry, 0, "S + L must still fit in 32 bytes");
    let malleated = SignedTicket::from_parts(*ticket.header(), signature);
    assert_eq!(
        fixture.verifier.verify(&malleated),
        Err(Rejection::BadSignature)
    );
}

#[test]
fn revoked_and_unknown_keys_are_rejected_before_signature_check() {
    let signing_key = EventSigningKey::from_seed(&[9; 32]);
    let public_key = signing_key.public_key();
    let event_id = EventId::from_bytes([1; 16]);
    let issuer = TicketIssuer::new(event_id, EventTag::new(1), KeyId::new(2), signing_key);
    let ticket = issuer.issue(TicketNumber::new(1).unwrap());

    let revoked = EventVerifier::new(
        event_id,
        EventTag::new(1),
        vec![EventKey {
            key_id: KeyId::new(2),
            public_key,
            status: KeyStatus::Revoked,
        }],
    )
    .unwrap();
    assert_eq!(
        revoked.verify(&ticket),
        Err(Rejection::RevokedKey(KeyId::new(2)))
    );

    let retired = EventVerifier::new(
        event_id,
        EventTag::new(1),
        vec![EventKey {
            key_id: KeyId::new(2),
            public_key,
            status: KeyStatus::Retired,
        }],
    )
    .unwrap();
    assert!(retired.verify(&ticket).is_ok());

    let unknown = EventVerifier::new(
        event_id,
        EventTag::new(1),
        vec![EventKey {
            key_id: KeyId::new(1),
            public_key,
            status: KeyStatus::Active,
        }],
    )
    .unwrap();
    assert_eq!(
        unknown.verify(&ticket),
        Err(Rejection::UnknownKey(KeyId::new(2)))
    );
}

#[test]
fn duplicate_key_ids_are_rejected() {
    let public_key = EventSigningKey::from_seed(&[1; 32]).public_key();
    let key = EventKey {
        key_id: KeyId::new(1),
        public_key,
        status: KeyStatus::Active,
    };
    assert!(
        EventVerifier::new(
            EventId::from_bytes([0; 16]),
            EventTag::new(0),
            vec![key, key]
        )
        .is_err()
    );
}

#[test]
fn malformed_text_is_reported_as_malformed() {
    let fixture = fixture([1; 32], [2; 16], 3, 1);
    assert_eq!(
        fixture
            .verifier
            .verify_qr_text("https://instagram.com/banda"),
        Err(Rejection::Malformed(DecodeError::WrongTextLength {
            actual: 27
        }))
    );
}

fn door_with_voids(fixture: &Fixture, voids: Vec<VoidRange>) -> ticket_core::Door {
    let mut door = ticket_core::Door::new(fixture.verifier.clone());
    door.state_mut().replace_voids(voids);
    door
}

fn at(at_unix_ms: i64, device_name: &str) -> EntryInfo {
    EntryInfo {
        at_unix_ms,
        device_name: device_name.to_owned(),
    }
}

#[test]
fn check_in_never_records_voided_tickets() {
    let fixture = fixture([5; 32], [6; 16], 7, 1);
    let voids = vec![
        VoidRange::new(
            TicketNumber::new(1).unwrap(),
            TicketNumber::new(10).unwrap(),
            VoidReason::Unsold,
        )
        .unwrap(),
    ];
    let mut door = door_with_voids(&fixture, voids);
    let text = fixture
        .issuer
        .issue(TicketNumber::new(2).unwrap())
        .to_qr_text();

    assert!(matches!(
        door.check_in(&text, at(1_000, "Porta 1")),
        Decision::Voided {
            reason: VoidReason::Unsold,
            ..
        }
    ));
    assert_eq!(door.state().entry_count(), 0);

    // Undoing the void (organizer mistake) makes the ticket admissible again.
    door.state_mut().replace_voids(Vec::new());
    assert!(door.check_in(&text, at(2_000, "Porta 1")).is_admit());
    assert_eq!(door.state().entry_count(), 1);
}

#[test]
fn check_in_keeps_the_first_entry_on_repeated_scans() {
    let fixture = fixture([5; 32], [6; 16], 7, 1);
    let mut door = door_with_voids(&fixture, Vec::new());
    let number = TicketNumber::new(42).unwrap();
    let text = fixture.issuer.issue(number).to_qr_text();

    assert!(door.check_in(&text, at(5_000, "Porta 1")).is_admit());
    // A later scan with an earlier (skewed) clock must not overwrite the recorded entry.
    assert_eq!(
        door.check_in(&text, at(1_000, "Porta 2")),
        Decision::AlreadyEntered {
            number,
            first_entry: at(5_000, "Porta 1"),
        }
    );
    assert_eq!(door.state().entry_for(number), Some(&at(5_000, "Porta 1")));
    assert_eq!(door.state().entry_count(), 1);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(128))]

    #[test]
    fn check_in_records_exactly_the_admitted_tickets(
        fixture in fixture_strategy(),
        scans in proptest::collection::vec((1u32..30, -1_000i64..1_000), 1..40),
        void in (1u32..30, 0u32..5),
    ) {
        let (first, len) = void;
        let voids = vec![VoidRange::new(
            TicketNumber::new(first).unwrap(),
            TicketNumber::new(first + len).unwrap(),
            VoidReason::Lost,
        )
        .unwrap()];
        let mut door = door_with_voids(&fixture, voids);
        let mut admitted = 0usize;
        for (value, time) in scans {
            let number = TicketNumber::new(value).unwrap();
            let text = fixture.issuer.issue(number).to_qr_text();
            let voided = first <= value && value <= first + len;
            match door.check_in(&text, at(time, "Porta 1")) {
                Decision::Admit { .. } => {
                    prop_assert!(!voided);
                    admitted += 1;
                }
                Decision::Voided { .. } => prop_assert!(voided),
                Decision::AlreadyEntered { .. } => prop_assert!(!voided),
                other => prop_assert!(false, "unexpected decision {:?}", other),
            }
        }
        prop_assert_eq!(door.state().entry_count(), admitted);
    }
}
