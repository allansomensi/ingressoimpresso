//! Door check-in decision (`docs/adr/0006-portaria-offline-sync.md`).
//!
//! The decision is local and instantaneous: it never waits for the network. It combines the
//! cryptographic verification with what the device knows about the event — voided ranges and
//! entries already recorded (its own and those synced from other devices).
//!
//! Duplicate detection is keyed by **ticket number**, never by QR bytes.

use std::collections::BTreeMap;
use std::collections::btree_map::Entry;

use thiserror::Error;

use crate::ids::{KeyId, TicketNumber};
use crate::payload::DecodeError;
use crate::verify::{EventVerifier, Rejection, VerifiedTicket};

/// Why a range of tickets was voided by the organizer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VoidReason {
    /// Returned unsold by the seller.
    Unsold,
    /// Lost or stolen.
    Lost,
    /// Voided for any other reason.
    Revoked,
}

/// Why a [`VoidRange`] cannot be built.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum VoidRangeError {
    /// `first` is greater than `last`.
    #[error("void range is empty: first {first} > last {last}")]
    Empty {
        /// First number of the range.
        first: TicketNumber,
        /// Last number of the range.
        last: TicketNumber,
    },
}

/// An inclusive range of voided ticket numbers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct VoidRange {
    first: TicketNumber,
    last: TicketNumber,
    reason: VoidReason,
}

impl VoidRange {
    /// Builds an inclusive range `first..=last`.
    ///
    /// # Errors
    ///
    /// Returns [`VoidRangeError::Empty`] if `first > last`.
    pub fn new(
        first: TicketNumber,
        last: TicketNumber,
        reason: VoidReason,
    ) -> Result<Self, VoidRangeError> {
        if first > last {
            return Err(VoidRangeError::Empty { first, last });
        }
        Ok(Self {
            first,
            last,
            reason,
        })
    }

    /// First voided number.
    pub const fn first(&self) -> TicketNumber {
        self.first
    }

    /// Last voided number (inclusive).
    pub const fn last(&self) -> TicketNumber {
        self.last
    }

    /// Why the range was voided.
    pub const fn reason(&self) -> VoidReason {
        self.reason
    }

    /// Whether `number` falls in the range.
    pub fn contains(&self, number: TicketNumber) -> bool {
        self.first <= number && number <= self.last
    }
}

/// The first recorded entry of a ticket.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EntryInfo {
    /// When it entered, in Unix milliseconds (device clock corrected by the server offset).
    pub at_unix_ms: i64,
    /// Human name of the device that admitted it ("Porta 1 - João").
    pub device_name: String,
}

impl EntryInfo {
    /// Total order used to pick the first entry deterministically on every device: earliest
    /// time wins, ties broken by device name.
    fn precedes(&self, other: &Self) -> bool {
        (self.at_unix_ms, &self.device_name) < (other.at_unix_ms, &other.device_name)
    }
}

/// What a door device knows about the event besides its keys.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DoorState {
    voids: Vec<VoidRange>,
    entries: BTreeMap<TicketNumber, EntryInfo>,
}

impl DoorState {
    /// An empty state: nothing voided, nobody in.
    pub fn new() -> Self {
        Self::default()
    }

    /// Replaces all voids. The server always sends the full list; when ranges overlap, the
    /// first one in the list determines the reason shown.
    pub fn replace_voids(&mut self, voids: Vec<VoidRange>) {
        self.voids = voids;
    }

    /// Records an entry (local or synced from another device). Converges regardless of arrival
    /// order: only the earliest entry per ticket is kept (see [`EntryInfo`]).
    ///
    /// Returns `true` if this entry became the ticket's first entry.
    pub fn record_entry(&mut self, number: TicketNumber, entry: EntryInfo) -> bool {
        match self.entries.entry(number) {
            Entry::Vacant(slot) => {
                slot.insert(entry);
                true
            }
            Entry::Occupied(mut slot) => {
                if entry.precedes(slot.get()) {
                    slot.insert(entry);
                    true
                } else {
                    false
                }
            }
        }
    }

    /// The void that applies to `number`, if any.
    pub fn void_for(&self, number: TicketNumber) -> Option<&VoidRange> {
        self.voids.iter().find(|range| range.contains(number))
    }

    /// The first entry of `number`, if it already entered.
    pub fn entry_for(&self, number: TicketNumber) -> Option<&EntryInfo> {
        self.entries.get(&number)
    }

    /// How many distinct tickets have entered.
    pub fn entry_count(&self) -> usize {
        self.entries.len()
    }

    /// Decides what to do with a verification result, given this state.
    ///
    /// Precedence for authentic tickets: voided, then already entered, then admit.
    pub fn decide(&self, verification: Result<VerifiedTicket, Rejection>) -> Decision {
        let ticket = match verification {
            Ok(ticket) => ticket,
            Err(rejection) => return Decision::from(rejection),
        };
        let number = ticket.number();
        if let Some(void) = self.void_for(number) {
            return Decision::Voided {
                number,
                reason: void.reason(),
            };
        }
        if let Some(first_entry) = self.entry_for(number) {
            return Decision::AlreadyEntered {
                number,
                first_entry: first_entry.clone(),
            };
        }
        Decision::Admit { number }
    }
}

/// Why a scan is not even an authentic ticket of this event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidReason {
    /// Not one of our QR codes, damaged or truncated.
    Malformed(DecodeError),
    /// Signed with a key id this event does not have.
    UnknownKey(KeyId),
    /// Signed with a revoked key.
    RevokedKey(KeyId),
    /// Forged or tampered.
    BadSignature,
}

