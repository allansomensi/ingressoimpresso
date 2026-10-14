//! Decoder fuzzing (docs/auditorias/qr-v1.md): Base45 and the v1 payload parser must never
//! panic, and whatever they accept must round-trip byte for byte (canonical encoding).
//!
//! Run with `cargo +nightly fuzz run decode` from `crates/ticket-core`.
#![no_main]

use libfuzzer_sys::fuzz_target;
use ticket_core::{SignedTicket, base45};

fuzz_target!(|data: &[u8]| {
    // Any bytes encode, and decode back to the same bytes.
    let encoded = base45::encode(data);
    assert_eq!(base45::decode(&encoded).as_deref(), Ok(data));

    // Any text either fails or decodes to bytes that re-encode to the same text.
    if let Ok(text) = std::str::from_utf8(data) {
        if let Ok(bytes) = base45::decode(text) {
            assert_eq!(base45::encode(&bytes), text);
        }
        if let Ok(ticket) = SignedTicket::from_qr_text(text) {
            assert_eq!(ticket.to_qr_text(), text);
            assert_eq!(SignedTicket::from_bytes(&ticket.to_bytes()).as_ref(), Ok(&ticket));
        }
    }

    // Any bytes either fail or parse to a ticket that serializes back to the same bytes.
    if let Ok(ticket) = SignedTicket::from_bytes(data) {
        assert_eq!(ticket.to_bytes().as_slice(), data);
    }
});
