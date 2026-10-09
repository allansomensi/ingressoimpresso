//! Ticket design specification (versioned, immutable once used by a batch).
//!
//! All coordinates are millimetres relative to the top-left corner of the ticket **body** (the
//! part with the art, excluding the stub). The art always covers the body plus [`BLEED_MM`] on
//! every side, so home, print-shop and image outputs show exactly the same trim area.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Current design format version.
pub const DESIGN_VERSION: u8 = 1;
/// Bleed added around the body for print-shop output; the art must cover it.
pub const BLEED_MM: f64 = 3.0;
/// Smallest QR side (quiet zone included): 45 modules at about 0.5 mm (ADR 0003).
pub const MIN_QR_SIZE_MM: f64 = 22.0;

const BODY_WIDTH_MM: (f64, f64) = (40.0, 300.0);
const BODY_HEIGHT_MM: (f64, f64) = (20.0, 200.0);
const STUB_WIDTH_MM: (f64, f64) = (20.0, 120.0);
const NUMBER_SIZE_PT: (f64, f64) = (4.0, 300.0);
const MAX_DIGITS: u8 = 10;
const MAX_PREFIX_CHARS: usize = 12;
const MAX_STUB_FIELDS: usize = 4;
const MAX_STUB_FIELD_CHARS: usize = 24;
/// Stub height without fields: insets, number line and two lines of event name (ticket.typ).
const STUB_BASE_HEIGHT_MM: f64 = 15.1;
/// Height of each stub field: gap, label and room to write by hand above the line.
const STUB_FIELD_HEIGHT_MM: f64 = 7.6;
const MAX_TEXT_BLOCKS: usize = 8;
const MAX_TEXT_CHARS: usize = 200;
const TEXT_SIZE_PT: (f64, f64) = (3.0, 200.0);
const MAX_TEXT_LINES: u8 = 4;
const LETTER_SPACING_EM: (f64, f64) = (-0.1, 1.0);

/// A ticket design.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct TicketDesign {
    /// Always [`DESIGN_VERSION`].
    pub version: u8,
    /// Body width (trim, without stub).
    pub width_mm: f64,
    /// Body height (trim).
    pub height_mm: f64,
    /// Background colour under the art (`#rrggbb`).
    pub background_color: String,
    /// Ticket number box.
    pub number: NumberStyle,
    /// QR code square (quiet zone included).
    pub qr: QrPlacement,
    /// Optional numbered stub (canhoto), attached by a perforation.
    pub stub: Option<StubStyle>,
    /// Texts printed on the body, under the number and the QR. Designs saved before text
    /// blocks existed have none.
    #[serde(default)]
    pub texts: Vec<TextBlock>,
}

/// A box of text on the body. `{evento}`, `{data}` and the other fields of
/// [`crate::fields::FIELDS`] are replaced by the event's details when printing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct TextBlock {
    /// Text, possibly with fields such as `{evento}`.
    pub text: String,
    /// Box left edge.
    pub x_mm: f64,
    /// Box top edge.
    pub y_mm: f64,
    /// Box width.
    pub width_mm: f64,
    /// Box height.
    pub height_mm: f64,
    /// Typeface.
    pub font: FontChoice,
    /// Font size in points; the text shrinks to fit its box.
    pub size_pt: f64,
    /// Text colour (`#rrggbb`).
    pub color: String,
    /// Horizontal alignment inside the box (always vertically centred).
    pub align: TextAlign,
    /// Most lines before the text is cut with "…"; 1 keeps it on a single line.
    pub lines: u8,
    /// Bold weight (typefaces with a bold variant).
    pub bold: bool,
    /// Printed in capitals.
    pub uppercase: bool,
    /// Extra space between letters, in em.
    pub letter_spacing: f64,
}

/// Where and how the ticket number is printed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct NumberStyle {
    /// Box left edge.
    pub x_mm: f64,
    /// Box top edge.
    pub y_mm: f64,
    /// Box width.
    pub width_mm: f64,
    /// Box height.
    pub height_mm: f64,
    /// Typeface.
    pub font: FontChoice,
    /// Font size in points.
    pub size_pt: f64,
    /// Text colour (`#rrggbb`).
    pub color: String,
    /// Horizontal alignment inside the box (always vertically centred).
    pub align: TextAlign,
    /// Text before the number, e.g. `"Nº "`.
    pub prefix: String,
    /// Minimum digits (zero padded).
    pub digits: u8,
}

