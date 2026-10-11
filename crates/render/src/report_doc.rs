//! Reports for people to read and print (ADR 0058): a title, sections of facts and tables, all
//! values already formatted by the caller. Rendered with the same sealed Typst world as the
//! tickets; text enters only as data (CLAUDE.md invariant 5).

use serde::Serialize;
use typst::diag::FileError;
use typst::foundations::Bytes;
use typst_layout::PagedDocument;

use crate::render::{RenderError, describe, pdf};
use crate::world::MemoryWorld;

const REPORT_TEMPLATE: &str = include_str!("../templates/report.typ");
/// Most sections, facts or table rows accepted (bounds the work of one request).
const MAX_ITEMS: usize = 5_000;

/// A report document.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportDocument {
    /// Small line above the title ("Prestação de contas").
    pub kicker: String,
    /// Title (the event name).
    pub title: String,
    /// Line under the title (date, venue, organizer).
    pub subtitle: String,
    /// Footer of every page (when it was generated).
    pub footer: String,
    /// Sections, in order.
    pub sections: Vec<ReportSection>,
    /// Lines to sign at the end ("Responsável pelas contas"); empty for none.
    pub signatures: Vec<String>,
}

/// A section: facts (big numbers) and an optional table.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSection {
    /// Heading.
    pub title: String,
    /// Small text under the heading.
    pub note: Option<String>,
    /// Numbers shown as cards, up to four per row.
    pub facts: Vec<ReportFact>,
    /// A table under the facts.
    pub table: Option<ReportTable>,
}

/// A labelled value.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportFact {
    /// Label.
    pub label: String,
    /// Value, formatted.
    pub value: String,
    /// Highlighted (filled card, bigger number).
    pub strong: bool,
    /// `"good"` or `"bad"` colours the value.
    pub tone: Option<&'static str>,
}

/// A table with a header, rows and an optional total row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportTable {
    /// Column titles.
    pub headers: Vec<String>,
    /// Rows, as many cells as headers.
    pub rows: Vec<Vec<String>>,
    /// Bold last row.
    pub total: Option<Vec<String>>,
    /// Columns from this index on are right-aligned (numbers).
    pub numeric_from: usize,
    /// The column that takes the remaining width (the others fit their content).
    pub wide: usize,
}

/// The report as a PDF.
///
/// # Errors
///
/// [`RenderError::Typst`] when a table's rows do not match its headers, the document is too big,
/// or Typst fails.
pub fn report_pdf(document: &ReportDocument) -> Result<Vec<u8>, RenderError> {
    let rows: usize = document
        .sections
        .iter()
        .map(|section| section.facts.len() + section.table.as_ref().map_or(0, |t| t.rows.len()))
        .sum();
    if document.sections.len() + rows > MAX_ITEMS {
        return Err(RenderError::Typst("report too large".to_owned()));
    }
    for table in document
        .sections
        .iter()
        .filter_map(|section| section.table.as_ref())
    {
        let width = table.headers.len();
        if width == 0
            || table.wide >= width
            || table
                .rows
                .iter()
                .chain(table.total.iter())
                .any(|row| row.len() != width)
        {
            return Err(RenderError::Typst(
                "table rows must match the headers".to_owned(),
            ));
        }
    }
    let file_error = |error: FileError| RenderError::Typst(error.to_string());
    let mut world = MemoryWorld::new("/main.typ", REPORT_TEMPLATE).map_err(file_error)?;
    let json =
        serde_json::to_vec(document).map_err(|error| RenderError::Typst(error.to_string()))?;
    world
        .add_file("/data.json", Bytes::new(json))
        .map_err(file_error)?;
    let compiled = typst::compile::<PagedDocument>(&world)
        .output
        .map_err(|diagnostics| RenderError::Typst(describe(&diagnostics)));
    typst::comemo::evict(0);
    pdf(&compiled?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn document() -> ReportDocument {
        ReportDocument {
            kicker: "Prestação de contas".to_owned(),
            title: "Formatura 3º ano #[eval(\"1\")]".to_owned(),
            subtitle: "20 de novembro de 2026".to_owned(),
            footer: "Gerado em 11/10/2026".to_owned(),
            sections: vec![ReportSection {
                title: "Resumo".to_owned(),
                note: Some("Valores em reais".to_owned()),
                facts: vec![ReportFact {
                    label: "Saldo".to_owned(),
                    value: "R$ 1.234,00".to_owned(),
                    strong: true,
                    tone: Some("good"),
                }],
                table: Some(ReportTable {
                    headers: vec!["Vendedor".to_owned(), "Recebido".to_owned()],
                    rows: vec![vec!["Maria".to_owned(), "R$ 10,00".to_owned()]],
                    total: Some(vec!["Total".to_owned(), "R$ 10,00".to_owned()]),
                    numeric_from: 1,
                    wide: 0,
                }),
            }],
            signatures: vec!["Tesoureiro".to_owned(), "Presidente".to_owned()],
        }
    }

    #[test]
    fn renders_a_pdf_with_user_text_as_data() {
        let pdf = report_pdf(&document()).unwrap();
        assert!(pdf.starts_with(b"%PDF"));
        let parsed = lopdf::Document::load_mem(&pdf).unwrap();
        assert_eq!(parsed.get_pages().len(), 1);
    }

    #[test]
    fn refuses_ragged_tables() {
        let mut bad = document();
        if let Some(table) = bad.sections[0].table.as_mut() {
            table.rows.push(vec!["só uma".to_owned()]);
        }
        assert!(report_pdf(&bad).is_err());
    }
}
