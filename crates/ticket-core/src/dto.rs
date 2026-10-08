//! Wire DTOs shared by the door manifest (server → device), the WebAssembly boundary and the
//! shared test vectors. JSON uses `camelCase` fields and `snake_case` enum values.
//!
//! TypeScript bindings are generated from these types (`cargo test -p ticket-core --features ts`)
//! into `packages/ticket-core-wasm/src/generated/`; never edit those files by hand.
//!
//! Unknown fields are ignored on purpose, so the server can add manifest fields without
//! breaking devices that still run an older build.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::door::{Decision, EntryInfo, InvalidReason, VoidRange, VoidRangeError, VoidReason};
use crate::ids::{
    EventId, EventPublicKey, EventTag, KeyId, KeyStatus, PublicKeyError, TicketNumber,
};
use crate::verify::{EventKey, EventVerifier, VerifierError};

/// Why a DTO cannot be converted into a domain value.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum DtoError {
    /// `eventId` is not a UUID.
    #[error("invalid event id")]
    InvalidEventId,
    /// `publicKey` is not 64 hex characters.
    #[error("public key of key id {key_id} is not 32 hex-encoded bytes")]
    InvalidPublicKeyEncoding {
        /// The key id whose public key is malformed.
        key_id: u8,
    },
    /// `publicKey` is not an acceptable Ed25519 key.
    #[error("public key of key id {key_id} is unacceptable: {source}")]
    InvalidPublicKey {
        /// The key id whose public key is unacceptable.
        key_id: u8,
        /// Why it is unacceptable.
        source: PublicKeyError,
    },
    /// Invalid key set.
    #[error(transparent)]
    Verifier(#[from] VerifierError),
    /// A ticket number is zero.
    #[error("ticket number zero is never issued")]
    ZeroTicketNumber,
    /// A void range has `first > last`.
    #[error(transparent)]
    VoidRange(#[from] VoidRangeError),
}

/// Lifecycle of a signing key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub enum KeyStatusDto {
    /// Signs new batches.
    Active,
    /// No longer signs, tickets still valid.
    Retired,
    /// Compromised, tickets rejected.
    Revoked,
}

/// One public key of the event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct EventKeyDto {
    /// Key generation (0–255).
    pub key_id: u8,
    /// Compressed Ed25519 public key, 64 lowercase hex characters.
    pub public_key: String,
    /// Lifecycle status.
    pub status: KeyStatusDto,
}

/// What a door needs to verify tickets of an event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct DoorEventDto {
    /// Event UUID, hyphenated.
    pub event_id: String,
    /// Event tag printed in the QR.
    pub event_tag: u32,
    /// All keys of the event, revoked ones included.
    pub keys: Vec<EventKeyDto>,
}

/// Why a range was voided.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub enum VoidReasonDto {
    /// Returned unsold.
    Unsold,
    /// Lost or stolen.
    Lost,
    /// Any other reason.
    Revoked,
}

/// An inclusive range of voided ticket numbers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct VoidRangeDto {
    /// First voided number.
    pub first: u32,
    /// Last voided number (inclusive).
    pub last: u32,
    /// Why it was voided.
    pub reason: VoidReasonDto,
}

/// A recorded entry (first entry of a ticket).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct EntryDto {
    /// Ticket number.
    pub number: u32,
    /// Unix milliseconds.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub at_unix_ms: i64,
    /// Device name.
    pub device_name: String,
}

/// When and where a ticket first entered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub struct FirstEntryDto {
    /// Unix milliseconds.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub at_unix_ms: i64,
    /// Device name.
    pub device_name: String,
}

/// Why a scan is not an authentic ticket of this event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub enum InvalidReasonDto {
    /// Not one of our QR codes, damaged or truncated.
    Malformed,
    /// Unknown key id.
    UnknownKey,
    /// Revoked key.
    RevokedKey,
    /// Forged or tampered.
    BadSignature,
}

