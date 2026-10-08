//! Ticket core: QR format v1, Ed25519 signatures and the door check-in decision.
//!
//! This crate is the single source of truth shared by the API server, the file renderer and the
//! door app (compiled to WebAssembly). It is deliberately pure — no IO, no clock, no randomness:
//! time, keys and door state come in as parameters, which keeps it portable and deterministic.
//!
//! The format is specified in `docs/adr/0003-formato-qr-v1.md` and the signature scheme in
//! `docs/adr/0004-assinatura-ed25519.md`. **Format v1 is frozen**: any change requires a new
//! version byte and a new ADR.
//!
//! Typical door flow:
//!
//! 1. Build an [`EventVerifier`] from the event manifest (event id, tag and public keys).
//! 2. Wrap it in a [`Door`] together with the known voids and entries ([`DoorState`]).
//! 3. Call [`Door::check_in`] with the scanned QR text and show the resulting [`Decision`].
#![deny(clippy::indexing_slicing)]

pub mod base45;
mod door;
mod ids;
mod payload;
mod verify;

#[cfg(feature = "signing")]
mod signing;

#[cfg(feature = "serde")]
pub mod dto;

pub use door::{
    Decision, Door, DoorState, EntryInfo, InvalidReason, VoidRange, VoidRangeError, VoidReason,
};
pub use ids::{EventId, EventPublicKey, EventTag, KeyId, KeyStatus, PublicKeyError, TicketNumber};
pub use payload::{
    DecodeError, FORMAT_VERSION_V1, HEADER_LEN, PAYLOAD_LEN, QR_TEXT_LEN, SIGNATURE_LEN,
    SIGNING_DOMAIN, SignedTicket, TicketHeader,
};
#[cfg(feature = "signing")]
pub use signing::{EventSigningKey, TicketIssuer};
pub use verify::{EventKey, EventVerifier, Rejection, VerifiedTicket, VerifierError};
