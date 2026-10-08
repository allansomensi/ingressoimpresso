//! Ticket verification against an event's public keys.

use ed25519_dalek::Signature;
use thiserror::Error;

use crate::ids::{EventId, EventPublicKey, EventTag, KeyId, KeyStatus, TicketNumber};
use crate::payload::{DecodeError, SignedTicket};

/// One signing key generation of an event, as known by a verifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventKey {
    /// Key generation.
    pub key_id: KeyId,
    /// Public half of the key.
    pub public_key: EventPublicKey,
    /// Lifecycle status.
    pub status: KeyStatus,
}

/// Why an [`EventVerifier`] cannot be built.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum VerifierError {
    /// The same key id appears more than once.
    #[error("duplicate key id {}", .0.get())]
    DuplicateKeyId(KeyId),
}

/// Why a scanned ticket is not accepted as authentic for this event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum Rejection {
    /// Not a well-formed v1 ticket (or not one of our QR codes at all).
    #[error("malformed ticket: {0}")]
    Malformed(#[from] DecodeError),
    /// Well-formed ticket carrying another event's tag.
    #[error("ticket belongs to another event (tag {:#010x})", .0.get())]
    OtherEvent(EventTag),
    /// The key id is not known for this event.
    #[error("unknown key id {}", .0.get())]
    UnknownKey(KeyId),
    /// The key was revoked: tickets signed with it are no longer accepted.
    #[error("key id {} is revoked", .0.get())]
    RevokedKey(KeyId),
    /// The signature does not verify: forged or tampered ticket.
    #[error("invalid signature")]
    BadSignature,
}

/// A ticket whose signature verified under one of the event's non-revoked keys.
///
/// It can only be obtained from [`EventVerifier`], so holding one proves authenticity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct VerifiedTicket {
    number: TicketNumber,
    key_id: KeyId,
}

impl VerifiedTicket {
    /// The authentic ticket number.
    pub const fn number(&self) -> TicketNumber {
        self.number
    }

    /// The key generation that signed it.
    pub const fn key_id(&self) -> KeyId {
        self.key_id
    }
}

/// Verifies tickets of a single event. Holds only public data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventVerifier {
    event_id: EventId,
    event_tag: EventTag,
    keys: Vec<EventKey>,
}

impl EventVerifier {
    /// Builds a verifier for one event.
    ///
    /// # Errors
    ///
    /// Returns [`VerifierError::DuplicateKeyId`] if two keys share a key id.
    pub fn new(
        event_id: EventId,
        event_tag: EventTag,
        keys: Vec<EventKey>,
    ) -> Result<Self, VerifierError> {
        for (index, key) in keys.iter().enumerate() {
            if keys
                .iter()
                .skip(index + 1)
                .any(|other| other.key_id == key.key_id)
            {
                return Err(VerifierError::DuplicateKeyId(key.key_id));
            }
        }
        Ok(Self {
            event_id,
            event_tag,
            keys,
        })
    }

    /// The event this verifier accepts.
    pub const fn event_id(&self) -> EventId {
        self.event_id
    }

    /// The event tag expected in the QR.
    pub const fn event_tag(&self) -> EventTag {
        self.event_tag
    }

    /// Decodes and verifies a scanned QR text.
    ///
    /// # Errors
    ///
    /// Returns the [`Rejection`] explaining why the text is not an authentic ticket of this event.
    pub fn verify_qr_text(&self, text: &str) -> Result<VerifiedTicket, Rejection> {
        self.verify(&SignedTicket::from_qr_text(text)?)
    }

    /// Verifies an already decoded ticket.
    ///
    /// Checks run from cheapest to most expensive: tag, key lookup, key status, signature
    /// (`verify_strict`: canonical `S`, no small-order `R`).
    ///
    /// # Errors
    ///
    /// Returns the [`Rejection`] explaining why the ticket is not authentic for this event.
    pub fn verify(&self, ticket: &SignedTicket) -> Result<VerifiedTicket, Rejection> {
        let header = ticket.header();
        if header.event_tag != self.event_tag {
            return Err(Rejection::OtherEvent(header.event_tag));
        }
        let key = self
            .keys
            .iter()
            .find(|key| key.key_id == header.key_id)
            .ok_or(Rejection::UnknownKey(header.key_id))?;
        if key.status == KeyStatus::Revoked {
            return Err(Rejection::RevokedKey(header.key_id));
        }
        let message = header.signing_message(&self.event_id);
        let signature = Signature::from_bytes(ticket.signature());
        key.public_key
            .as_verifying_key()
            .verify_strict(&message, &signature)
            .map_err(|_| Rejection::BadSignature)?;
        Ok(VerifiedTicket {
            number: header.number,
            key_id: header.key_id,
        })
    }
}
