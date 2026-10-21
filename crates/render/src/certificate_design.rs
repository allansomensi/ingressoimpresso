//! Certificate design (ADR 0114): an A4 page, landscape or portrait, with an optional back, each
//! with a background, a frame and elements the organizer places by dragging, like the ticket's
//! (texts with fields, logos, signatures, the QR, lines, shapes and a seal).
//!
//! Coordinates are millimetres from the top-left corner of the page. The panel mirrors every rule
//! (`apps/web/src/lib/certificate-design.ts`) for the live preview and its messages.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::design::{FontChoice, is_hex_color, within};

/// Current certificate design format.
pub const CERTIFICATE_DESIGN_VERSION: u8 = 1;
/// Most elements on one side.
pub const MAX_PAGE_ELEMENTS: usize = 40;
/// Most uploaded images (logos, signatures, backgrounds) of a certificate.
pub const MAX_CERTIFICATE_IMAGES: usize = 8;
/// Smallest QR side: it holds a link of about 80 characters, read by a phone at arm's length.
pub const MIN_CERTIFICATE_QR_MM: f64 = 18.0;
const MAX_TITLE_CHARS: usize = 60;
const MAX_TEXT_CHARS: usize = 1500;
const TEXT_SIZE_PT: (f64, f64) = (4.0, 120.0);
const LINE_HEIGHT: (f64, f64) = (1.0, 3.0);
const LETTER_SPACING_EM: (f64, f64) = (-0.1, 1.0);
/// Smallest side of a box.
const MIN_BOX_MM: f64 = 1.0;
const MAX_SIGNER_NAME_CHARS: usize = 60;
const MAX_SIGNER_ROLE_CHARS: usize = 80;
const SIGNATURE_SIZE_PT: (f64, f64) = (5.0, 40.0);
const SEAL_SIZE_MM: (f64, f64) = (15.0, 90.0);
const MAX_SEAL_TEXT_CHARS: usize = 40;
const MAX_SEAL_CENTER_CHARS: usize = 16;
const LINE_THICKNESS_MM: (f64, f64) = (0.1, 5.0);
const SHAPE_RADIUS_MM: (f64, f64) = (0.0, 100.0);
const OPACITY: (f64, f64) = (0.05, 1.0);
const FRAME_MARGIN_MM: (f64, f64) = (0.0, 40.0);
const FRAME_THICKNESS_MM: (f64, f64) = (0.1, 30.0);
/// The gold of the details of the default design (the panel's palettes pair it with dark colours).
const DETAIL: &str = "#b8892b";
/// Accepted error of a float that should be inside the page (a box ending exactly on the edge).
const EPSILON: f64 = 1e-6;

/// A certificate's design: the front, an optional back and what both share.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateDesign {
    /// Always [`CERTIFICATE_DESIGN_VERSION`].
    pub version: u8,
    /// A4 lying down or standing up; both sides share it.
    pub orientation: PageOrientation,
    /// The certificate's name ("Certificado de participação"): shown on its page and in files.
    pub title: String,
    /// The side with the person's name.
    pub front: CertificatePage,
    /// The other side (the programme, the content, a second QR), printed as page 2.
    #[serde(default)]
    pub back: Option<CertificatePage>,
    /// A small "Emitido com Ingresso Impresso" line at the bottom of the front.
    pub brand: bool,
}

/// Page orientation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum PageOrientation {
    /// 297 × 210 mm.
    Landscape,
    /// 210 × 297 mm.
    Portrait,
}

impl PageOrientation {
    /// Width and height of the page in millimetres.
    pub fn size_mm(self) -> (f64, f64) {
        match self {
            Self::Landscape => (297.0, 210.0),
            Self::Portrait => (210.0, 297.0),
        }
    }
}

/// One side of the certificate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificatePage {
    /// Colour of the paper (`#rrggbb`).
    pub background_color: String,
    /// An uploaded image covering the whole page (letterhead paper, a texture), under everything.
    #[serde(default)]
    pub background_image: Option<u8>,
    /// The frame around the page.
    #[serde(default)]
    pub frame: Option<CertificateFrame>,
    /// What is on the page, the first one at the bottom.
    pub elements: Vec<CertificateElement>,
}

