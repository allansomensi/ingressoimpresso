//! Ticket files with embedded Typst (ADR 0008): home A4 sheets, print-shop PDF with bleed,
//! control sheet per seller and WhatsApp images.
//!
//! The crate never signs anything: it receives [`ticket_core::SignedTicket`]s already issued
//! for a paid batch, or renders [`TicketQr::Sample`] previews with an invalid QR and a
//! watermark (CLAUDE.md invariant 2).

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

pub use design::{
    AUTO_BAND_MM, BLEED_MM, BandEdge, BandStyle, DESIGN_VERSION, DesignIssue, FontChoice,
    MAX_SPONSORS, MIN_QR_SIZE_MM, NumberStyle, QrPlacement, SponsorStrip, StubSide, StubStyle,
    TextAlign, TextBlock, TicketDesign,
};
pub use fields::{EventDetails, FIELDS};
pub use qr::QrError;
pub use render::{
    Art, MAX_TICKETS_PER_JOB, PrintOptions, RenderError, RenderJob, SLUG_MM, TicketCategory,
    TicketImage, TicketQr, TicketToRender, WHATSAPP_WIDTH_PX, control_sheet_pdf, home_pdf,
    home_sheet_jpegs, home_sheet_pngs, print_pdf, sample_qr_text, ticket_images, whatsapp_zip,
    write_whatsapp_zip,
};
pub use report_doc::{ReportDocument, ReportFact, ReportSection, ReportTable, report_pdf};
pub use sheet::{Cell, Sheet, Workbook, xlsx};
pub use summary_card::{SummaryCard, SummaryFigure, SummaryHighlight, summary_pdf, summary_png};
