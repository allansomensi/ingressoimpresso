//! Ticket issuing. Server-side only: this module is compiled only with the `signing` feature,
//! which the WebAssembly build never enables, so private keys cannot exist on door devices.

use core::fmt;

use ed25519_dalek::{Signer, SigningKey};

use crate::ids::{EventId, EventPublicKey, EventTag, KeyId, TicketNumber};
use crate::payload::{SignedTicket, TicketHeader};

/// Private Ed25519 key of an event. Zeroized on drop; never printed.
pub struct EventSigningKey(SigningKey);

impl EventSigningKey {
    /// Builds the key from its 32-byte seed (RFC 8032 secret key).
    ///
    /// Seeds must come from a CSPRNG; this crate deliberately has no randomness of its own.
    pub fn from_seed(seed: &[u8; 32]) -> Self {
        Self(SigningKey::from_bytes(seed))
    }

    /// The matching public key, safe to publish to door devices.
    pub fn public_key(&self) -> EventPublicKey {
        EventPublicKey::from_verifying_key(self.0.verifying_key())
    }
}

impl fmt::Debug for EventSigningKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("EventSigningKey")
            .field("public_key", &self.public_key())
            .finish_non_exhaustive()
    }
}

/// Issues signed tickets for one event and one key generation.
///
/// Binding event id, tag and key id together at construction prevents signing a header with a
/// tag or key id that does not belong to the key in use.
#[derive(Debug)]
pub struct TicketIssuer {
    event_id: EventId,
    event_tag: EventTag,
    key_id: KeyId,
    signing_key: EventSigningKey,
}

impl TicketIssuer {
    /// Creates an issuer. The caller is responsible for only issuing **paid** batches.
    pub const fn new(
        event_id: EventId,
        event_tag: EventTag,
        key_id: KeyId,
        signing_key: EventSigningKey,
    ) -> Self {
        Self {
            event_id,
            event_tag,
            key_id,
            signing_key,
        }
    }

    /// The public key matching this issuer's private key.
    pub fn public_key(&self) -> EventPublicKey {
        self.signing_key.public_key()
    }

    /// Signs one ticket. Deterministic (RFC 8032): the same number always yields the same QR.
    pub fn issue(&self, number: TicketNumber) -> SignedTicket {
        let header = TicketHeader {
            event_tag: self.event_tag,
            key_id: self.key_id,
            number,
        };
        let signature = self
            .signing_key
            .0
            .sign(&header.signing_message(&self.event_id));
        SignedTicket::from_parts(header, signature.to_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_never_prints_secret_material() {
        let seed = [0x42u8; 32];
        let key = EventSigningKey::from_seed(&seed);
        let rendered = format!("{key:?}");
        assert!(rendered.starts_with("EventSigningKey"));
        assert!(!rendered.contains(&"42".repeat(32)));
    }

    #[test]
    fn issuing_is_deterministic() {
        let issuer = || {
            TicketIssuer::new(
                EventId::from_bytes([1; 16]),
                EventTag::new(9),
                KeyId::new(1),
                EventSigningKey::from_seed(&[7; 32]),
            )
        };
        let number = TicketNumber::new(42).unwrap();
        assert_eq!(
            issuer().issue(number).to_qr_text(),
            issuer().issue(number).to_qr_text()
        );
    }
}