/// The frame of a page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateFrame {
    /// Its drawing.
    pub style: FrameStyle,
    /// Main colour (`#rrggbb`).
    pub color: String,
    /// Second colour, of the details (`#rrggbb`).
    pub accent: String,
    /// Distance from the edge of the paper (the width of a band).
    pub margin_mm: f64,
    /// Thickness of the lines.
    pub thickness_mm: f64,
}

/// How a frame is drawn (templates/certificate.typ, and the panel's preview).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum FrameStyle {
    /// One line.
    Simple,
    /// A thick line and a thin one inside it.
    Double,
    /// A band of colour along the edges and a thin line inside it.
    Band,
    /// A line, a thin inner line in the accent and diamonds on the corners.
    Classic,
    /// Brackets on the four corners.
    Corners,
    /// Triangles of both colours on two opposite corners.
    Geometric,
    /// A band down the left side with a thin accent stripe.
    Side,
}

/// An element of a page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum CertificateElement {
    /// A text with fields.
    Text(CertificateText),
    /// A logo or a picture.
    Image(CertificateImage),
    /// A line to sign on, with the name and role under it.
    Signature(CertificateSignature),
    /// The QR that opens the certificate's page and proves it.
    Qr(CertificateQr),
    /// A straight line, for dividing.
    Line(CertificateLine),
    /// A rectangle of colour, behind other elements.
    Shape(CertificateShape),
    /// A round seal with a short text.
    Seal(CertificateSeal),
}

/// A box of text. Fields such as `{nome}` are filled for each person; the text shrinks (never
/// grows) until it fits its box.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "independent switches of the text, as in the editor"
)]
pub struct CertificateText {
    /// The text, possibly with fields.
    pub text: String,
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    pub font: FontChoice,
    /// Largest size, in points.
    pub size_pt: f64,
    pub color: String,
    pub align: ParagraphAlign,
    pub valign: VerticalAlign,
    pub bold: bool,
    pub italic: bool,
    pub uppercase: bool,
    /// Extra space between letters, in em.
    pub letter_spacing: f64,
    /// Distance between lines, in multiples of the size.
    pub line_height: f64,
    /// The person's name in bold, inside the text.
    pub bold_name: bool,
}

/// Horizontal alignment of a paragraph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum ParagraphAlign {
    Left,
    Center,
    Right,
    /// Both edges straight (the last line to the left).
    Justify,
}

/// Vertical alignment inside a box.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum VerticalAlign {
    Top,
    Middle,
    Bottom,
}

/// Where an image comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "from", rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum ImageSource {
    /// The organization's logo (Minha organização); nothing is printed while there is none.
    Organization,
    /// One of the certificate's uploaded images.
    Upload {
        /// Its place in the certificate's list of images.
        index: u8,
    },
}

/// A logo or a picture, fitted inside its box without being cut.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateImage {
    pub source: ImageSource,
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
}

/// A signature: an optional picture of it, the line, the name and the role.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateSignature {
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    /// Who signs; may be empty (a line only, to sign by hand).
    pub name: String,
    /// "Diretora"; empty for none.
    pub role: String,
    /// A scan of the signature, drawn over the line.
    #[serde(default)]
    pub image: Option<u8>,
    pub font: FontChoice,
    /// Size of the name, in points (the role is a little smaller).
    pub size_pt: f64,
    /// Colour of the name and the role.
    pub color: String,
    pub line_color: String,
}

/// The QR to the certificate's page. Always black on white.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateQr {
    pub x_mm: f64,
    pub y_mm: f64,
    /// Side of the square, quiet zone included.
    pub size_mm: f64,
}

/// A straight line across its box: horizontal when the box is wider than tall.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateLine {
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    pub style: LineStyle,
    pub color: String,
    pub thickness_mm: f64,
}

/// How a line is drawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum LineStyle {
    Solid,
    Double,
    Dotted,
    /// A line with a diamond in the middle.
    Ornament,
}

