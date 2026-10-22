//! Ticket files with embedded Typst (ADR 0008): home A4 sheets, print-shop PDF with bleed,
//! control sheet per seller and WhatsApp images.
//!
//! The crate never signs anything: it receives [`ticket_core::SignedTicket`]s already issued
//! for a paid batch, or renders [`TicketQr::Sample`] previews with an invalid QR and a
//! watermark (CLAUDE.md invariant 2).

mod badge;
mod certificate;
mod certificate_design;
mod design;
mod fields;
mod layout;
mod merge;
mod qr;
mod render;
mod report_doc;
mod sheet;
mod summary_card;
mod texts;
mod world;

pub use badge::{Badge, BadgeSheet, MAX_BADGES, badges_pdf};
pub use certificate::{
    CERTIFICATE_BRAND, CERTIFICATE_BRAND_CAPTION, CERTIFICATE_FIELDS, Certificate,
    CertificateFields, CertificateSegment, MAX_CERTIFICATES, certificate_pdf,
    certificate_sample_images, certificates_zip, certificates_zip_to, fill_certificate,
};
pub use certificate_design::{
    BrandPosition, BrandStyle, CERTIFICATE_DESIGN_VERSION, CertificateDesign, CertificateElement,
    CertificateFrame, CertificateImage, CertificateIssue, CertificateLine, CertificatePage,
    CertificateQr, CertificateSeal, CertificateShape, CertificateSide, CertificateSignature,
    CertificateText, FrameStyle, ImageSource, LineStyle, MAX_CERTIFICATE_IMAGES, MAX_PAGE_ELEMENTS,
    MIN_CERTIFICATE_QR_MM, PageOrientation, ParagraphAlign, VerticalAlign,
};
pub use design::{
    AUTO_BAND_MM, BLEED_MM, BandEdge, BandStyle, DESIGN_VERSION, DesignIssue, FontChoice,
    MAX_SPONSORS, MIN_QR_SIZE_MM, NumberStyle, QrPlacement, SponsorStrip, StubSide, StubStyle,
    TextAlign, TextBlock, TicketDesign,
};
pub use fields::{EventDetails, FIELDS};
pub use layout::Paper;
pub use qr::QrError;
pub use render::{
    Art, MAX_ART_PIXELS, MAX_ART_SIDE_PX, MAX_TICKETS_PER_JOB, PrintOptions, RenderError,
    RenderJob, SLUG_MM, TicketCategory, TicketImage, TicketQr, TicketToRender, WHATSAPP_WIDTH_PX,
    control_sheet_pdf, home_pdf, home_pdf_on, home_sheet_jpegs, home_sheet_pngs, paper_scale,
    print_pdf, sample_qr_text, ticket_images, whatsapp_zip, write_whatsapp_zip,
};
pub use report_doc::{ReportDocument, ReportFact, ReportSection, ReportTable, report_pdf};
pub use sheet::{Cell, Sheet, Workbook, xlsx};
pub use summary_card::{SummaryCard, SummaryFigure, SummaryHighlight, summary_pdf, summary_png};
