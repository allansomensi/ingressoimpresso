//! QR codes as compact vector SVG (one path), so they stay sharp on any printer.

use std::fmt::Write as _;

use qrcodegen::{QrCode, QrCodeEcc, QrSegment, Version};
use thiserror::Error;

/// Quiet zone in modules on each side (ISO/IEC 18004 minimum).
pub(crate) const QUIET_ZONE: i32 = 4;

/// The text does not fit in a QR code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
#[error("text too long for a QR code")]
pub struct QrError;

/// Encodes `text` with error correction M (ADR 0003) and returns an SVG whose view box includes
/// the white quiet zone. `qrcodegen` picks the alphanumeric mode for ticket texts.
pub(crate) fn svg(text: &str) -> Result<String, QrError> {
    let segments = QrSegment::make_segments(text);
    let code = QrCode::encode_segments_advanced(
        &segments,
        QrCodeEcc::Medium,
        Version::MIN,
        Version::MAX,
        None,
        false,
    )
    .map_err(|_| QrError)?;
    let modules = code.size();
    let view = modules + 2 * QUIET_ZONE;
    let mut path = String::new();
    for y in 0..modules {
        let mut x = 0;
        while x < modules {
            if code.get_module(x, y) {
                let start = x;
                while x < modules && code.get_module(x, y) {
                    x += 1;
                }
                let run = x - start;
                write!(
                    path,
                    "M{} {}h{run}v1h-{run}z",
                    start + QUIET_ZONE,
                    y + QUIET_ZONE
                )
                .map_err(|_| QrError)?;
            } else {
                x += 1;
            }
        }
    }
    Ok(format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {view} {view}\" shape-rendering=\"crispEdges\">\
         <rect width=\"{view}\" height=\"{view}\" fill=\"#fff\"/><path fill=\"#000\" d=\"{path}\"/></svg>"
    ))
}

/// QR version (1–40) chosen for `text`.
#[cfg(test)]
fn version(text: &str) -> Result<u8, QrError> {
    let segments = QrSegment::make_segments(text);
    QrCode::encode_segments_advanced(
        &segments,
        QrCodeEcc::Medium,
        Version::MIN,
        Version::MAX,
        None,
        false,
    )
    .map(|code| code.version().value())
    .map_err(|_| QrError)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticket_texts_use_version_5() {
        // 111 alphanumeric characters at ECC M fit version 5 (capacity 122). Real tickets mix
        // letters and digits; an all-digit text would use the denser numeric mode instead.
        let issuer = ticket_core::TicketIssuer::new(
            ticket_core::EventId::from_bytes([1; 16]),
            ticket_core::EventTag::new(2),
            ticket_core::KeyId::new(3),
            ticket_core::EventSigningKey::from_seed(&[4; 32]),
        );
        for number in [1, 42, u32::MAX] {
            let text = issuer
                .issue(ticket_core::TicketNumber::new(number).unwrap())
                .to_qr_text();
            assert_eq!(version(&text), Ok(5));
        }
        assert_eq!(version(&"A".repeat(ticket_core::QR_TEXT_LEN)), Ok(5));
        // Previews must look like the real thing.
        assert_eq!(version(&crate::sample_qr_text()), Ok(5));
    }

    #[test]
    fn svg_has_quiet_zone_and_one_path() {
        let svg = svg("HELLO").unwrap();
        // Version 1 = 21 modules + 2·4 quiet zone.
        assert!(svg.contains("viewBox=\"0 0 29 29\""));
        assert_eq!(svg.matches("<path").count(), 1);
    }
}
