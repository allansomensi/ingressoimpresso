//! Door fuzzing (docs/auditorias/qr-v1.md): verification, the manifest DTOs and the check-in
//! decision over arbitrary input. Nothing may panic, nothing may verify unless issued by the
//! event's key, and a ticket is admitted at most once per door.
//!
//! Run with `cargo +nightly fuzz run door` from `crates/ticket-core`.
#![no_main]

use std::collections::HashSet;

use libfuzzer_sys::fuzz_target;
use ticket_core::dto::{DoorEventDto, EntryDto, VoidRangeDto};
use ticket_core::{
    Decision, Door, EntryInfo, EventId, EventKey, EventSigningKey, EventTag, EventVerifier,
    KeyId, KeyStatus, SignedTicket, TicketIssuer, TicketNumber, VoidRange,
};

const SEED: [u8; 32] = [0x5a; 32];
const EVENT_ID: [u8; 16] = [0x11; 16];
const TAG: u32 = 0x0123_4567;

fn verifier() -> EventVerifier {
    let signing_key = EventSigningKey::from_seed(&SEED);
    let public_key = signing_key.public_key();
    EventVerifier::new(
        EventId::from_bytes(EVENT_ID),
        EventTag::new(TAG),
        vec![EventKey {
            key_id: KeyId::new(1),
            public_key,
            status: KeyStatus::Active,
        }],
    )
    .expect("one key")
}

fn issuer() -> TicketIssuer {
    TicketIssuer::new(
        EventId::from_bytes(EVENT_ID),
        EventTag::new(TAG),
        KeyId::new(1),
        EventSigningKey::from_seed(&SEED),
    )
}

fuzz_target!(|data: &[u8]| {
    let Some((&mode, rest)) = data.split_first() else {
        return;
    };
    match mode % 4 {
        0 => {
            // Arbitrary text at the door: never a panic, never an admission (the key is secret
            // to this harness, so no input can carry a valid signature by chance).
            if let Ok(text) = std::str::from_utf8(rest) {
                let mut door = Door::new(verifier());
                let decision = door.check_in(
                    text,
                    EntryInfo {
                        at_unix_ms: 0,
                        device_name: "fuzz".to_owned(),
                    },
                );
                assert!(
                    !decision.is_admit(),
                    "arbitrary text admitted: {text:?}"
                );
            }
        }
        1 => {
            // Mutations of a genuine ticket: only the untouched payload verifies.
            let number = TicketNumber::new(u32::from_le_bytes([
                rest.first().copied().unwrap_or(1),
                rest.get(1).copied().unwrap_or(0),
                rest.get(2).copied().unwrap_or(0),
                rest.get(3).copied().unwrap_or(0),
            ]))
            .unwrap_or(TicketNumber::new(1).expect("non-zero"));
            let genuine = issuer().issue(number).to_bytes();
            let mut mutated = genuine;
            for (index, byte) in rest.iter().skip(4).enumerate().take(mutated.len()) {
                mutated[index] ^= byte;
            }
            let result = SignedTicket::from_bytes(&mutated)
                .map_err(ticket_core::Rejection::from)
                .and_then(|ticket| verifier().verify(&ticket));
            assert_eq!(result.is_ok(), mutated == genuine);
        }
        2 => {
            // The manifest DTOs: arbitrary JSON never panics on its way to a verifier or a door.
            if let Ok(dto) = serde_json::from_slice::<DoorEventDto>(rest) {
                let _ = EventVerifier::try_from(&dto);
            }
            if let Ok(voids) = serde_json::from_slice::<Vec<VoidRangeDto>>(rest) {
                let _ = voids.iter().map(VoidRange::try_from).collect::<Vec<_>>();
            }
            if let Ok(entries) = serde_json::from_slice::<Vec<EntryDto>>(rest) {
                let _ = entries
                    .iter()
                    .map(<(TicketNumber, EntryInfo)>::try_from)
                    .collect::<Vec<_>>();
            }
        }
        _ => {
            // A sequence of genuine scans: each number is admitted at most once, whatever the
            // order and the clocks.
            let mut door = Door::new(verifier());
            let mut admitted = HashSet::new();
            for chunk in rest.chunks(3) {
                let value = u32::from(chunk[0]) + 1;
                let number = TicketNumber::new(value).expect("non-zero");
                let at = i64::from(chunk.get(1).copied().unwrap_or(0)) - 128;
                let device = format!("Porta {}", chunk.get(2).copied().unwrap_or(0) % 3);
                let text = issuer().issue(number).to_qr_text();
                match door.check_in(
                    &text,
                    EntryInfo {
                        at_unix_ms: at,
                        device_name: device,
                    },
                ) {
                    Decision::Admit { number: seen } => {
                        assert_eq!(seen, number);
                        assert!(admitted.insert(value), "number {value} admitted twice");
                    }
                    Decision::AlreadyEntered { number: seen, .. } => {
                        assert_eq!(seen, number);
                        assert!(admitted.contains(&value));
                    }
                    other => panic!("unexpected decision {other:?}"),
                }
            }
            assert_eq!(door.state().entry_count(), admitted.len());
        }
    }
});