/// A rectangle of colour.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateShape {
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    pub color: String,
    /// 0.05 (almost see-through) to 1.
    pub opacity: f64,
    /// Rounded corners.
    pub radius_mm: f64,
}

/// A round seal with notched edges: a short text over a large one ("Edição" over "2026").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub struct CertificateSeal {
    pub x_mm: f64,
    pub y_mm: f64,
    /// Diameter.
    pub size_mm: f64,
    pub color: String,
    pub text_color: String,
    /// Small line, possibly with fields; empty for none.
    pub text: String,
    /// Large line in the middle; empty for none.
    pub center: String,
}

/// Which side of the certificate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CertificateSide {
    Front,
    Back,
}

/// A problem with a certificate design. The panel shows the same rules in Portuguese.
#[derive(Debug, Clone, PartialEq, Error)]
pub enum CertificateIssue {
    #[error("unsupported certificate design version {0}")]
    UnsupportedVersion(u8),
    #[error("the certificate's name must have 1–{max} characters")]
    Title { max: usize },
    #[error("a side holds up to {max} elements")]
    TooManyElements { side: CertificateSide, max: usize },
    #[error("{field} must be a #rrggbb colour")]
    InvalidColor {
        side: CertificateSide,
        index: Option<usize>,
        field: &'static str,
    },
    #[error("every element must lie inside the page")]
    OutOfBounds { side: CertificateSide, index: usize },
    #[error("texts have up to {max_chars} characters, {min_pt}–{max_pt} pt")]
    Text {
        side: CertificateSide,
        index: usize,
        max_chars: usize,
        min_pt: f64,
        max_pt: f64,
    },
    #[error("the QR code must be at least {min_mm} mm")]
    QrTooSmall {
        side: CertificateSide,
        index: usize,
        min_mm: f64,
    },
    #[error("the certificate needs a QR code, which proves it is real")]
    MissingQr,
    #[error("a signature has a name up to {max_name} characters and a role up to {max_role}")]
    Signature {
        side: CertificateSide,
        index: usize,
        max_name: usize,
        max_role: usize,
    },
    #[error("a seal is {min_mm}–{max_mm} mm with short texts")]
    Seal {
        side: CertificateSide,
        index: usize,
        min_mm: f64,
        max_mm: f64,
    },
    #[error("lines and shapes are out of range")]
    Shape { side: CertificateSide, index: usize },
    #[error("the image is not among the certificate's images")]
    MissingImage {
        side: CertificateSide,
        index: Option<usize>,
    },
    #[error("the frame is out of range")]
    Frame { side: CertificateSide },
}

impl CertificateDesign {
    /// Width and height of the pages.
    pub fn page_size_mm(&self) -> (f64, f64) {
        self.orientation.size_mm()
    }

    /// The sides, front first.
    pub fn pages(&self) -> impl Iterator<Item = (CertificateSide, &CertificatePage)> {
        std::iter::once((CertificateSide::Front, &self.front))
            .chain(self.back.iter().map(|back| (CertificateSide::Back, back)))
    }

