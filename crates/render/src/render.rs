//! Rendering entry points.

use std::io::{Cursor, Seek, Write};

use lopdf::{Document, Object};

use serde::Serialize;
use thiserror::Error;
use ticket_core::{PAYLOAD_LEN, SignedTicket, base45};
use typst::diag::{FileError, SourceDiagnostic};
use typst::ecow::EcoVec;
use typst::foundations::{Bytes, Smart};
use typst::utils::Scalar;
use typst_layout::PagedDocument;
use typst_pdf::PdfOptions;
use typst_render::RenderOptions;
use zip::write::SimpleFileOptions;

use crate::design::{BLEED_MM, DesignIssue, TicketDesign};
use crate::layout::{Grid, a4_grid};
use crate::qr::{self, QrError};
use crate::texts::{PT_BR, Texts};
use crate::world::MemoryWorld;

const TICKET_TEMPLATE: &str = include_str!("../templates/ticket.typ");
const HOME_TEMPLATE: &str = include_str!("../templates/home.typ");
const PRINT_TEMPLATE: &str = include_str!("../templates/print.typ");
const IMAGES_TEMPLATE: &str = include_str!("../templates/images.typ");
const CONTROL_TEMPLATE: &str = include_str!("../templates/control.typ");

/// Upper bound of tickets per render call.
pub const MAX_TICKETS_PER_JOB: usize = 10_000;
/// Tickets per Typst compilation for PDFs: bounds memory (about 50 MB per chunk) whatever the
/// batch size; chunks are merged into one file.
const PDF_CHUNK_TICKETS: usize = 250;
/// Tickets per Typst compilation for images.
const IMAGE_CHUNK_TICKETS: usize = 50;
/// Crop-mark area outside the bleed in print-shop files.
pub const SLUG_MM: f64 = 5.0;
/// Default width of WhatsApp images.
pub const WHATSAPP_WIDTH_PX: u32 = 1080;
const MAX_EVENT_NAME_CHARS: usize = 100;
const MAX_SELLER_CHARS: usize = 60;
const JPEG_QUALITY: u8 = 92;
const MAX_IMAGE_WIDTH_PX: u32 = 4_000;

/// Why a file could not be rendered.
#[derive(Debug, Error)]
pub enum RenderError {
    /// The design breaks a rule.
    #[error("invalid design: {0:?}")]
    InvalidDesign(Vec<DesignIssue>),
    /// Event name empty or longer than 100 characters.
    #[error("event name must have 1–{MAX_EVENT_NAME_CHARS} characters")]
    EventName,
    /// A seller name longer than 60 characters.
    #[error("seller names must have at most {MAX_SELLER_CHARS} characters")]
    SellerName,
    /// No tickets, or more than [`MAX_TICKETS_PER_JOB`].
    #[error("a job must have 1–{MAX_TICKETS_PER_JOB} tickets")]
    TicketCount,
    /// Art is neither PNG nor JPEG.
    #[error("art must be a PNG or JPEG image")]
    UnsupportedArt,
    /// The ticket (with stub) does not fit on an A4 sheet.
    #[error("ticket does not fit on an A4 sheet")]
    TooLargeForA4,
    /// Image width (100–4000 px) or resolution (30–600 dpi) out of range.
    #[error("image size out of range")]
    ImageWidth,
    /// QR encoding failed.
    #[error(transparent)]
    Qr(#[from] QrError),
    /// Typst failed to compile (a bug in our templates or unreadable art).
    #[error("typst: {0}")]
    Typst(String),
    /// Image encoding failed.
    #[error("image encoding: {0}")]
    Image(String),
    /// ZIP writing failed.
    #[error("zip: {0}")]
    Zip(String),
    /// Merging PDF chunks failed.
    #[error("pdf: {0}")]
    Pdf(String),
}

/// Art accepted by the renderer.
#[derive(Clone)]
pub struct Art {
    bytes: Bytes,
    path: &'static str,
}

impl Art {
    /// Accepts PNG or JPEG, detected by magic number (never by file name).
    ///
    /// # Errors
    ///
    /// Returns [`RenderError::UnsupportedArt`] for any other content.
    pub fn from_bytes(bytes: Vec<u8>) -> Result<Self, RenderError> {
        let path = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            "/art.png"
        } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            "/art.jpg"
        } else {
            return Err(RenderError::UnsupportedArt);
        };
        Ok(Self {
            bytes: Bytes::new(bytes),
            path,
        })
    }
}