/// The decision shown at the door.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "ticket-core-wasm/src/generated/")
)]
pub enum DecisionDto {
    /// Green: let the person in.
    Admit {
        /// Ticket number.
        number: u32,
    },
    /// Red: already entered.
    AlreadyEntered {
        /// Ticket number.
        number: u32,
        /// First entry.
        first_entry: FirstEntryDto,
    },
    /// Red: voided by the organizer.
    Voided {
        /// Ticket number.
        number: u32,
        /// Why.
        reason: VoidReasonDto,
    },
    /// Yellow: ticket of another event.
    OtherEvent {
        /// Tag found in the QR.
        event_tag: u32,
    },
    /// Red: not authentic.
    Invalid {
        /// Why.
        reason: InvalidReasonDto,
    },
}

impl From<KeyStatus> for KeyStatusDto {
    fn from(status: KeyStatus) -> Self {
        match status {
            KeyStatus::Active => Self::Active,
            KeyStatus::Retired => Self::Retired,
            KeyStatus::Revoked => Self::Revoked,
        }
    }
}

impl From<KeyStatusDto> for KeyStatus {
    fn from(status: KeyStatusDto) -> Self {
        match status {
            KeyStatusDto::Active => Self::Active,
            KeyStatusDto::Retired => Self::Retired,
            KeyStatusDto::Revoked => Self::Revoked,
        }
    }
}

impl From<&EventKey> for EventKeyDto {
    fn from(key: &EventKey) -> Self {
        Self {
            key_id: key.key_id.get(),
            public_key: hex::encode(key.public_key.to_bytes()),
            status: key.status.into(),
        }
    }
}

impl TryFrom<&EventKeyDto> for EventKey {
    type Error = DtoError;

    fn try_from(dto: &EventKeyDto) -> Result<Self, Self::Error> {
        let mut bytes = [0u8; 32];
        hex::decode_to_slice(&dto.public_key, &mut bytes)
            .map_err(|_| DtoError::InvalidPublicKeyEncoding { key_id: dto.key_id })?;
        let public_key =
            EventPublicKey::from_bytes(&bytes).map_err(|source| DtoError::InvalidPublicKey {
                key_id: dto.key_id,
                source,
            })?;
        Ok(Self {
            key_id: KeyId::new(dto.key_id),
            public_key,
            status: dto.status.into(),
        })
    }
}

impl TryFrom<&DoorEventDto> for EventVerifier {
    type Error = DtoError;

    fn try_from(dto: &DoorEventDto) -> Result<Self, Self::Error> {
        let event_id: EventId = dto.event_id.parse().map_err(|_| DtoError::InvalidEventId)?;
        let keys = dto
            .keys
            .iter()
            .map(EventKey::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self::new(event_id, EventTag::new(dto.event_tag), keys)?)
    }
}

impl From<VoidReason> for VoidReasonDto {
    fn from(reason: VoidReason) -> Self {
        match reason {
            VoidReason::Unsold => Self::Unsold,
            VoidReason::Lost => Self::Lost,
            VoidReason::Revoked => Self::Revoked,
        }
    }
}

impl From<VoidReasonDto> for VoidReason {
    fn from(reason: VoidReasonDto) -> Self {
        match reason {
            VoidReasonDto::Unsold => Self::Unsold,
            VoidReasonDto::Lost => Self::Lost,
            VoidReasonDto::Revoked => Self::Revoked,
        }
    }
}

impl From<&VoidRange> for VoidRangeDto {
    fn from(range: &VoidRange) -> Self {
        Self {
            first: range.first().get(),
            last: range.last().get(),
            reason: range.reason().into(),
        }
    }
}

impl TryFrom<&VoidRangeDto> for VoidRange {
    type Error = DtoError;

    fn try_from(dto: &VoidRangeDto) -> Result<Self, Self::Error> {
        let first = TicketNumber::new(dto.first).ok_or(DtoError::ZeroTicketNumber)?;
        let last = TicketNumber::new(dto.last).ok_or(DtoError::ZeroTicketNumber)?;
        Ok(Self::new(first, last, dto.reason.into())?)
    }
}

