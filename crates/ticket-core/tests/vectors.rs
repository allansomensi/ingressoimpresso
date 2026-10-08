//! Runs the shared vectors (`testdata/vectors/ticket-v1.json`) against the Rust core.
//!
//! The same file runs against the WebAssembly build in `packages/ticket-core-wasm`. This test
//! parses the file with its own minimal schema, independent of the generator in `crates/cli`.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

use std::fs;
use std::path::Path;

use serde::Deserialize;
use ticket_core::dto::{DecisionDto, DoorEventDto, EntryDto, VoidRangeDto};
use ticket_core::{
    Door, EntryInfo, EventId, EventSigningKey, EventTag, EventVerifier, KeyId, QR_TEXT_LEN,
    TicketIssuer, TicketNumber, VoidRange,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VectorsFile {
    format: String,
    ticket_format_version: u8,
    events: Vec<VectorEvent>,
    issued: Vec<IssuedVector>,
    cases: Vec<DecisionCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VectorEvent {
    name: String,
    door: DoorEventDto,
    seeds: Vec<VectorSeed>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VectorSeed {
    key_id: u8,
    seed: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssuedVector {
    event: String,
    key_id: u8,
    number: u32,
    payload_hex: String,
    qr_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecisionCase {
    name: String,
    door_event: String,
    voids: Vec<VoidRangeDto>,
    entries: Vec<EntryDto>,
    qr_text: String,
    expected: DecisionDto,
}

fn load() -> VectorsFile {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/vectors/ticket-v1.json");
    let json = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("reading {}: {error}", path.display()));
    let file: VectorsFile = serde_json::from_str(&json).expect("vectors file parses");
    assert_eq!(file.format, "ingressoimpresso-ticket-vectors");
    assert_eq!(file.ticket_format_version, ticket_core::FORMAT_VERSION_V1);
    file
}

fn event<'a>(file: &'a VectorsFile, name: &str) -> &'a VectorEvent {
    file.events
        .iter()
        .find(|event| event.name == name)
        .unwrap_or_else(|| panic!("unknown event {name}"))
}

#[test]
fn issuer_reproduces_every_issued_vector() {
    let file = load();
    assert!(!file.issued.is_empty());
    for vector in &file.issued {
        let event = event(&file, &vector.event);
        let seed_hex = &event
            .seeds
            .iter()
            .find(|seed| seed.key_id == vector.key_id)
            .expect("seed exists")
            .seed;
        let mut seed = [0u8; 32];
        hex::decode_to_slice(seed_hex, &mut seed).expect("seed is 32 hex bytes");
        let event_id: EventId = event.door.event_id.parse().expect("event id parses");
        let issuer = TicketIssuer::new(
            event_id,
            EventTag::new(event.door.event_tag),
            KeyId::new(vector.key_id),
            EventSigningKey::from_seed(&seed),
        );
        let ticket = issuer.issue(TicketNumber::new(vector.number).expect("non-zero"));
        assert_eq!(
            hex::encode(ticket.to_bytes()),
            vector.payload_hex,
            "{} #{}",
            vector.event,
            vector.number
        );
        assert_eq!(
            ticket.to_qr_text(),
            vector.qr_text,
            "{} #{}",
            vector.event,
            vector.number
        );
        assert_eq!(vector.qr_text.len(), QR_TEXT_LEN);

        let public_key = issuer.public_key();
        let verifier = EventVerifier::try_from(&event.door).expect("door event converts");
        assert!(
            event
                .door
                .keys
                .iter()
                .any(|key| key.public_key == hex::encode(public_key.to_bytes())),
            "seed of key {} does not match the published public key",
            vector.key_id
        );
        if verifier.verify_qr_text(&vector.qr_text).is_ok() {
            continue;
        }
        // Only revoked keys may fail verification.
        let key = event
            .door
            .keys
            .iter()
            .find(|key| key.key_id == vector.key_id)
            .expect("key exists");
        assert_eq!(
            key.status,
            ticket_core::dto::KeyStatusDto::Revoked,
            "{} #{}",
            vector.event,
            vector.number
        );
    }
}

#[test]
fn core_agrees_with_every_decision_case() {
    let file = load();
    assert!(
        file.cases.len() >= 20,
        "the specification should cover every decision path"
    );
    for case in &file.cases {
        let verifier = EventVerifier::try_from(&event(&file, &case.door_event).door)
            .expect("door event converts");
        let mut door = Door::new(verifier);
        door.state_mut().replace_voids(
            case.voids
                .iter()
                .map(|void| VoidRange::try_from(void).expect("void converts"))
                .collect(),
        );
        for entry in &case.entries {
            let (number, info): (TicketNumber, EntryInfo) =
                entry.try_into().expect("entry converts");
            door.state_mut().record_entry(number, info);
        }
        let decision = door.evaluate(&case.qr_text);
        assert_eq!(
            DecisionDto::from(&decision),
            case.expected,
            "case {}",
            case.name
        );
    }
}

#[test]
fn case_names_are_unique() {
    let file = load();
    let mut names: Vec<&str> = file.cases.iter().map(|case| case.name.as_str()).collect();
    names.sort_unstable();
    let before = names.len();
    names.dedup();
    assert_eq!(before, names.len());
}
