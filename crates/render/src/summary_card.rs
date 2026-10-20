//! The event's final summary (ADR 0101): one page with the audience, the money in and out, the
//! balance and the sellers who stood out, for the committee or the board. The same page comes out
//! as a PDF and as a picture to send in a chat. Values come formatted by the caller and enter
//! Typst only as data (CLAUDE.md invariant 5).

use serde::Serialize;
use typst::diag::FileError;
use typst::foundations::Bytes;
use typst_layout::PagedDocument;
use typst_render::RenderOptions;

use crate::render::{RenderError, describe, pdf};
use crate::world::MemoryWorld;

const SUMMARY_TEMPLATE: &str = include_str!("../templates/summary.typ");

/// The summary page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryCard {
    /// Line above the title ("Resumo final").
    pub kicker: String,
    /// The event's name.
    pub title: String,
    /// Date, venue and organizer.
    pub subtitle: String,
    /// Colour of the header (`#rrggbb`, dark enough for white text).
    pub color: String,
    /// The four big numbers.
    pub headline: Vec<SummaryFigure>,
    /// Smaller numbers under them (up to four).
    pub details: Vec<SummaryFigure>,
    /// Heading of the sellers who stood out.
    pub highlights_title: String,
    /// Up to three sellers.
    pub highlights: Vec<SummaryHighlight>,
    /// When it was made.
    pub footer: String,
    /// The product's signature.
    pub brand: String,
}

/// A labelled number.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryFigure {
    pub label: String,
    pub value: String,
    pub note: Option<String>,
    /// `"good"` or `"bad"` colours the value.
    pub tone: Option<&'static str>,
}

/// A seller who stood out.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryHighlight {
    pub position: u8,
    pub name: String,
    /// "48 vendidos".
    pub value: String,
    /// "R$ 960,00".
    pub amount: Option<String>,
}

fn compile(card: &SummaryCard) -> Result<PagedDocument, RenderError> {
    if card.headline.len() > 4 || card.details.len() > 4 || card.highlights.len() > 3 {
        return Err(RenderError::Typst("too many figures".to_owned()));
    }
    if !is_hex_color(&card.color) {
        return Err(RenderError::Typst("invalid colour".to_owned()));
    }
    let file_error = |error: FileError| RenderError::Typst(error.to_string());
    let mut world = MemoryWorld::new("/main.typ", SUMMARY_TEMPLATE).map_err(file_error)?;
    let json = serde_json::to_vec(card).map_err(|error| RenderError::Typst(error.to_string()))?;
    world
        .add_file("/data.json", Bytes::new(json))
        .map_err(file_error)?;
    let compiled = typst::compile::<PagedDocument>(&world)
        .output
        .map_err(|diagnostics| RenderError::Typst(describe(&diagnostics)));
    typst::comemo::evict(0);
    compiled
}

fn is_hex_color(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text.chars().skip(1).all(|c| c.is_ascii_hexdigit())
}

/// The summary as a one-page PDF.
///
/// # Errors
///
/// [`RenderError::Typst`] for too many figures, a bad colour or a Typst failure.
pub fn summary_pdf(card: &SummaryCard) -> Result<Vec<u8>, RenderError> {
    pdf(&compile(card)?)
}

/// The summary as a PNG `width_px` wide (1080 suits a phone).
///
/// # Errors
///
/// See [`summary_pdf`]; [`RenderError::Image`] when the PNG cannot be written.
pub fn summary_png(card: &SummaryCard, width_px: u32) -> Result<Vec<u8>, RenderError> {
    let document = compile(card)?;
    let page = document
        .pages()
        .first()
        .ok_or_else(|| RenderError::Typst("empty summary".to_owned()))?;
    let page_points = page.frame.width().to_pt();
    let options = RenderOptions {
        pixel_per_pt: typst::utils::Scalar::new(f64::from(width_px) / page_points.max(1.0)),
        render_bleed: false,
    };
    typst_render::render(page, &options)
        .encode_png()
        .map_err(|error| RenderError::Image(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card() -> SummaryCard {
        let figure = |label: &str, value: &str| SummaryFigure {
            label: label.to_owned(),
            value: value.to_owned(),
            note: None,
            tone: None,
        };
        SummaryCard {
            kicker: "Resumo final".to_owned(),
            title: "Arraiá #[eval(\"1\")]".to_owned(),
            subtitle: "21 de novembro de 2026 · Quadra".to_owned(),
            color: "#5b3df5".to_owned(),
            headline: vec![
                figure("Público", "312"),
                figure("Arrecadado", "R$ 6.240,00"),
                figure("Despesas", "R$ 1.200,00"),
                figure("Saldo", "R$ 5.040,00"),
            ],
            details: vec![figure("Vendidos", "320"), figure("Cortesias", "8")],
            highlights_title: "Destaque dos vendedores".to_owned(),
            highlights: vec![SummaryHighlight {
                position: 1,
                name: "Ana S.".to_owned(),
                value: "48 vendidos".to_owned(),
                amount: Some("R$ 960,00".to_owned()),
            }],
            footer: "Gerado em 21/11/2026".to_owned(),
            brand: "Ingresso Impresso".to_owned(),
        }
    }

    #[test]
    fn one_page_as_pdf_and_picture() {
        let bytes = summary_pdf(&card()).unwrap();
        let document = lopdf::Document::load_mem(&bytes).unwrap();
        assert_eq!(document.get_pages().len(), 1);
        let png = summary_png(&card(), 1080).unwrap();
        let picture = image::load_from_memory(&png).unwrap();
        assert_eq!(picture.width(), 1080);
        assert_eq!(picture.height(), 1350);
    }

    #[test]
    fn refuses_a_bad_colour() {
        let mut bad = card();
        bad.color = "red".to_owned();
        assert!(summary_pdf(&bad).is_err());
    }
}
