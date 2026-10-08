//! Ticket payload, format v1 (`docs/adr/0003-formato-qr-v1.md`).
//!
//! ```text
//! offset size field
//!      0    1 version        = 0x01
//!      1    4 event_tag      u32 big-endian
//!      5    1 key_id         u8
//!      6    4 ticket_number  u32 big-endian, ≥ 1
//!     10   64 signature      Ed25519 over SIGNING_DOMAIN ‖ event_id (16 bytes) ‖ payload[0..10]
//! ```
//!
//! QR text = Base45(payload): exactly [`QR_TEXT_LEN`] characters, QR alphanumeric mode.

use thiserror::Error;

use crate::base45::{self, Base45Error};
use crate::ids::{EventId, EventTag, KeyId, TicketNumber};

/// Version byte of format v1.
pub const FORMAT_VERSION_V1: u8 = 0x01;
/// Length of the signed header (version, tag, key id, number).
pub const HEADER_LEN: usize = 10;
/// Length of an Ed25519 signature.
pub const SIGNATURE_LEN: usize = 64;
/// Length of the binary payload.
pub const PAYLOAD_LEN: usize = HEADER_LEN + SIGNATURE_LEN;
/// Length of the QR text (Base45 of the payload).
pub const QR_TEXT_LEN: usize = base45::encoded_len(PAYLOAD_LEN);
/// Domain separation prefix of every signed message.
pub const SIGNING_DOMAIN: &[u8; 26] = b"ingressoimpresso:ticket:v1";

const SIGNING_MESSAGE_LEN: usize = SIGNING_DOMAIN.len() + 16 + HEADER_LEN;

/// Why a QR text or byte string is not a well-formed v1 ticket. Says nothing about authenticity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum DecodeError {
    /// The QR text does not have exactly [`QR_TEXT_LEN`] bytes.
    #[error("QR text has {actual} bytes, expected {QR_TEXT_LEN}")]
    WrongTextLength {
        /// Observed length in bytes.
        actual: usize,
    },
    /// The QR text is not strict Base45.
    #[error("QR text is not valid Base45: {0}")]
    Base45(#[from] Base45Error),
    /// The payload does not have exactly [`PAYLOAD_LEN`] bytes.
    #[error("payload has {actual} bytes, expected {PAYLOAD_LEN}")]
    WrongPayloadLength {
        /// Observed length in bytes.
        actual: usize,
    },
    /// The version byte is not a known format.
    #[error("unsupported format version {0:#04x}")]
    UnsupportedVersion(u8),
    /// The ticket number is zero, which is never issued.
    #[error("ticket number zero is never issued")]
    ZeroTicketNumber,
}

/// The signed header of a ticket.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TicketHeader {
    /// Lookup hint for the event.
    pub event_tag: EventTag,
    /// Signing key generation.
    pub key_id: KeyId,
    /// Ticket number.
    pub number: TicketNumber,
}

impl TicketHeader {
    /// The 10 header bytes, version included.
    pub fn to_bytes(&self) -> [u8; HEADER_LEN] {
        let [t0, t1, t2, t3] = self.event_tag.get().to_be_bytes();
        let [n0, n1, n2, n3] = self.number.get().to_be_bytes();
        [
            FORMAT_VERSION_V1,
            t0,
            t1,
            t2,
            t3,
            self.key_id.get(),
            n0,
            n1,
            n2,
            n3,
        ]
    }

    /// The exact message signed for this header under `event_id`.
    pub(crate) fn signing_message(&self, event_id: &EventId) -> [u8; SIGNING_MESSAGE_LEN] {
        let mut message = [0u8; SIGNING_MESSAGE_LEN];
        let header = self.to_bytes();
        let parts = SIGNING_DOMAIN
            .iter()
            .chain(event_id.as_bytes())
            .chain(&header);
        for (slot, byte) in message.iter_mut().zip(parts) {
            *slot = *byte;
        }
        message
    }
}

/// A well-formed v1 ticket: header plus a signature that has **not** been verified yet.
///
/// Verification is the job of [`crate::EventVerifier`]; holding a `SignedTicket` proves nothing.
#[derive(Clone, PartialEq, Eq)]
pub struct SignedTicket {
    header: TicketHeader,
    signature: [u8; SIGNATURE_LEN],
}

impl SignedTicket {
    /// Assembles a ticket from its parts. Used by the issuer and by tests.
    pub const fn from_parts(header: TicketHeader, signature: [u8; SIGNATURE_LEN]) -> Self {
        Self { header, signature }
    }

    /// The (unverified) header.
    pub const fn header(&self) -> &TicketHeader {
        &self.header
    }

    /// The (unverified) signature bytes.
    pub const fn signature(&self) -> &[u8; SIGNATURE_LEN] {
        &self.signature
    }

    /// The 74-byte binary payload.
    pub fn to_bytes(&self) -> [u8; PAYLOAD_LEN] {
        let mut payload = [0u8; PAYLOAD_LEN];
        let header = self.header.to_bytes();
        for (slot, byte) in payload.iter_mut().zip(header.iter().chain(&self.signature)) {
            *slot = *byte;
        }
        payload
    }

    /// The text to encode in the QR code (alphanumeric mode).
    pub fn to_qr_text(&self) -> String {
        base45::encode(&self.to_bytes())
    }