/// Embedded typefaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum FontChoice {
    /// Bebas Neue: condensed display capitals.
    Display,
    /// Space Mono: monospaced, numbers do not shift.
    Mono,
    /// Lato: neutral sans serif.
    Sans,
    /// Anton: heavy condensed capitals (sports, rock).
    Condensed,
    /// Abril Fatface: high-contrast display serif (theatre, galas).
    Serif,
    /// Great Vibes: formal script (weddings, graduations).
    Script,
    /// Pacifico: casual brush script (parties, kids).
    Casual,
    /// Alfa Slab One: bold slab serif (festa junina, country).
    Slab,
}

/// Horizontal alignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum TextAlign {
    /// Left.
    Left,
    /// Centre.
    Center,
    /// Right.
    Right,
}

/// QR square position. The square includes the white quiet zone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct QrPlacement {
    /// Left edge.
    pub x_mm: f64,
    /// Top edge.
    pub y_mm: f64,
    /// Side length.
    pub size_mm: f64,
}

/// Stub (canhoto) kept by the seller, separated by a perforation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct StubStyle {
    /// Side of the body where the stub is attached.
    pub side: StubSide,
    /// Stub width.
    pub width_mm: f64,
    /// Blank fields to fill by hand, e.g. `["Nome", "Telefone"]`.
    pub fields: Vec<String>,
}

/// Stub side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum StubSide {
    /// Left of the body.
    Left,
    /// Right of the body.
    Right,
}

/// A problem with a design. The web editor maps these to Portuguese messages.
#[derive(Debug, Clone, PartialEq, Error)]
pub enum DesignIssue {
    /// Unknown design version.
    #[error("unsupported design version {0}")]
    UnsupportedVersion(u8),
    /// Body size outside the supported range.
    #[error("ticket body must be {min_w}–{max_w} mm wide and {min_h}–{max_h} mm tall")]
    BodySize {
        /// Minimum width.
        min_w: f64,
        /// Maximum width.
        max_w: f64,
        /// Minimum height.
        min_h: f64,
        /// Maximum height.
        max_h: f64,
    },
    /// A box is not entirely inside the body.
    #[error("{element} must lie entirely inside the ticket")]
    OutOfBounds {
        /// `"number"`, `"qr"` or `"text"`.
        element: &'static str,
    },
    /// Too many text blocks, or a text too long.
    #[error("a ticket accepts up to {max_blocks} texts of up to {max_chars} characters")]
    Texts {
        /// Maximum number of blocks.
        max_blocks: usize,
        /// Maximum characters per block.
        max_chars: usize,
    },
    /// A text block's font size, lines or letter spacing outside the supported range.
    #[error(
        "texts must be {min_pt}–{max_pt} pt, 1–{max_lines} lines and {min_spacing}–{max_spacing} em apart"
    )]
    TextStyle {
        /// Minimum size.
        min_pt: f64,
        /// Maximum size.
        max_pt: f64,
        /// Maximum lines.
        max_lines: u8,
        /// Minimum letter spacing.
        min_spacing: f64,
        /// Maximum letter spacing.
        max_spacing: f64,
    },
    /// QR smaller than the minimum.
    #[error("QR code must be at least {min_mm} mm")]
    QrTooSmall {
        /// The minimum.
        min_mm: f64,
    },
    /// Number font size outside the supported range.
    #[error("number size must be {min}–{max} pt")]
    NumberSize {
        /// Minimum.
        min: f64,
        /// Maximum.
        max: f64,
    },
    /// Digits outside 1..=10.
    #[error("digits must be 1–{max}")]
    Digits {
        /// Maximum.
        max: u8,
    },
    /// Prefix too long.
    #[error("prefix must have at most {max} characters")]
    PrefixTooLong {
        /// Maximum.
        max: usize,
    },
    /// Not a `#rrggbb` colour.
    #[error("{field} must be a #rrggbb colour")]
    InvalidColor {
        /// The field.
        field: &'static str,
    },
    /// Stub width outside the supported range.
    #[error("stub must be {min}–{max} mm wide")]
    StubWidth {
        /// Minimum.
        min: f64,
        /// Maximum.
        max: f64,
    },
    /// Too many or too long stub fields.
    #[error("stub accepts up to {max_fields} fields of up to {max_chars} characters")]
    StubFields {
        /// Maximum number of fields.
        max_fields: usize,
        /// Maximum characters per field.
        max_chars: usize,
    },
    /// The ticket is too short for the stub's fields.
    #[error("a stub with these fields needs a ticket at least {min_height_mm} mm tall")]
    StubTooShort {
        /// Minimum ticket height for the current number of fields.
        min_height_mm: f64,
    },
}