/// The outcome shown at the door.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    /// Green: let the person in.
    Admit {
        /// Ticket number.
        number: TicketNumber,
    },
    /// Red: a copy, or a second attempt with the same ticket.
    AlreadyEntered {
        /// Ticket number.
        number: TicketNumber,
        /// When and where it first entered.
        first_entry: EntryInfo,
    },
    /// Red: the organizer voided this ticket.
    Voided {
        /// Ticket number.
        number: TicketNumber,
        /// Why it was voided.
        reason: VoidReason,
    },
    /// Yellow: a genuine-looking ticket of a different event.
    OtherEvent {
        /// The tag found in the QR.
        event_tag: crate::ids::EventTag,
    },
    /// Red: not an authentic ticket.
    Invalid(InvalidReason),
}

impl Decision {
    /// Whether the person may enter.
    pub const fn is_admit(&self) -> bool {
        matches!(self, Self::Admit { .. })
    }
}

impl From<Rejection> for Decision {
    fn from(rejection: Rejection) -> Self {
        match rejection {
            Rejection::Malformed(error) => Self::Invalid(InvalidReason::Malformed(error)),
            Rejection::OtherEvent(event_tag) => Self::OtherEvent { event_tag },
            Rejection::UnknownKey(key_id) => Self::Invalid(InvalidReason::UnknownKey(key_id)),
            Rejection::RevokedKey(key_id) => Self::Invalid(InvalidReason::RevokedKey(key_id)),
            Rejection::BadSignature => Self::Invalid(InvalidReason::BadSignature),
        }
    }
}

/// A door device: an event verifier plus the device's view of voids and entries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Door {
    verifier: EventVerifier,
    state: DoorState,
}

impl Door {
    /// Creates a door with an empty state.
    pub fn new(verifier: EventVerifier) -> Self {
        Self {
            verifier,
            state: DoorState::new(),
        }
    }

    /// The event verifier.
    pub const fn verifier(&self) -> &EventVerifier {
        &self.verifier
    }

    /// The current state.
    pub const fn state(&self) -> &DoorState {
        &self.state
    }

    /// Mutable access to the state, to apply synced voids and entries.
    pub fn state_mut(&mut self) -> &mut DoorState {
        &mut self.state
    }

    /// Evaluates a scan **without** recording anything.
    pub fn evaluate(&self, qr_text: &str) -> Decision {
        self.state.decide(self.verifier.verify_qr_text(qr_text))
    }

    /// Evaluates a scan and, if admitted, records the entry in the same step, so that a second
    /// scan of the same ticket on this device can never be admitted too.
    pub fn check_in(&mut self, qr_text: &str, entry: EntryInfo) -> Decision {
        let decision = self.evaluate(qr_text);
        if let Decision::Admit { number } = decision {
            self.state.record_entry(number, entry);
        }
        decision
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn number(value: u32) -> TicketNumber {
        TicketNumber::new(value).unwrap()
    }

    fn entry(at_unix_ms: i64, device_name: &str) -> EntryInfo {
        EntryInfo {
            at_unix_ms,
            device_name: device_name.to_owned(),
        }
    }

    #[test]
    fn void_range_is_inclusive() {
        let range = VoidRange::new(number(10), number(20), VoidReason::Lost).unwrap();
        assert!(!range.contains(number(9)));
        assert!(range.contains(number(10)));
        assert!(range.contains(number(20)));
        assert!(!range.contains(number(21)));
    }

    #[test]
    fn void_range_rejects_inverted_bounds() {
        assert_eq!(
            VoidRange::new(number(5), number(4), VoidReason::Unsold),
            Err(VoidRangeError::Empty {
                first: number(5),
                last: number(4)
            })
        );
        assert!(VoidRange::new(number(5), number(5), VoidReason::Unsold).is_ok());
    }

    #[test]
    fn first_overlapping_void_wins() {
        let mut state = DoorState::new();
        state.replace_voids(vec![
            VoidRange::new(number(1), number(10), VoidReason::Lost).unwrap(),
            VoidRange::new(number(5), number(15), VoidReason::Unsold).unwrap(),
        ]);
        assert_eq!(
            state.void_for(number(7)).map(VoidRange::reason),
            Some(VoidReason::Lost)
        );
        assert_eq!(
            state.void_for(number(12)).map(VoidRange::reason),
            Some(VoidReason::Unsold)
        );
        assert_eq!(state.void_for(number(16)), None);
    }

    #[test]
    fn earliest_entry_wins_regardless_of_arrival_order() {
        let mut forward = DoorState::new();
        assert!(forward.record_entry(number(1), entry(100, "Porta 2")));
        assert!(!forward.record_entry(number(1), entry(200, "Porta 1")));

        let mut backward = DoorState::new();
        assert!(backward.record_entry(number(1), entry(200, "Porta 1")));
        assert!(backward.record_entry(number(1), entry(100, "Porta 2")));

        assert_eq!(forward, backward);
        assert_eq!(forward.entry_for(number(1)), Some(&entry(100, "Porta 2")));
    }

    #[test]
    fn entry_ties_are_broken_by_device_name() {
        let mut state = DoorState::new();
        state.record_entry(number(1), entry(100, "Porta B"));
        state.record_entry(number(1), entry(100, "Porta A"));
        assert_eq!(state.entry_for(number(1)), Some(&entry(100, "Porta A")));
        assert_eq!(state.entry_count(), 1);
    }

    #[test]
    fn rejections_map_to_decisions() {
        assert_eq!(
            Decision::from(Rejection::BadSignature),
            Decision::Invalid(InvalidReason::BadSignature)
        );
        assert_eq!(
            Decision::from(Rejection::OtherEvent(crate::ids::EventTag::new(3))),
            Decision::OtherEvent {
                event_tag: crate::ids::EventTag::new(3)
            }
        );
    }
}