    /// Checks every rule against a list of `images` uploaded images.
    ///
    /// # Errors
    ///
    /// Every [`CertificateIssue`] found; never an empty list.
    pub fn validate(&self, images: usize) -> Result<(), Vec<CertificateIssue>> {
        let mut issues = Vec::new();
        if self.version != CERTIFICATE_DESIGN_VERSION {
            issues.push(CertificateIssue::UnsupportedVersion(self.version));
        }
        let title = self.title.trim().chars().count();
        if title == 0 || title > MAX_TITLE_CHARS || self.title.chars().any(char::is_control) {
            issues.push(CertificateIssue::Title {
                max: MAX_TITLE_CHARS,
            });
        }
        let mut qrs = 0;
        for (side, page) in self.pages() {
            self.validate_page(side, page, images, &mut issues);
            qrs += page
                .elements
                .iter()
                .filter(|element| matches!(element, CertificateElement::Qr(_)))
                .count();
        }
        if qrs == 0 {
            issues.push(CertificateIssue::MissingQr);
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }

    fn validate_page(
        &self,
        side: CertificateSide,
        page: &CertificatePage,
        images: usize,
        issues: &mut Vec<CertificateIssue>,
    ) {
        if !is_hex_color(&page.background_color) {
            issues.push(CertificateIssue::InvalidColor {
                side,
                index: None,
                field: "backgroundColor",
            });
        }
        if page
            .background_image
            .is_some_and(|index| usize::from(index) >= images)
        {
            issues.push(CertificateIssue::MissingImage { side, index: None });
        }
        if let Some(frame) = &page.frame {
            if !is_hex_color(&frame.color) || !is_hex_color(&frame.accent) {
                issues.push(CertificateIssue::InvalidColor {
                    side,
                    index: None,
                    field: "frame",
                });
            }
            if !within(frame.margin_mm, FRAME_MARGIN_MM)
                || !within(frame.thickness_mm, FRAME_THICKNESS_MM)
            {
                issues.push(CertificateIssue::Frame { side });
            }
        }
        if page.elements.len() > MAX_PAGE_ELEMENTS {
            issues.push(CertificateIssue::TooManyElements {
                side,
                max: MAX_PAGE_ELEMENTS,
            });
        }
        for (index, element) in page.elements.iter().enumerate() {
            self.validate_element(side, index, element, images, issues);
        }
    }

    fn inside(&self, (x, y, width, height): (f64, f64, f64, f64)) -> bool {
        let (page_width, page_height) = self.page_size_mm();
        [x, y, width, height].iter().all(|value| value.is_finite())
            && x >= -EPSILON
            && y >= -EPSILON
            && width >= MIN_BOX_MM
            && height >= MIN_BOX_MM
            && x + width <= page_width + EPSILON
            && y + height <= page_height + EPSILON
    }

    #[expect(clippy::too_many_lines, reason = "one rule per kind of element")]
    fn validate_element(
        &self,
        side: CertificateSide,
        index: usize,
        element: &CertificateElement,
        images: usize,
        issues: &mut Vec<CertificateIssue>,
    ) {
        if !self.inside(element.rect()) {
            issues.push(CertificateIssue::OutOfBounds { side, index });
        }
        let color = |value: &str, field: &'static str, issues: &mut Vec<CertificateIssue>| {
            if !is_hex_color(value) {
                issues.push(CertificateIssue::InvalidColor {
                    side,
                    index: Some(index),
                    field,
                });
            }
        };
        let image = |source: Option<u8>, issues: &mut Vec<CertificateIssue>| {
            if source.is_some_and(|image| usize::from(image) >= images) {
                issues.push(CertificateIssue::MissingImage {
                    side,
                    index: Some(index),
                });
            }
        };
        match element {
            CertificateElement::Text(text) => {
                color(&text.color, "color", issues);
                if text.text.chars().count() > MAX_TEXT_CHARS
                    || !within(text.size_pt, TEXT_SIZE_PT)
                    || !within(text.line_height, LINE_HEIGHT)
                    || !within(text.letter_spacing, LETTER_SPACING_EM)
                {
                    issues.push(CertificateIssue::Text {
                        side,
                        index,
                        max_chars: MAX_TEXT_CHARS,
                        min_pt: TEXT_SIZE_PT.0,
                        max_pt: TEXT_SIZE_PT.1,
                    });
                }
            }
            CertificateElement::Image(picture) => {
                if let ImageSource::Upload { index: upload } = picture.source {
                    image(Some(upload), issues);
                }
            }
            CertificateElement::Signature(signature) => {
                color(&signature.color, "color", issues);
                color(&signature.line_color, "lineColor", issues);
                image(signature.image, issues);
                if signature.name.chars().count() > MAX_SIGNER_NAME_CHARS
                    || signature.role.chars().count() > MAX_SIGNER_ROLE_CHARS
                    || signature
                        .name
                        .chars()
                        .chain(signature.role.chars())
                        .any(char::is_control)
                    || !within(signature.size_pt, SIGNATURE_SIZE_PT)
                    || signature.height_mm < signature_min_height_mm(signature.size_pt)
                {
                    issues.push(CertificateIssue::Signature {
                        side,
                        index,
                        max_name: MAX_SIGNER_NAME_CHARS,
                        max_role: MAX_SIGNER_ROLE_CHARS,
                    });
                }
            }
            CertificateElement::Qr(qr) => {
                if qr.size_mm.is_nan() || qr.size_mm < MIN_CERTIFICATE_QR_MM {
                    issues.push(CertificateIssue::QrTooSmall {
                        side,
                        index,
                        min_mm: MIN_CERTIFICATE_QR_MM,
                    });
                }
            }
            CertificateElement::Line(line) => {
                color(&line.color, "color", issues);
                if !within(line.thickness_mm, LINE_THICKNESS_MM) {
                    issues.push(CertificateIssue::Shape { side, index });
                }
            }
            CertificateElement::Shape(shape) => {
                color(&shape.color, "color", issues);
                if !within(shape.opacity, OPACITY) || !within(shape.radius_mm, SHAPE_RADIUS_MM) {
                    issues.push(CertificateIssue::Shape { side, index });
                }
            }
            CertificateElement::Seal(seal) => {
                color(&seal.color, "color", issues);
                color(&seal.text_color, "textColor", issues);
                if !within(seal.size_mm, SEAL_SIZE_MM)
                    || seal.text.chars().count() > MAX_SEAL_TEXT_CHARS
                    || seal.center.chars().count() > MAX_SEAL_CENTER_CHARS
                    || seal
                        .text
                        .chars()
                        .chain(seal.center.chars())
                        .any(char::is_control)
                {
                    issues.push(CertificateIssue::Seal {
                        side,
                        index,
                        min_mm: SEAL_SIZE_MM.0,
                        max_mm: SEAL_SIZE_MM.1,
                    });
                }
            }
        }
    }

