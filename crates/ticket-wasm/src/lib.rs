//! WebAssembly bindings of `ticket-core` for the door app.
//!
//! Only verification and the check-in decision are exposed. The `signing` feature of
//! `ticket-core` is never enabled for this crate, so private keys cannot exist on a door device.
//!
//! Values cross the boundary as plain JS objects shaped like the DTOs in `ticket_core::dto`,
//! whose TypeScript types are generated into `packages/ticket-core-wasm/src/generated/`.

use serde::Serialize;
use serde::de::DeserializeOwned;
use ticket_core::dto::{DecisionDto, DoorEventDto, EntryDto, VoidRangeDto};
use ticket_core::{
    Decision, Door, EntryInfo, EventVerifier, FORMAT_VERSION_V1, TicketNumber, VoidRange,
};
use wasm_bindgen::prelude::*;

/// Largest integer a JS number represents exactly (2^53 − 1).
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// A door device: event verifier plus known voids and entries.
#[wasm_bindgen]
#[derive(Debug)]
pub struct DoorCore {
    door: Door,
}

#[wasm_bindgen]
impl DoorCore {
    /// Creates a door for one event from a `DoorEventDto`.
    ///
    /// # Errors
    ///
    /// Throws if the object does not match `DoorEventDto` or holds an invalid event id or key.
    #[wasm_bindgen(constructor)]
    #[allow(
        clippy::needless_pass_by_value,
        reason = "wasm-bindgen passes JS values by value"
    )]
    pub fn new(event: JsValue) -> Result<DoorCore, JsError> {
        let dto: DoorEventDto = from_js(event)?;
        let verifier = EventVerifier::try_from(&dto)?;
        Ok(Self {
            door: Door::new(verifier),
        })
    }

    /// Replaces all voided ranges with a `VoidRangeDto[]`.
    ///
    /// # Errors
    ///
    /// Throws if any range is malformed; the previous voids are kept in that case.
    #[wasm_bindgen(js_name = replaceVoids)]
    #[allow(
        clippy::needless_pass_by_value,
        reason = "wasm-bindgen passes JS values by value"
    )]
    pub fn replace_voids(&mut self, voids: JsValue) -> Result<(), JsError> {
        let dtos: Vec<VoidRangeDto> = from_js(voids)?;
        let voids = dtos
            .iter()
            .map(VoidRange::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        self.door.state_mut().replace_voids(voids);
        Ok(())
    }

    /// Records entries (`EntryDto[]`), local or synced from other devices. Returns how many of
    /// them became the first entry of their ticket.
    ///
    /// # Errors
    ///
    /// Throws if any entry is malformed; no entry is recorded in that case.
    #[wasm_bindgen(js_name = recordEntries)]
    #[allow(
        clippy::needless_pass_by_value,
        reason = "wasm-bindgen passes JS values by value"
    )]
    pub fn record_entries(&mut self, entries: JsValue) -> Result<u32, JsError> {
        let dtos: Vec<EntryDto> = from_js(entries)?;
        let entries = dtos
            .iter()
            .map(<(TicketNumber, EntryInfo)>::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        let state = self.door.state_mut();
        let mut first_entries: u32 = 0;
        for (number, entry) in entries {
            if state.record_entry(number, entry) {
                first_entries = first_entries.saturating_add(1);
            }
        }
        Ok(first_entries)
    }

    /// Evaluates a scan without recording anything. Returns a `DecisionDto`.
    ///
    /// # Errors
    ///
    /// Throws only if the decision cannot be converted to a JS value.
    pub fn evaluate(&self, qr_text: &str) -> Result<JsValue, JsError> {
        to_js(&self.door.evaluate(qr_text))
    }

    /// Evaluates a scan and, if admitted, records the entry atomically. Returns a `DecisionDto`.
    ///
    /// # Errors
    ///
    /// Throws if `atUnixMs` is not a safe integer.
    #[wasm_bindgen(js_name = checkIn)]
    pub fn check_in(
        &mut self,
        qr_text: &str,
        at_unix_ms: f64,
        device_name: String,
    ) -> Result<JsValue, JsError> {
        let entry = EntryInfo {
            at_unix_ms: unix_ms_from_js(at_unix_ms)?,
            device_name,
        };
        to_js(&self.door.check_in(qr_text, entry))
    }

    /// How many distinct tickets have entered.
    #[wasm_bindgen(js_name = entryCount)]
    pub fn entry_count(&self) -> u32 {
        u32::try_from(self.door.state().entry_count()).unwrap_or(u32::MAX)
    }
}

/// The ticket format version this build understands.
#[wasm_bindgen(js_name = formatVersion)]
pub fn format_version() -> u8 {
    FORMAT_VERSION_V1
}

fn from_js<T: DeserializeOwned>(value: JsValue) -> Result<T, JsError> {
    serde_wasm_bindgen::from_value(value).map_err(|error| JsError::new(&error.to_string()))
}

fn to_js(decision: &Decision) -> Result<JsValue, JsError> {
    DecisionDto::from(decision)
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| JsError::new(&error.to_string()))
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "the value is checked to be an integer within ±(2^53 − 1), which i64 holds exactly"
)]
fn unix_ms_from_js(value: f64) -> Result<i64, JsError> {
    if value.is_finite() && value.fract() == 0.0 && value.abs() <= MAX_SAFE_INTEGER {
        Ok(value as i64)
    } else {
        Err(JsError::new("atUnixMs must be a safe integer"))
    }
}