impl TicketDesign {
    /// A sensible default: 150 × 55 mm body, number top-left, QR right, stub on the left.
    pub fn default_v1() -> Self {
        Self {
            version: DESIGN_VERSION,
            width_mm: 150.0,
            height_mm: 55.0,
            background_color: "#ffffff".to_owned(),
            number: NumberStyle {
                x_mm: 6.0,
                y_mm: 4.0,
                width_mm: 60.0,
                height_mm: 12.0,
                font: FontChoice::Display,
                size_pt: 24.0,
                color: "#111111".to_owned(),
                align: TextAlign::Left,
                prefix: "Nº ".to_owned(),
                digits: 4,
            },
            qr: QrPlacement {
                x_mm: 117.0,
                y_mm: 14.5,
                size_mm: 28.0,
            },
            stub: Some(StubStyle {
                side: StubSide::Left,
                width_mm: 40.0,
                fields: vec!["Nome".to_owned(), "Telefone".to_owned()],
            }),
            texts: Vec::new(),
        }
    }

    /// Stub width, or zero without a stub.
    pub fn stub_width_mm(&self) -> f64 {
        self.stub.as_ref().map_or(0.0, |stub| stub.width_mm)
    }

    /// Total trim width: body plus stub.
    pub fn total_width_mm(&self) -> f64 {
        self.width_mm + self.stub_width_mm()
    }

    /// Smallest ticket height that leaves room to write in every stub field, or `None`
    /// without a stub.
    pub fn stub_min_height_mm(&self) -> Option<f64> {
        #[expect(clippy::cast_precision_loss, reason = "at most a handful of fields")]
        self.stub.as_ref().map(|stub| {
            let height = STUB_BASE_HEIGHT_MM + STUB_FIELD_HEIGHT_MM * stub.fields.len() as f64;
            // Whole tenths of a millimetre, as shown in the editor.
            (height * 10.0).round() / 10.0
        })
    }

    /// The label printed for `number`, e.g. `"Nº 0042"`.
    pub fn number_label(&self, number: u32) -> String {
        let digits = usize::from(self.number.digits);
        format!("{}{number:0digits$}", self.number.prefix)
    }