impl TryFrom<&EntryDto> for (TicketNumber, EntryInfo) {
    type Error = DtoError;

    fn try_from(dto: &EntryDto) -> Result<Self, Self::Error> {
        let number = TicketNumber::new(dto.number).ok_or(DtoError::ZeroTicketNumber)?;
        Ok((
            number,
            EntryInfo {
                at_unix_ms: dto.at_unix_ms,
                device_name: dto.device_name.clone(),
            },
        ))
    }
}

impl From<&EntryInfo> for FirstEntryDto {
    fn from(entry: &EntryInfo) -> Self {
        Self {
            at_unix_ms: entry.at_unix_ms,
            device_name: entry.device_name.clone(),
        }
    }
}

impl From<&Decision> for DecisionDto {
    fn from(decision: &Decision) -> Self {
        match decision {
            Decision::Admit { number } => Self::Admit {
                number: number.get(),
            },
            Decision::AlreadyEntered {
                number,
                first_entry,
            } => Self::AlreadyEntered {
                number: number.get(),
                first_entry: first_entry.into(),
            },
            Decision::Voided { number, reason } => Self::Voided {
                number: number.get(),
                reason: (*reason).into(),
            },
            Decision::OtherEvent { event_tag } => Self::OtherEvent {
                event_tag: event_tag.get(),
            },
            Decision::Invalid(reason) => Self::Invalid {
                reason: match reason {
                    InvalidReason::Malformed(_) => InvalidReasonDto::Malformed,
                    InvalidReason::UnknownKey(_) => InvalidReasonDto::UnknownKey,
                    InvalidReason::RevokedKey(_) => InvalidReasonDto::RevokedKey,
                    InvalidReason::BadSignature => InvalidReasonDto::BadSignature,
                },
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decision_json_shape() {
        let dto = DecisionDto::AlreadyEntered {
            number: 42,
            first_entry: FirstEntryDto {
                at_unix_ms: 1_767_225_600_000,
                device_name: "Porta 1".to_owned(),
            },
        };
        let json = serde_json::to_value(&dto).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "kind": "already_entered",
                "number": 42,
                "firstEntry": { "atUnixMs": 1_767_225_600_000_i64, "deviceName": "Porta 1" }
            })
        );
        assert_eq!(serde_json::from_value::<DecisionDto>(json).unwrap(), dto);
    }

    #[test]
    fn invalid_decision_json_shape() {
        let json = serde_json::to_value(DecisionDto::Invalid {
            reason: InvalidReasonDto::BadSignature,
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "invalid", "reason": "bad_signature" })
        );
    }

    #[test]
    fn rejects_malformed_public_keys() {
        let dto = EventKeyDto {
            key_id: 3,
            public_key: "zz".repeat(32),
            status: KeyStatusDto::Active,
        };
        assert_eq!(
            EventKey::try_from(&dto),
            Err(DtoError::InvalidPublicKeyEncoding { key_id: 3 })
        );
        let short = EventKeyDto {
            public_key: "ab".repeat(31),
            ..dto
        };
        assert_eq!(
            EventKey::try_from(&short),
            Err(DtoError::InvalidPublicKeyEncoding { key_id: 3 })
        );
    }

    #[test]
    fn rejects_zero_and_inverted_void_ranges() {
        let zero = VoidRangeDto {
            first: 0,
            last: 3,
            reason: VoidReasonDto::Lost,
        };
        assert_eq!(VoidRange::try_from(&zero), Err(DtoError::ZeroTicketNumber));
        let inverted = VoidRangeDto { first: 4, ..zero };
        assert!(matches!(
            VoidRange::try_from(&inverted),
            Err(DtoError::VoidRange(_))
        ));
    }

    #[test]
    fn ignores_unknown_manifest_fields() {
        let json = serde_json::json!({
            "eventId": "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b",
            "eventTag": 1,
            "keys": [],
            "addedInAFutureVersion": true
        });
        assert!(serde_json::from_value::<DoorEventDto>(json).is_ok());
    }
}