    /// The indexes of the uploaded images the design uses.
    pub fn used_images(&self) -> Vec<u8> {
        let mut used: Vec<u8> = Vec::new();
        for (_, page) in self.pages() {
            used.extend(page.background_image);
            for element in &page.elements {
                match element {
                    CertificateElement::Image(CertificateImage {
                        source: ImageSource::Upload { index },
                        ..
                    })
                    | CertificateElement::Signature(CertificateSignature {
                        image: Some(index),
                        ..
                    }) => used.push(*index),
                    _ => {}
                }
            }
        }
        used.sort_unstable();
        used.dedup();
        used
    }

    /// Whether some image shows the organization's logo.
    pub fn uses_organization_logo(&self) -> bool {
        self.pages().any(|(_, page)| {
            page.elements.iter().any(|element| {
                matches!(
                    element,
                    CertificateElement::Image(CertificateImage {
                        source: ImageSource::Organization,
                        ..
                    })
                )
            })
        })
    }

    /// The design of an event that saved none: "Clássico", the first template of the panel
    /// (`lib/certificate-templates.ts`, same layout and gold details), in the given words, signers
    /// and colour.
    #[expect(
        clippy::too_many_lines,
        reason = "the whole layout, element by element"
    )]
    pub fn classic(
        title: &str,
        body: &str,
        signers: &[(String, Option<String>)],
        color: &str,
    ) -> Self {
        let ink = "#1b1a24".to_owned();
        let muted = "#5b5a6b".to_owned();
        let text = |text: &str, y_mm: f64, height_mm: f64, font: FontChoice, size_pt: f64| {
            CertificateText {
                text: text.to_owned(),
                x_mm: 40.0,
                y_mm,
                width_mm: 217.0,
                height_mm,
                font,
                size_pt,
                color: ink.clone(),
                align: ParagraphAlign::Center,
                valign: VerticalAlign::Middle,
                bold: false,
                italic: false,
                uppercase: false,
                letter_spacing: 0.0,
                line_height: 1.4,
                bold_name: true,
            }
        };
        let mut elements = vec![
            CertificateElement::Image(CertificateImage {
                source: ImageSource::Organization,
                x_mm: 128.5,
                y_mm: 22.0,
                width_mm: 40.0,
                height_mm: 16.0,
            }),
            CertificateElement::Text(CertificateText {
                color: color.to_owned(),
                bold: true,
                ..text(title, 42.0, 18.0, FontChoice::Roman, 34.0)
            }),
            CertificateElement::Line(CertificateLine {
                x_mm: 118.5,
                y_mm: 63.0,
                width_mm: 60.0,
                height_mm: 4.0,
                style: LineStyle::Ornament,
                color: DETAIL.to_owned(),
                thickness_mm: 0.4,
            }),
            CertificateElement::Text(text(body, 74.0, 52.0, FontChoice::Classic, 18.0)),
            CertificateElement::Text(CertificateText {
                color: muted.clone(),
                ..text(
                    "Carga horária: {carga}",
                    128.0,
                    7.0,
                    FontChoice::Classic,
                    13.0,
                )
            }),
            CertificateElement::Text(CertificateText {
                color: muted.clone(),
                italic: true,
                ..text("{local}, {data}", 136.0, 7.0, FontChoice::Classic, 13.0)
            }),
        ];
        // As the panel's template: the signers (two at most), or one line to sign by hand.
        let blank = [(String::new(), None)];
        let signers = if signers.is_empty() {
            &blank[..]
        } else {
            signers
        };
        let slots: &[f64] = if signers.len() == 1 {
            &[103.0]
        } else {
            &[40.0, 166.0]
        };
        for (slot, (name, role)) in slots.iter().zip(signers) {
            elements.push(CertificateElement::Signature(CertificateSignature {
                x_mm: *slot,
                y_mm: 150.0,
                width_mm: 70.0,
                height_mm: 30.0,
                name: name.clone(),
                role: role.clone().unwrap_or_default(),
                image: None,
                font: FontChoice::Classic,
                size_pt: 12.0,
                color: ink.clone(),
                line_color: ink.clone(),
            }));
        }
        elements.push(CertificateElement::Qr(CertificateQr {
            x_mm: 252.0,
            y_mm: 158.0,
            size_mm: 22.0,
        }));
        elements.push(CertificateElement::Text(CertificateText {
            x_mm: 236.0,
            width_mm: 38.0,
            color: muted,
            ..text("{codigo}", 181.0, 4.0, FontChoice::Sans, 8.0)
        }));
        Self {
            version: CERTIFICATE_DESIGN_VERSION,
            orientation: PageOrientation::Landscape,
            title: title.to_owned(),
            front: CertificatePage {
                background_color: "#fffdf8".to_owned(),
                background_image: None,
                frame: Some(CertificateFrame {
                    style: FrameStyle::Classic,
                    color: color.to_owned(),
                    accent: DETAIL.to_owned(),
                    margin_mm: 9.0,
                    thickness_mm: 1.6,
                }),
                elements,
            },
            back: None,
            brand: true,
        }
    }
}