    /// Parses a binary payload.
    ///
    /// # Errors
    ///
    /// Returns [`DecodeError`] if the length, version or ticket number is invalid.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, DecodeError> {
        let payload: &[u8; PAYLOAD_LEN] =
            bytes
                .try_into()
                .map_err(|_| DecodeError::WrongPayloadLength {
                    actual: bytes.len(),
                })?;
        let [
            version,
            t0,
            t1,
            t2,
            t3,
            key_id,
            n0,
            n1,
            n2,
            n3,
            signature @ ..,
        ] = *payload;
        if version != FORMAT_VERSION_V1 {
            return Err(DecodeError::UnsupportedVersion(version));
        }
        let number = TicketNumber::new(u32::from_be_bytes([n0, n1, n2, n3]))
            .ok_or(DecodeError::ZeroTicketNumber)?;
        Ok(Self {
            header: TicketHeader {
                event_tag: EventTag::new(u32::from_be_bytes([t0, t1, t2, t3])),
                key_id: KeyId::new(key_id),
                number,
            },
            signature,
        })
    }

    /// Parses the text read from a QR code. Strict: no trimming, no case folding.
    ///
    /// # Errors
    ///
    /// Returns [`DecodeError`] if the text is not exactly a Base45-encoded v1 payload.
    pub fn from_qr_text(text: &str) -> Result<Self, DecodeError> {
        if text.len() != QR_TEXT_LEN {
            return Err(DecodeError::WrongTextLength { actual: text.len() });
        }
        Self::from_bytes(&base45::decode(text)?)
    }
}

impl core::fmt::Debug for SignedTicket {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("SignedTicket")
            .field("header", &self.header)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> SignedTicket {
        let mut signature = [0u8; SIGNATURE_LEN];
        for (index, byte) in signature.iter_mut().enumerate() {
            *byte = u8::try_from(index).unwrap();
        }
        SignedTicket::from_parts(
            TicketHeader {
                event_tag: EventTag::new(0x1A2B_3C4D),
                key_id: KeyId::new(7),
                number: TicketNumber::new(0x0102_0304).unwrap(),
            },
            signature,
        )
    }

    #[test]
    fn layout_constants_are_consistent() {
        assert_eq!(PAYLOAD_LEN, 74);
        assert_eq!(QR_TEXT_LEN, 111);
        assert_eq!(SIGNING_MESSAGE_LEN, 52);
    }

    #[test]
    fn header_layout_is_big_endian() {
        assert_eq!(
            sample().header().to_bytes(),
            [0x01, 0x1A, 0x2B, 0x3C, 0x4D, 0x07, 0x01, 0x02, 0x03, 0x04]
        );
    }

    #[test]
    fn payload_is_header_then_signature() {
        let payload = sample().to_bytes();
        assert_eq!(&payload[..HEADER_LEN], &sample().header().to_bytes());
        assert_eq!(&payload[HEADER_LEN..], sample().signature());
    }

    #[test]
    fn signing_message_layout() {
        let event_id = EventId::from_bytes([0xEE; 16]);
        let message = sample().header().signing_message(&event_id);
        assert_eq!(&message[..26], SIGNING_DOMAIN);
        assert_eq!(&message[26..42], &[0xEE; 16]);
        assert_eq!(&message[42..], &sample().header().to_bytes());
    }

    #[test]
    fn round_trips_through_bytes_and_text() {
        let ticket = sample();
        assert_eq!(
            SignedTicket::from_bytes(&ticket.to_bytes()).unwrap(),
            ticket
        );
        let text = ticket.to_qr_text();
        assert_eq!(text.len(), QR_TEXT_LEN);
        assert_eq!(SignedTicket::from_qr_text(&text).unwrap(), ticket);
    }

    #[test]
    fn rejects_wrong_lengths() {
        assert_eq!(
            SignedTicket::from_bytes(&[0u8; 73]),
            Err(DecodeError::WrongPayloadLength { actual: 73 })
        );
        assert_eq!(
            SignedTicket::from_qr_text(""),
            Err(DecodeError::WrongTextLength { actual: 0 })
        );
        let mut text = sample().to_qr_text();
        text.push('0');
        assert_eq!(
            SignedTicket::from_qr_text(&text),
            Err(DecodeError::WrongTextLength { actual: 112 })
        );
    }

    #[test]
    fn rejects_unknown_version() {
        let mut payload = sample().to_bytes();
        payload[0] = 0x02;
        assert_eq!(
            SignedTicket::from_bytes(&payload),
            Err(DecodeError::UnsupportedVersion(0x02))
        );
    }

    #[test]
    fn rejects_zero_number() {
        let mut payload = sample().to_bytes();
        payload[6..10].copy_from_slice(&[0, 0, 0, 0]);
        assert_eq!(
            SignedTicket::from_bytes(&payload),
            Err(DecodeError::ZeroTicketNumber)
        );
    }

    #[test]
    fn rejects_lowercase_text() {
        let text = sample().to_qr_text().to_lowercase();
        assert!(matches!(
            SignedTicket::from_qr_text(&text),
            Err(DecodeError::Base45(_))
        ));
    }

    #[test]
    fn debug_does_not_print_signature() {
        let rendered = format!("{:?}", sample());
        assert!(rendered.contains("SignedTicket"));
        assert!(!rendered.contains("signature"));
    }
}
