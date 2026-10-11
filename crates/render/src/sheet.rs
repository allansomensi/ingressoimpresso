//! Spreadsheets (ADR 0058): a minimal Office Open XML workbook (`.xlsx`) with text, whole
//! numbers and amounts in reais, opened by Excel, `LibreOffice` and Google Sheets. Written by hand
//! on the `zip` the crate already uses; no formulas, no macros.

use std::fmt::Write as _;
use std::io::{Cursor, Write};

use zip::write::SimpleFileOptions;

use crate::render::RenderError;

/// Most rows per sheet and sheets per workbook.
const MAX_ROWS: usize = 20_000;
const MAX_SHEETS: usize = 12;

/// A cell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Cell {
    /// Nothing.
    Empty,
    /// Text.
    Text(String),
    /// Bold text (labels, totals).
    Bold(String),
    /// Column title: bold on a grey fill.
    Header(String),
    /// A whole number.
    Int(i64),
    /// An amount in centavos, shown as `R$ 1.234,56`.
    Money(i64),
    /// A bold amount (totals).
    MoneyBold(i64),
}

/// A sheet: a name (up to 31 characters), column widths and rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sheet {
    /// Tab name.
    pub name: String,
    /// Width of each column, in characters.
    pub widths: Vec<u8>,
    /// Rows, top to bottom.
    pub rows: Vec<Vec<Cell>>,
}

/// A workbook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workbook {
    /// Sheets, in tab order.
    pub sheets: Vec<Sheet>,
}

/// Styles (index into `cellXfs` of styles.xml).
const STYLE_BOLD: u8 = 1;
const STYLE_MONEY: u8 = 2;
const STYLE_MONEY_BOLD: u8 = 3;
const STYLE_HEADER: u8 = 4;

const CONTENT_TYPES_HEAD: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>"#;
const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#;
const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\ #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEBF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>"#;

/// XML text: escaped, without the control characters XML forbids.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\t' | '\n' => out.push(c),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out
}

/// A tab name Excel accepts: no `[]:*?/\`, at most 31 characters, unique.
fn sheet_name(name: &str, index: usize, taken: &[String]) -> String {
    let clean: String = name
        .chars()
        .filter(|c| !matches!(c, '[' | ']' | ':' | '*' | '?' | '/' | '\\') && !c.is_control())
        .take(31)
        .collect();
    let clean = clean.trim().to_owned();
    if clean.is_empty() || taken.contains(&clean) {
        format!("Planilha {}", index + 1)
    } else {
        clean
    }
}

/// `A`, `B`, …, `Z`, `AA`… for a 0-based column.
fn column(mut index: usize) -> String {
    let mut name = Vec::new();
    loop {
        name.push(b'A' + u8::try_from(index % 26).unwrap_or(0));
        if index < 26 {
            break;
        }
        index = index / 26 - 1;
    }
    name.reverse();
    String::from_utf8(name).unwrap_or_default()
}

fn cents(value: i64) -> String {
    let sign = if value < 0 { "-" } else { "" };
    let value = value.unsigned_abs();
    format!("{sign}{}.{:02}", value / 100, value % 100)
}