impl std::fmt::Debug for Art {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Art")
            .field("path", &self.path)
            .field("bytes", &self.bytes.len())
            .finish()
    }
}

/// What goes in a ticket's QR code.
#[derive(Debug, Clone)]
pub enum TicketQr {
    /// A signed ticket: the printed number is taken from its header, so the number on paper and
    /// the number in the QR can never disagree.
    Signed(SignedTicket),
    /// A preview: an invalid QR (rejected at the door) plus a watermark. Never signed.
    Sample {
        /// Number to print.
        number: u32,
    },
}

/// One ticket to render.
#[derive(Debug, Clone)]
pub struct TicketToRender {
    /// QR content.
    pub qr: TicketQr,
    /// Seller holding this ticket, if assigned.
    pub seller: Option<String>,
}

impl TicketToRender {
    /// The printed ticket number.
    pub fn number(&self) -> u32 {
        match &self.qr {
            TicketQr::Signed(ticket) => ticket.header().number.get(),
            TicketQr::Sample { number } => *number,
        }
    }

    fn qr_text(&self) -> String {
        match &self.qr {
            TicketQr::Signed(ticket) => ticket.to_qr_text(),
            TicketQr::Sample { .. } => sample_qr_text(),
        }
    }
}

/// Everything needed to render a batch.
#[derive(Debug, Clone)]
pub struct RenderJob {
    /// Validated design.
    pub design: TicketDesign,
    /// Background art (covers body + bleed).
    pub art: Option<Art>,
    /// Event name, printed on stubs and control sheets.
    pub event_name: String,
    /// Tickets, in printing order.
    pub tickets: Vec<TicketToRender>,
}

/// Options of the print-shop file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrintOptions {
    /// Draw crop marks outside the bleed (some print shops prefer files without them).
    pub crop_marks: bool,
}

impl Default for PrintOptions {
    fn default() -> Self {
        Self { crop_marks: true }
    }
}

/// One rasterized ticket body.
#[derive(Debug, Clone)]
pub struct TicketImage {
    /// Ticket number.
    pub number: u32,
    /// Seller, if assigned.
    pub seller: Option<String>,
    /// JPEG bytes.
    pub jpeg: Vec<u8>,
}

/// A QR text that looks like a real ticket (same length and QR size) but is always rejected at
/// the door as malformed: its version byte is 0x00.
pub fn sample_qr_text() -> String {
    base45::encode(&[0u8; PAYLOAD_LEN])
}

/// A4 sheets for home printing (tickets edge to edge, cut marks in the margins).
///
/// # Errors
///
/// See [`RenderError`].
pub fn home_pdf(job: &RenderJob) -> Result<Vec<u8>, RenderError> {
    home_pdf_chunked(job, PDF_CHUNK_TICKETS)
}

fn home_pdf_chunked(job: &RenderJob, chunk_tickets: usize) -> Result<Vec<u8>, RenderError> {
    validate(job)?;
    let grid = home_grid(job)?;
    // Chunks hold whole sheets, so merging never leaves a half-empty sheet in the middle.
    let per_page = grid.per_page() as usize;
    let chunk = (chunk_tickets / per_page).max(1) * per_page;
    let pdfs = job
        .tickets
        .chunks(chunk)
        .map(|tickets| {
            let data = TemplateData {
                grid: Some(grid),
                ..TemplateData::new(job, tickets)
            };
            pdf(&compile(HOME_TEMPLATE, &data, job, tickets)?)
        })
        .collect::<Result<Vec<_>, _>>()?;
    merge_pdfs(pdfs)
}

