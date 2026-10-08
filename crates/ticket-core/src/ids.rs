//! Identifier and key newtypes.

use core::fmt;
use core::num::NonZeroU32;
use core::str::FromStr;

use ed25519_dalek::VerifyingKey;
use thiserror::Error;
use uuid::Uuid;

/// Full event identifier (UUID). It is bound into every signature but never printed in the QR.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct EventId(Uuid);

impl EventId {
    /// Wraps the 16 raw UUID bytes (big-endian, RFC 9562 layout).
    pub const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(Uuid::from_bytes(bytes))
    }

    /// The 16 raw UUID bytes, as they enter the signed message.
    pub const fn as_bytes(&self) -> &[u8; 16] {
        self.0.as_bytes()
    }
}

impl From<Uuid> for EventId {
    fn from(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl From<EventId> for Uuid {
    fn from(id: EventId) -> Self {
        id.0
    }
}

impl FromStr for EventId {
    type Err = uuid::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Uuid::try_parse(s).map(Self)
    }
}

impl fmt::Display for EventId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0.hyphenated(), f)
    }
}

/// Short random event tag printed in the QR. It is a lookup hint, not a secret and not an
/// authenticator: authenticity comes from the signature, which binds the full [`EventId`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct EventTag(u32);

impl EventTag {
    /// Wraps a raw tag value.
    pub const fn new(value: u32) -> Self {
        Self(value)
    }

    /// The raw tag value.
    pub const fn get(self) -> u32 {
        self.0
    }
}

/// Generation of an event signing key, used for rotation (`docs/adr/0004`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct KeyId(u8);

impl KeyId {
    /// Wraps a raw key id.
    pub const fn new(value: u8) -> Self {
        Self(value)
    }

    /// The raw key id.
    pub const fn get(self) -> u8 {
        self.0
    }
}

/// Ticket number within an event. Numbering starts at 1; zero is never issued.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TicketNumber(NonZeroU32);

impl TicketNumber {
    /// Returns `None` for zero.
    pub const fn new(value: u32) -> Option<Self> {
        match NonZeroU32::new(value) {
            Some(value) => Some(Self(value)),
            None => None,
        }
    }

    /// The raw number.
    pub const fn get(self) -> u32 {
        self.0.get()
    }
}

impl fmt::Display for TicketNumber {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

/// Lifecycle of an event signing key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KeyStatus {
    /// Used to sign new batches; its tickets are valid.
    Active,
    /// No longer signs new batches (e.g. private key lost), but its tickets remain valid.
    Retired,
    /// Compromised: every ticket signed with it is rejected.
    Revoked,
}

/// Why 32 bytes are not an acceptable event public key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum PublicKeyError {
    /// The bytes are not a valid compressed Edwards point.
    #[error("public key is not a valid Ed25519 point")]
    InvalidEncoding,
    /// The point has small order, so it could validate signatures it never produced.
    #[error("public key is a weak (small-order) point")]
    WeakKey,
}

/// Ed25519 public key of an event. Safe to ship to door devices.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct EventPublicKey(VerifyingKey);

impl EventPublicKey {
    /// Parses a compressed Ed25519 public key, rejecting invalid and small-order points.
    ///
    /// # Errors
    ///
    /// Returns [`PublicKeyError`] if the bytes do not decode to a point or the point is weak.
    pub fn from_bytes(bytes: &[u8; 32]) -> Result<Self, PublicKeyError> {
        let key = VerifyingKey::from_bytes(bytes).map_err(|_| PublicKeyError::InvalidEncoding)?;
        if key.is_weak() {
            return Err(PublicKeyError::WeakKey);
        }
        Ok(Self(key))
    }

    /// The compressed 32-byte encoding.
    pub fn to_bytes(&self) -> [u8; 32] {
        self.0.to_bytes()
    }

    pub(crate) const fn as_verifying_key(&self) -> &VerifyingKey {
        &self.0
    }

    #[cfg(feature = "signing")]
    pub(crate) const fn from_verifying_key(key: VerifyingKey) -> Self {
        Self(key)
    }
}

impl fmt::Debug for EventPublicKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("EventPublicKey")
            .field(&HexBytes(&self.to_bytes()))
            .finish()
    }
}

struct HexBytes<'a>(&'a [u8]);

impl fmt::Debug for HexBytes<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in self.0 {
            write!(f, "{byte:02x}")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticket_number_rejects_zero() {
        assert_eq!(TicketNumber::new(0), None);
        assert_eq!(TicketNumber::new(1).map(TicketNumber::get), Some(1));
        assert_eq!(
            TicketNumber::new(u32::MAX).map(TicketNumber::get),
            Some(u32::MAX)
        );
    }

    #[test]
    fn event_id_round_trips_through_string() {
        let text = "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";
        let id: EventId = text.parse().unwrap();
        assert_eq!(id.to_string(), text);
        assert_eq!(EventId::from_bytes(*id.as_bytes()), id);
    }

    #[test]
    fn event_id_rejects_garbage() {
        assert!("not-a-uuid".parse::<EventId>().is_err());
        assert!("".parse::<EventId>().is_err());
    }

    #[test]
    fn public_key_rejects_small_order_points() {
        // The identity point (y = 1) has order 1.
        let mut identity = [0u8; 32];
        identity[0] = 1;
        assert_eq!(
            EventPublicKey::from_bytes(&identity),
            Err(PublicKeyError::WeakKey)
        );
    }

    #[test]
    fn public_key_rejects_non_points() {
        // y = 2 is not on the curve (x² would be a non-square).
        let mut not_on_curve = [0u8; 32];
        not_on_curve[0] = 2;
        assert_eq!(
            EventPublicKey::from_bytes(&not_on_curve),
            Err(PublicKeyError::InvalidEncoding)
        );
    }
}