fn worksheet(sheet: &Sheet) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#,
    );
    if !sheet.widths.is_empty() {
        xml.push_str("<cols>");
        for (index, width) in sheet.widths.iter().enumerate() {
            let _ = write!(
                xml,
                r#"<col min="{n}" max="{n}" width="{width}" customWidth="1"/>"#,
                n = index + 1
            );
        }
        xml.push_str("</cols>");
    }
    xml.push_str("<sheetData>");
    for (r, row) in sheet.rows.iter().enumerate() {
        let _ = write!(xml, r#"<row r="{}">"#, r + 1);
        for (c, cell) in row.iter().enumerate() {
            let at = format!("{}{}", column(c), r + 1);
            let _ = match cell {
                Cell::Empty => Ok(()),
                Cell::Text(text) => write!(
                    xml,
                    r#"<c r="{at}" t="inlineStr"><is><t xml:space="preserve">{}</t></is></c>"#,
                    escape(text)
                ),
                Cell::Bold(text) => write!(
                    xml,
                    r#"<c r="{at}" s="{STYLE_BOLD}" t="inlineStr"><is><t xml:space="preserve">{}</t></is></c>"#,
                    escape(text)
                ),
                Cell::Header(text) => write!(
                    xml,
                    r#"<c r="{at}" s="{STYLE_HEADER}" t="inlineStr"><is><t xml:space="preserve">{}</t></is></c>"#,
                    escape(text)
                ),
                Cell::Int(value) => write!(xml, r#"<c r="{at}"><v>{value}</v></c>"#),
                Cell::Money(value) => write!(
                    xml,
                    r#"<c r="{at}" s="{STYLE_MONEY}"><v>{}</v></c>"#,
                    cents(*value)
                ),
                Cell::MoneyBold(value) => write!(
                    xml,
                    r#"<c r="{at}" s="{STYLE_MONEY_BOLD}"><v>{}</v></c>"#,
                    cents(*value)
                ),
            };
        }
        xml.push_str("</row>");
    }
    xml.push_str("</sheetData></worksheet>");
    xml
}

/// The workbook as an `.xlsx` file.
///
/// # Errors
///
/// [`RenderError::Zip`] when the workbook is empty, too big, or the archive cannot be written.
pub fn xlsx(workbook: &Workbook) -> Result<Vec<u8>, RenderError> {
    if workbook.sheets.is_empty()
        || workbook.sheets.len() > MAX_SHEETS
        || workbook
            .sheets
            .iter()
            .any(|sheet| sheet.rows.len() > MAX_ROWS)
    {
        return Err(RenderError::Zip("workbook size out of range".to_owned()));
    }
    let mut names: Vec<String> = Vec::new();
    for (index, sheet) in workbook.sheets.iter().enumerate() {
        let name = sheet_name(&sheet.name, index, &names);
        names.push(name);
    }
    let mut types = String::from(CONTENT_TYPES_HEAD);
    let mut book = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>"#,
    );
    let mut rels = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
    );
    for (index, name) in names.iter().enumerate() {
        let n = index + 1;
        let _ = write!(
            types,
            r#"<Override PartName="/xl/worksheets/sheet{n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#
        );
        let _ = write!(
            book,
            r#"<sheet name="{}" sheetId="{n}" r:id="rId{n}"/>"#,
            escape(name)
        );
        let _ = write!(
            rels,
            r#"<Relationship Id="rId{n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{n}.xml"/>"#
        );
    }
    let styles_id = names.len() + 1;
    let _ = write!(
        rels,
        r#"<Relationship Id="rId{styles_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#
    );
    types.push_str("</Types>");
    book.push_str("</sheets></workbook>");

    let zip_error = |error: zip::result::ZipError| RenderError::Zip(error.to_string());
    let io_error = |error: std::io::Error| RenderError::Zip(error.to_string());
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .last_modified_time(zip::DateTime::default());
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let mut add = |path: &str, content: &str| -> Result<(), RenderError> {
        writer.start_file(path, options).map_err(zip_error)?;
        writer.write_all(content.as_bytes()).map_err(io_error)
    };
    add("[Content_Types].xml", &types)?;
    add("_rels/.rels", ROOT_RELS)?;
    add("xl/workbook.xml", &book)?;
    add("xl/_rels/workbook.xml.rels", &rels)?;
    add("xl/styles.xml", STYLES)?;
    for (index, sheet) in workbook.sheets.iter().enumerate() {
        add(
            &format!("xl/worksheets/sheet{}.xml", index + 1),
            &worksheet(sheet),
        )?;
    }
    Ok(writer.finish().map_err(zip_error)?.into_inner())
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use super::*;

    #[test]
    fn columns_are_lettered_like_excel() {
        assert_eq!(column(0), "A");
        assert_eq!(column(25), "Z");
        assert_eq!(column(26), "AA");
        assert_eq!(column(27), "AB");
    }

    #[test]
    fn amounts_are_written_in_reais() {
        assert_eq!(cents(123_456), "1234.56");
        assert_eq!(cents(-5), "-0.05");
    }

    #[test]
    fn writes_a_valid_archive_with_escaped_text() {
        let workbook = Workbook {
            sheets: vec![
                Sheet {
                    name: "Resumo".to_owned(),
                    widths: vec![30, 16],
                    rows: vec![
                        vec![
                            Cell::Header("Item".to_owned()),
                            Cell::Header("Valor".to_owned()),
                        ],
                        vec![
                            Cell::Text("Buffet & som <ok>\u{7}".to_owned()),
                            Cell::Money(150_000),
                        ],
                        vec![Cell::Bold("Total".to_owned()), Cell::MoneyBold(150_000)],
                        vec![Cell::Text("Ingressos".to_owned()), Cell::Int(200)],
                    ],
                },
                Sheet {
                    name: "Resumo".to_owned(),
                    widths: Vec::new(),
                    rows: vec![vec![Cell::Empty]],
                },
            ],
        };
        let bytes = xlsx(&workbook).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut sheet = String::new();
        archive
            .by_name("xl/worksheets/sheet1.xml")
            .unwrap()
            .read_to_string(&mut sheet)
            .unwrap();
        assert!(sheet.contains("Buffet &amp; som &lt;ok&gt;</t>"));
        assert!(sheet.contains(r#"<c r="B2" s="2"><v>1500.00</v></c>"#));
        assert!(sheet.contains(r#"<c r="B4"><v>200</v></c>"#));
        let mut book = String::new();
        archive
            .by_name("xl/workbook.xml")
            .unwrap()
            .read_to_string(&mut book)
            .unwrap();
        // A repeated tab name gets a generic one.
        assert!(book.contains(r#"name="Resumo""#) && book.contains(r#"name="Planilha 2""#));
    }

    #[test]
    fn refuses_empty_workbooks() {
        assert!(xlsx(&Workbook { sheets: Vec::new() }).is_err());
    }
}