/// The first `max_sheets` home A4 sheets rasterized as PNG at `dpi` (editor preview, tests).
///
/// # Errors
///
/// See [`RenderError`]; `dpi` must be 30–600.
pub fn home_sheet_pngs(
    job: &RenderJob,
    dpi: u32,
    max_sheets: usize,
) -> Result<Vec<Vec<u8>>, RenderError> {
    validate(job)?;
    if !(30..=600).contains(&dpi) {
        return Err(RenderError::ImageWidth);
    }
    let grid = home_grid(job)?;
    let tickets = job
        .tickets
        .get(
            ..job
                .tickets
                .len()
                .min(max_sheets.saturating_mul(grid.per_page() as usize)),
        )
        .unwrap_or_default();
    if tickets.is_empty() {
        return Ok(Vec::new());
    }
    let data = TemplateData {
        grid: Some(grid),
        ..TemplateData::new(job, tickets)
    };
    let document = compile(HOME_TEMPLATE, &data, job, tickets)?;
    let options = RenderOptions {
        pixel_per_pt: Scalar::new(f64::from(dpi) / 72.0),
        render_bleed: false,
    };
    document
        .pages()
        .iter()
        .map(|page| {
            typst_render::render(page, &options)
                .encode_png()
                .map_err(|error| RenderError::Image(error.to_string()))
        })
        .collect()
}

/// Print-shop file: one ticket per page at final size with 3 mm bleed (TrimBox set).
///
/// # Errors
///
/// See [`RenderError`].
pub fn print_pdf(job: &RenderJob, options: PrintOptions) -> Result<Vec<u8>, RenderError> {
    print_pdf_chunked(job, options, PDF_CHUNK_TICKETS)
}

fn print_pdf_chunked(
    job: &RenderJob,
    options: PrintOptions,
    chunk: usize,
) -> Result<Vec<u8>, RenderError> {
    validate(job)?;
    let pdfs = job
        .tickets
        .chunks(chunk.max(1))
        .map(|tickets| {
            let data = TemplateData {
                print: Some(PrintData {
                    slug_mm: SLUG_MM,
                    crop_marks: options.crop_marks,
                }),
                ..TemplateData::new(job, tickets)
            };
            pdf(&compile(PRINT_TEMPLATE, &data, job, tickets)?)
        })
        .collect::<Result<Vec<_>, _>>()?;
    merge_pdfs(pdfs)
}

/// Control sheet: one section per seller, one row per ticket.
///
/// Compiled in one piece (it is text only and cheap) so page numbers run across the file.
///
/// # Errors
///
/// See [`RenderError`].
pub fn control_sheet_pdf(job: &RenderJob) -> Result<Vec<u8>, RenderError> {
    validate(job)?;
    let data = TemplateData {
        groups: seller_groups(job),
        // The control sheet has no QR codes: no ticket data, no QR files.
        tickets: Vec::new(),
        ..TemplateData::new(job, &[])
    };
    pdf(&compile(CONTROL_TEMPLATE, &data, job, &[])?)
}

/// Rasterizes every ticket body (no stub, no bleed) as a JPEG `width_px` wide.
///
/// Holds every image in memory: meant for previews and small jobs. For whole batches use
/// [`write_whatsapp_zip`], which streams.
///
/// # Errors
///
/// See [`RenderError`].
pub fn ticket_images(job: &RenderJob, width_px: u32) -> Result<Vec<TicketImage>, RenderError> {
    let mut images = Vec::with_capacity(job.tickets.len());
    for_each_image(job, width_px, |image| {
        images.push(image);
        Ok(())
    })?;
    Ok(images)
}

/// WhatsApp images in a ZIP held in memory. See [`write_whatsapp_zip`].
///
/// # Errors
///
/// See [`RenderError`].
pub fn whatsapp_zip(job: &RenderJob, width_px: u32) -> Result<Vec<u8>, RenderError> {
    Ok(write_whatsapp_zip(job, width_px, Cursor::new(Vec::new()))?.into_inner())
}

/// Streams WhatsApp images into a ZIP: one folder per seller, files named by ticket number.
/// Memory stays bounded by one chunk of tickets, whatever the batch size.
///
/// # Errors
///
/// See [`RenderError`].
pub fn write_whatsapp_zip<W: Write + Seek>(
    job: &RenderJob,
    width_px: u32,
    sink: W,
) -> Result<W, RenderError> {
    let digits = usize::from(job.design.number.digits);
    let mut writer = zip::ZipWriter::new(sink);
    // JPEG is already compressed; a fixed timestamp keeps the archive reproducible.
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .last_modified_time(zip::DateTime::default());
    for_each_image(job, width_px, |image| {
        let folder = folder_name(image.seller.as_deref());
        let name = format!("{folder}/{:0digits$}.jpg", image.number);
        writer
            .start_file(name, options)
            .map_err(|error| RenderError::Zip(error.to_string()))?;
        writer
            .write_all(&image.jpeg)
            .map_err(|error| RenderError::Zip(error.to_string()))
    })?;
    writer
        .finish()
        .map_err(|error| RenderError::Zip(error.to_string()))
}