/// Smallest box of a signature: the name and the role under the line, and room to sign above
/// it (templates/certificate.typ, `signature-element`).
pub fn signature_min_height_mm(size_pt: f64) -> f64 {
    size_pt * (1.3 + 0.8 * 1.3) * 25.4 / 72.0 + 4.0
}

impl CertificateElement {
    /// The element's box: `(x, y, width, height)`.
    pub fn rect(&self) -> (f64, f64, f64, f64) {
        match self {
            Self::Text(e) => (e.x_mm, e.y_mm, e.width_mm, e.height_mm),
            Self::Image(e) => (e.x_mm, e.y_mm, e.width_mm, e.height_mm),
            Self::Signature(e) => (e.x_mm, e.y_mm, e.width_mm, e.height_mm),
            Self::Qr(e) => (e.x_mm, e.y_mm, e.size_mm, e.size_mm),
            Self::Line(e) => (e.x_mm, e.y_mm, e.width_mm, e.height_mm),
            Self::Shape(e) => (e.x_mm, e.y_mm, e.width_mm, e.height_mm),
            Self::Seal(e) => (e.x_mm, e.y_mm, e.size_mm, e.size_mm),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn classic() -> CertificateDesign {
        CertificateDesign::classic(
            "Certificado",
            "Certificamos que {nome} participou de {evento}.",
            &[("Maria Lima".to_owned(), Some("Diretora".to_owned()))],
            "#0f766e",
        )
    }

    #[test]
    fn the_classic_design_is_valid() {
        assert_eq!(classic().validate(0), Ok(()));
        let two = CertificateDesign::classic(
            "Certificado",
            "{nome}",
            &[("A".to_owned(), None), ("B".to_owned(), None)],
            "#0f766e",
        );
        assert_eq!(two.validate(0), Ok(()));
    }

    #[test]
    fn round_trips_through_json() {
        let design = classic();
        let json = serde_json::to_string(&design).unwrap();
        assert!(json.contains(r#""kind":"text""#), "{json}");
        assert!(
            json.contains(r#""source":{"from":"organization"}"#),
            "{json}"
        );
        let back: CertificateDesign = serde_json::from_str(&json).unwrap();
        assert_eq!(back, design);
    }

    #[test]
    fn finds_every_problem() {
        let mut design = classic();
        design.title = String::new();
        design
            .front
            .elements
            .retain(|element| !matches!(element, CertificateElement::Qr(_)));
        let pushed = design.front.elements.len();
        design
            .front
            .elements
            .push(CertificateElement::Image(CertificateImage {
                source: ImageSource::Upload { index: 2 },
                x_mm: 290.0,
                y_mm: 10.0,
                width_mm: 20.0,
                height_mm: 10.0,
            }));
        design.back = Some(CertificatePage {
            background_color: "white".to_owned(),
            background_image: None,
            frame: None,
            elements: vec![CertificateElement::Qr(CertificateQr {
                x_mm: 10.0,
                y_mm: 10.0,
                size_mm: 10.0,
            })],
        });
        let issues = design.validate(2).unwrap_err();
        assert!(issues.contains(&CertificateIssue::Title { max: 60 }));
        assert!(issues.contains(&CertificateIssue::OutOfBounds {
            side: CertificateSide::Front,
            index: pushed
        }));
        assert!(issues.contains(&CertificateIssue::MissingImage {
            side: CertificateSide::Front,
            index: Some(pushed)
        }));
        assert!(issues.contains(&CertificateIssue::InvalidColor {
            side: CertificateSide::Back,
            index: None,
            field: "backgroundColor"
        }));
        assert!(issues.contains(&CertificateIssue::QrTooSmall {
            side: CertificateSide::Back,
            index: 0,
            min_mm: 18.0
        }));
        // The QR of the back counts: the certificate still has one.
        assert!(!issues.contains(&CertificateIssue::MissingQr));
        design.back = None;
        assert!(
            design
                .validate(3)
                .unwrap_err()
                .contains(&CertificateIssue::MissingQr)
        );
    }

    #[test]
    fn portrait_pages_are_tall() {
        let mut design = classic();
        design.orientation = PageOrientation::Portrait;
        // The landscape layout spills out of a portrait page.
        assert!(design.validate(0).is_err());
        assert_eq!(design.page_size_mm(), (210.0, 297.0));
    }

    #[test]
    fn lists_the_images_used() {
        let mut design = classic();
        assert!(design.uses_organization_logo());
        assert_eq!(design.used_images(), [0_u8; 0]);
        design.front.background_image = Some(1);
        design
            .front
            .elements
            .push(CertificateElement::Signature(CertificateSignature {
                x_mm: 10.0,
                y_mm: 10.0,
                width_mm: 50.0,
                height_mm: 20.0,
                name: String::new(),
                role: String::new(),
                image: Some(0),
                font: FontChoice::Classic,
                size_pt: 11.0,
                color: "#000000".to_owned(),
                line_color: "#000000".to_owned(),
            }));
        assert_eq!(design.used_images(), [0, 1]);
    }
}