    /// Checks every rule and returns all problems at once.
    ///
    /// # Errors
    ///
    /// Returns the list of [`DesignIssue`]s; empty lists are never returned as errors.
    pub fn validate(&self) -> Result<(), Vec<DesignIssue>> {
        let mut issues = Vec::new();
        if self.version != DESIGN_VERSION {
            issues.push(DesignIssue::UnsupportedVersion(self.version));
        }
        if !within(self.width_mm, BODY_WIDTH_MM) || !within(self.height_mm, BODY_HEIGHT_MM) {
            issues.push(DesignIssue::BodySize {
                min_w: BODY_WIDTH_MM.0,
                max_w: BODY_WIDTH_MM.1,
                min_h: BODY_HEIGHT_MM.0,
                max_h: BODY_HEIGHT_MM.1,
            });
        }
        if !is_hex_color(&self.background_color) {
            issues.push(DesignIssue::InvalidColor {
                field: "backgroundColor",
            });
        }
        self.validate_number(&mut issues);
        self.validate_qr(&mut issues);
        self.validate_texts(&mut issues);
        if let Some(stub) = &self.stub {
            if !within(stub.width_mm, STUB_WIDTH_MM) {
                issues.push(DesignIssue::StubWidth {
                    min: STUB_WIDTH_MM.0,
                    max: STUB_WIDTH_MM.1,
                });
            }
            if stub.fields.len() > MAX_STUB_FIELDS
                || stub
                    .fields
                    .iter()
                    .any(|field| field.chars().count() > MAX_STUB_FIELD_CHARS)
            {
                issues.push(DesignIssue::StubFields {
                    max_fields: MAX_STUB_FIELDS,
                    max_chars: MAX_STUB_FIELD_CHARS,
                });
            }
            if let Some(min_height_mm) = self.stub_min_height_mm()
                && self.height_mm < min_height_mm
            {
                issues.push(DesignIssue::StubTooShort { min_height_mm });
            }
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }

    fn validate_number(&self, issues: &mut Vec<DesignIssue>) {
        let number = &self.number;
        if !self.contains(number.x_mm, number.y_mm, number.width_mm, number.height_mm) {
            issues.push(DesignIssue::OutOfBounds { element: "number" });
        }
        if !within(number.size_pt, NUMBER_SIZE_PT) {
            issues.push(DesignIssue::NumberSize {
                min: NUMBER_SIZE_PT.0,
                max: NUMBER_SIZE_PT.1,
            });
        }
        if number.digits == 0 || number.digits > MAX_DIGITS {
            issues.push(DesignIssue::Digits { max: MAX_DIGITS });
        }
        if number.prefix.chars().count() > MAX_PREFIX_CHARS {
            issues.push(DesignIssue::PrefixTooLong {
                max: MAX_PREFIX_CHARS,
            });
        }
        if !is_hex_color(&number.color) {
            issues.push(DesignIssue::InvalidColor {
                field: "number.color",
            });
        }
    }

    fn validate_qr(&self, issues: &mut Vec<DesignIssue>) {
        let qr = &self.qr;
        if qr.size_mm.is_nan() || qr.size_mm < MIN_QR_SIZE_MM {
            issues.push(DesignIssue::QrTooSmall {
                min_mm: MIN_QR_SIZE_MM,
            });
        }
        if !self.contains(qr.x_mm, qr.y_mm, qr.size_mm, qr.size_mm) {
            issues.push(DesignIssue::OutOfBounds { element: "qr" });
        }
    }

    fn validate_texts(&self, issues: &mut Vec<DesignIssue>) {
        let texts = &self.texts;
        if texts.len() > MAX_TEXT_BLOCKS
            || texts
                .iter()
                .any(|block| block.text.chars().count() > MAX_TEXT_CHARS)
        {
            issues.push(DesignIssue::Texts {
                max_blocks: MAX_TEXT_BLOCKS,
                max_chars: MAX_TEXT_CHARS,
            });
        }
        if texts
            .iter()
            .any(|b| !self.contains(b.x_mm, b.y_mm, b.width_mm, b.height_mm))
        {
            issues.push(DesignIssue::OutOfBounds { element: "text" });
        }
        if texts.iter().any(|b| {
            !within(b.size_pt, TEXT_SIZE_PT)
                || b.lines == 0
                || b.lines > MAX_TEXT_LINES
                || !within(b.letter_spacing, LETTER_SPACING_EM)
        }) {
            issues.push(DesignIssue::TextStyle {
                min_pt: TEXT_SIZE_PT.0,
                max_pt: TEXT_SIZE_PT.1,
                max_lines: MAX_TEXT_LINES,
                min_spacing: LETTER_SPACING_EM.0,
                max_spacing: LETTER_SPACING_EM.1,
            });
        }
        if texts.iter().any(|b| !is_hex_color(&b.color)) {
            issues.push(DesignIssue::InvalidColor {
                field: "texts.color",
            });
        }
    }

    /// Whether the box lies inside the body. Rejects NaN and infinities.
    fn contains(&self, x: f64, y: f64, width: f64, height: f64) -> bool {
        [x, y, width, height].iter().all(|value| value.is_finite())
            && x >= 0.0
            && y >= 0.0
            && width > 0.0
            && height > 0.0
            && x + width <= self.width_mm + 1e-9
            && y + height <= self.height_mm + 1e-9
    }
}

fn within(value: f64, (min, max): (f64, f64)) -> bool {
    value.is_finite() && value >= min && value <= max
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.chars().skip(1).all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_design_is_valid() {
        assert_eq!(TicketDesign::default_v1().validate(), Ok(()));
    }

    #[test]
    fn number_label_is_zero_padded() {
        let design = TicketDesign::default_v1();
        assert_eq!(design.number_label(42), "Nº 0042");
        assert_eq!(design.number_label(123_456), "Nº 123456");
    }

    #[test]
    fn rejects_small_or_misplaced_qr() {
        let mut design = TicketDesign::default_v1();
        design.qr.size_mm = 20.0;
        design.qr.x_mm = 140.0;
        let issues = design.validate().unwrap_err();
        assert!(issues.contains(&DesignIssue::QrTooSmall {
            min_mm: MIN_QR_SIZE_MM
        }));
        assert!(issues.contains(&DesignIssue::OutOfBounds { element: "qr" }));
    }

    #[test]
    fn rejects_non_finite_values() {
        let mut design = TicketDesign::default_v1();
        design.qr.size_mm = f64::NAN;
        design.number.x_mm = f64::INFINITY;
        design.width_mm = f64::NAN;
        let issues = design.validate().unwrap_err();
        assert!(issues.contains(&DesignIssue::QrTooSmall {
            min_mm: MIN_QR_SIZE_MM
        }));
        assert!(issues.contains(&DesignIssue::OutOfBounds { element: "number" }));
        assert!(
            issues
                .iter()
                .any(|issue| matches!(issue, DesignIssue::BodySize { .. }))
        );
    }

    #[test]
    fn rejects_bad_colors_and_text_limits() {
        let mut design = TicketDesign::default_v1();
        design.background_color = "white".to_owned();
        design.number.color = "#12345g".to_owned();
        design.number.prefix = "Ingresso número ".to_owned();
        design.number.digits = 0;
        let issues = design.validate().unwrap_err();
        assert_eq!(issues.len(), 4, "{issues:?}");
    }

    #[test]
    fn rejects_bad_stub() {
        let mut design = TicketDesign::default_v1();
        design.stub = Some(StubStyle {
            side: StubSide::Right,
            width_mm: 10.0,
            fields: vec!["a".to_owned(); 5],
        });
        assert_eq!(design.validate().unwrap_err().len(), 2);
    }

    #[test]
    fn stub_fields_need_height() {
        let mut design = TicketDesign::default_v1();
        design.height_mm = 30.0;
        design.qr.y_mm = 1.0;
        // Two fields need 15.1 + 2 × 7.6 = 30.3 mm.
        assert_eq!(
            design.validate(),
            Err(vec![DesignIssue::StubTooShort {
                min_height_mm: 30.3
            }])
        );
        if let Some(stub) = design.stub.as_mut() {
            stub.fields.pop();
        }
        assert_eq!(design.validate(), Ok(()));
    }

    fn text(text: &str) -> TextBlock {
        TextBlock {
            text: text.to_owned(),
            x_mm: 6.0,
            y_mm: 20.0,
            width_mm: 100.0,
            height_mm: 12.0,
            font: FontChoice::Serif,
            size_pt: 20.0,
            color: "#222222".to_owned(),
            align: TextAlign::Left,
            lines: 2,
            bold: false,
            uppercase: false,
            letter_spacing: 0.0,
        }
    }

    #[test]
    fn accepts_text_blocks() {
        let mut design = TicketDesign::default_v1();
        design.texts = vec![text("{evento}"), text("{data_extenso} · {hora}")];
        assert_eq!(design.validate(), Ok(()));
    }

    #[test]
    fn rejects_bad_text_blocks() {
        let mut design = TicketDesign::default_v1();
        let mut outside = text("Fora");
        outside.x_mm = 100.0;
        let mut huge = text("Grande");
        huge.size_pt = 500.0;
        huge.lines = 0;
        let mut colorless = text("Sem cor");
        colorless.color = "red".to_owned();
        design.texts = vec![outside, huge, colorless, text(&"x".repeat(201))];
        let issues = design.validate().unwrap_err();
        assert_eq!(issues.len(), 4, "{issues:?}");
        assert!(issues.contains(&DesignIssue::OutOfBounds { element: "text" }));
        design.texts = vec![text("a"); 9];
        assert!(matches!(
            design.validate().unwrap_err().as_slice(),
            [DesignIssue::Texts { .. }]
        ));
    }

    #[test]
    fn designs_without_texts_still_load() {
        let mut json = serde_json::to_value(TicketDesign::default_v1()).unwrap();
        json.as_object_mut().unwrap().remove("texts");
        let design: TicketDesign = serde_json::from_value(json).unwrap();
        assert_eq!(design, TicketDesign::default_v1());
    }

    #[test]
    fn json_uses_camel_case_and_rejects_unknown_fields() {
        let json = serde_json::to_value(TicketDesign::default_v1()).unwrap();
        assert_eq!(json["widthMm"], 150.0);
        assert_eq!(json["number"]["font"], "display");
        let mut with_typo = json;
        with_typo["widthMM"] = serde_json::json!(1);
        assert!(serde_json::from_value::<TicketDesign>(with_typo).is_err());
    }
}