fn for_each_image(
    job: &RenderJob,
    width_px: u32,
    mut visit: impl FnMut(TicketImage) -> Result<(), RenderError>,
) -> Result<(), RenderError> {
    validate(job)?;
    if !(100..=MAX_IMAGE_WIDTH_PX).contains(&width_px) {
        return Err(RenderError::ImageWidth);
    }
    // 1 pt = 25.4/72 mm.
    let body_width_pt = job.design.width_mm * 72.0 / 25.4;
    let options = RenderOptions {
        pixel_per_pt: Scalar::new(f64::from(width_px) / body_width_pt),
        render_bleed: false,
    };
    for tickets in job.tickets.chunks(IMAGE_CHUNK_TICKETS) {
        let document = compile(
            IMAGES_TEMPLATE,
            &TemplateData::new(job, tickets),
            job,
            tickets,
        )?;
        for (page, ticket) in document.pages().iter().zip(tickets) {
            let pixmap = typst_render::render(page, &options);
            visit(TicketImage {
                number: ticket.number(),
                seller: ticket.seller.clone(),
                jpeg: encode_jpeg(pixmap.width(), pixmap.height(), pixmap.data())?,
            })?;
        }
    }
    Ok(())
}

fn home_grid(job: &RenderJob) -> Result<Grid, RenderError> {
    a4_grid(job.design.total_width_mm(), job.design.height_mm).ok_or(RenderError::TooLargeForA4)
}

/// Concatenates PDFs produced by [`pdf`] (untagged, flat page tree) into one document.
fn merge_pdfs(pdfs: Vec<Vec<u8>>) -> Result<Vec<u8>, RenderError> {
    if pdfs.len() == 1 {
        return Ok(pdfs.into_iter().flatten().collect());
    }
    let merge_error = |error: lopdf::Error| RenderError::Pdf(error.to_string());
    let mut merged = Document::with_version("1.7");
    let pages_id = merged.new_object_id();
    let mut next_id = pages_id.0 + 1;
    let mut kids = Vec::new();
    for bytes in pdfs {
        let mut part = Document::load_mem(&bytes).map_err(merge_error)?;
        part.renumber_objects_with(next_id);
        next_id = part.max_id + 1;
        for page_id in part.get_pages().into_values() {
            let page = part
                .get_object_mut(page_id)
                .and_then(Object::as_dict_mut)
                .map_err(merge_error)?;
            page.set("Parent", pages_id);
            kids.push(Object::Reference(page_id));
        }
        // Keep every object; the part's catalog and page-tree root become unreferenced and are
        // pruned below.
        merged.objects.extend(part.objects);
    }
    let count = i64::try_from(kids.len()).map_err(|error| RenderError::Pdf(error.to_string()))?;
    merged.objects.insert(
        pages_id,
        Object::Dictionary(
            lopdf::dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => count },
        ),
    );
    merged.max_id = next_id;
    let catalog_id =
        merged.add_object(lopdf::dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    merged.trailer.set("Root", catalog_id);
    merged.prune_objects();
    merged.renumber_objects();
    let mut out = Vec::new();
    merged
        .save_to(&mut out)
        .map_err(|error| RenderError::Pdf(error.to_string()))?;
    Ok(out)
}

