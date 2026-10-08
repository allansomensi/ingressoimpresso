//! Ticket files with embedded Typst (ADR 0008): home A4 sheets, print-shop PDF with bleed,
//! control sheet per seller and WhatsApp images.
//!
//! The crate never signs anything: it receives [`ticket_core::SignedTicket`]s already issued
//! for a paid batch, or renders [`TicketQr::Sample`] previews with an invalid QR and a
//! watermark (CLAUDE.md invariant 2).

mod design;
mod layout;
mod qr;
mod render;
mod texts;
mod world;

pub use design::{
    BLEED_MM, DESIGN_VERSION, DesignIssue, FontChoice, MIN_QR_SIZE_MM, NumberStyle, QrPlacement,
    StubSide, StubStyle, TextAlign, TicketDesign,
};
pub use qr::QrError;
pub use render::{
    Art, MAX_TICKETS_PER_JOB, PrintOptions, RenderError, RenderJob, SLUG_MM, TicketImage, TicketQr,
    TicketToRender, WHATSAPP_WIDTH_PX, control_sheet_pdf, home_pdf, home_sheet_pngs, print_pdf,
    sample_qr_text, ticket_images, whatsapp_zip, write_whatsapp_zip,
};