fn validate(job: &RenderJob) -> Result<(), RenderError> {
    job.design.validate().map_err(RenderError::InvalidDesign)?;
    let name_chars = job.event_name.trim().chars().count();
    if name_chars == 0 || name_chars > MAX_EVENT_NAME_CHARS {
        return Err(RenderError::EventName);
    }
    if job.tickets.is_empty() || job.tickets.len() > MAX_TICKETS_PER_JOB {
        return Err(RenderError::TicketCount);
    }
    if job
        .tickets
        .iter()
        .filter_map(|ticket| ticket.seller.as_deref())
        .any(|seller| seller.chars().count() > MAX_SELLER_CHARS)
    {
        return Err(RenderError::SellerName);
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateData<'a> {
    texts: Texts,
    event_name: &'a str,
    design: &'a TicketDesign,
    bleed_mm: f64,
    art: Option<&'static str>,
    tickets: Vec<TemplateTicket>,
    grid: Option<Grid>,
    print: Option<PrintData>,
    groups: Vec<SellerGroup>,
}

impl<'a> TemplateData<'a> {
    fn new(job: &'a RenderJob, tickets: &[TicketToRender]) -> Self {
        Self {
            texts: PT_BR,
            event_name: job.event_name.trim(),
            design: &job.design,
            bleed_mm: BLEED_MM,
            art: job.art.as_ref().map(|art| art.path),
            tickets: tickets
                .iter()
                .enumerate()
                .map(|(index, ticket)| TemplateTicket {
                    label: job.design.number_label(ticket.number()),
                    qr: qr_path(index),
                    sample: matches!(ticket.qr, TicketQr::Sample { .. }),
                })
                .collect(),
            grid: None,
            print: None,
            groups: Vec::new(),
        }
    }
}

#[derive(Serialize)]
struct TemplateTicket {
    label: String,
    qr: String,
    sample: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PrintData {
    slug_mm: f64,
    crop_marks: bool,
}

#[derive(Serialize)]
struct SellerGroup {
    seller: String,
    rows: Vec<String>,
}

fn qr_path(index: usize) -> String {
    format!("/qr/{index}.svg")
}

/// Groups tickets by seller in order of first appearance.
fn seller_groups(job: &RenderJob) -> Vec<SellerGroup> {
    let digits = usize::from(job.design.number.digits);
    let mut groups: Vec<SellerGroup> = Vec::new();
    for ticket in &job.tickets {
        let seller = ticket
            .seller
            .as_deref()
            .unwrap_or(PT_BR.no_seller)
            .trim()
            .to_owned();
        let row = format!("{:0digits$}", ticket.number());
        if let Some(group) = groups.iter_mut().find(|group| group.seller == seller) {
            group.rows.push(row);
        } else {
            groups.push(SellerGroup {
                seller,
                rows: vec![row],
            });
        }
    }
    groups
}

fn compile(
    template: &str,
    data: &TemplateData<'_>,
    job: &RenderJob,
    tickets: &[TicketToRender],
) -> Result<PagedDocument, RenderError> {
    let file_error = |error: FileError| RenderError::Typst(error.to_string());
    let mut world = MemoryWorld::new("/main.typ", template).map_err(file_error)?;
    world
        .add_source("/ticket.typ", TICKET_TEMPLATE)
        .map_err(file_error)?;
    let json = serde_json::to_vec(data).map_err(|error| RenderError::Typst(error.to_string()))?;
    world
        .add_file("/data.json", Bytes::new(json))
        .map_err(file_error)?;
    if let Some(art) = &job.art {
        world
            .add_file(art.path, art.bytes.clone())
            .map_err(file_error)?;
    }
    for (index, ticket) in tickets.iter().enumerate() {
        let svg = qr::svg(&ticket.qr_text())?;
        world
            .add_file(&qr_path(index), Bytes::from_string(svg))
            .map_err(file_error)?;
    }
    let document = typst::compile::<PagedDocument>(&world)
        .output
        .map_err(|diagnostics| RenderError::Typst(describe(&diagnostics)));
    // Typst memoizes in a process-wide cache; without eviction it grows with every chunk.
    typst::comemo::evict(0);
    document
}

fn pdf(document: &PagedDocument) -> Result<Vec<u8>, RenderError> {
    let options = PdfOptions {
        // A stable identifier and no timestamp make the output byte-for-byte reproducible.
        ident: Smart::Custom("ingressoimpresso".to_owned()),
        creator: Smart::Custom(Some("Ingresso Impresso".to_owned())),
        // Tickets gain nothing from a structure tree, and an untagged file can be merged.
        tagged: false,
        ..PdfOptions::default()
    };
    typst_pdf::pdf(document, &options)
        .map_err(|diagnostics| RenderError::Typst(describe(&diagnostics)))
}

fn describe(diagnostics: &EcoVec<SourceDiagnostic>) -> String {
    diagnostics
        .iter()
        .map(|diagnostic| diagnostic.message.to_string())
        .collect::<Vec<_>>()
        .join("; ")
}

fn encode_jpeg(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, RenderError> {
    // Pages have an opaque background, so premultiplied RGBA equals straight RGBA here.
    let rgb: Vec<u8> = rgba
        .chunks_exact(4)
        .flat_map(|pixel| pixel.iter().take(3).copied())
        .collect();
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY)
        .encode(&rgb, width, height, image::ExtendedColorType::Rgb8)
        .map_err(|error| RenderError::Image(error.to_string()))?;
    Ok(jpeg)
}

/// A ZIP folder name for a seller: letters, digits, spaces, `-` and `_` only.
fn folder_name(seller: Option<&str>) -> String {
    let name: String = seller
        .unwrap_or(PT_BR.no_seller)
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let name = name.trim();
    if name.is_empty() {
        PT_BR.no_seller.to_owned()
    } else {
        name.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_qr_is_rejected_as_malformed() {
        let text = sample_qr_text();
        assert_eq!(text.len(), ticket_core::QR_TEXT_LEN);
        assert_eq!(
            SignedTicket::from_qr_text(&text),
            Err(ticket_core::DecodeError::UnsupportedVersion(0))
        );
    }

    #[test]
    fn folder_names_are_sanitized() {
        assert_eq!(folder_name(Some("João da Silva")), "João da Silva");
        assert_eq!(folder_name(Some("../../etc/passwd")), "______etc_passwd");
        assert_eq!(folder_name(Some("  ")), PT_BR.no_seller);
        assert_eq!(folder_name(None), PT_BR.no_seller);
    }

    fn signed_job(count: u32) -> RenderJob {
        let issuer = ticket_core::TicketIssuer::new(
            ticket_core::EventId::from_bytes([1; 16]),
            ticket_core::EventTag::new(2),
            ticket_core::KeyId::new(1),
            ticket_core::EventSigningKey::from_seed(&[3; 32]),
        );
        RenderJob {
            design: TicketDesign::default_v1(),
            art: None,
            event_name: "Evento".to_owned(),
            tickets: (1..=count)
                .map(|number| TicketToRender {
                    qr: TicketQr::Signed(
                        issuer.issue(ticket_core::TicketNumber::new(number).unwrap()),
                    ),
                    seller: None,
                })
                .collect(),
        }
    }

    fn page_boxes(pdf: &[u8]) -> Vec<(Vec<f32>, Vec<f32>)> {
        let document = Document::load_mem(pdf).unwrap();
        let read = |page: &lopdf::Dictionary, key: &[u8]| -> Vec<f32> {
            page.get(key)
                .unwrap()
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_float().unwrap())
                .collect()
        };
        document
            .get_pages()
            .values()
            .map(|id| {
                let page = document.get_dictionary(*id).unwrap();
                assert!(page.get(b"Contents").is_ok(), "page lost its content");
                assert!(page.get(b"Resources").is_ok(), "page lost its resources");
                (read(page, b"MediaBox"), read(page, b"TrimBox"))
            })
            .collect()
    }

    #[test]
    fn chunked_print_pdf_merges_every_page_with_its_boxes() {
        let job = signed_job(5);
        let merged = print_pdf_chunked(&job, PrintOptions::default(), 2).unwrap();
        let single = print_pdf_chunked(&job, PrintOptions::default(), 100).unwrap();
        let merged_boxes = page_boxes(&merged);
        assert_eq!(merged_boxes.len(), 5);
        assert_eq!(merged_boxes, page_boxes(&single));
        // Deterministic merge.
        assert_eq!(
            merged,
            print_pdf_chunked(&job, PrintOptions::default(), 2).unwrap()
        );
    }

    #[test]
    fn chunked_home_pdf_keeps_whole_sheets() {
        // 5 tickets per sheet; a 2-ticket chunk is rounded up to one whole sheet.
        let job = signed_job(12);
        let merged = home_pdf_chunked(&job, 2).unwrap();
        let document = Document::load_mem(&merged).unwrap();
        assert_eq!(document.get_pages().len(), 3);
        for id in document.get_pages().values() {
            let page = document.get_dictionary(*id).unwrap();
            assert!(page.get(b"Contents").is_ok() && page.get(b"Resources").is_ok());
        }
    }

    #[test]
    fn art_is_detected_by_content() {
        assert!(Art::from_bytes(b"\x89PNG\r\n\x1a\nrest".to_vec()).is_ok());
        assert!(Art::from_bytes(vec![0xFF, 0xD8, 0xFF, 0xE0]).is_ok());
        assert!(matches!(
            Art::from_bytes(b"<svg/>".to_vec()),
            Err(RenderError::UnsupportedArt)
        ));
    }
}
