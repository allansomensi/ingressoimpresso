//! Certificates of participation (ADR 0113): one A4 landscape page per person who came, with the
//! event's words, the signatures and a QR to the page that confirms it. Values come resolved by
//! the caller and enter Typst only as data (CLAUDE.md invariant 5).

use serde::Serialize;
use typst::diag::FileError;
use typst::foundations::Bytes;
use typst_layout::PagedDocument;

use crate::qr;
use crate::render::{RenderError, describe, pdf};
use crate::world::MemoryWorld;

const CERTIFICATE_TEMPLATE: &str = include_str!("../templates/certificate.typ");

/// Fields of a certificate's text, without braces. The panel's preview mirrors them
/// (`apps/web/src/lib/certificates.ts`), tested with the same examples.
pub const CERTIFICATE_FIELDS: &[&str] = &[
    "nome",
    "evento",
    "data",
    "dias",
    "local",
    "organizacao",
    "carga",
];

/// What a certificate's text can say.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CertificateFields {
    /// The person.
    pub name: String,
    /// The event.
    pub event: String,
    /// Start of each day, in the wall-clock time of the event's place (one for an event of one
    /// day).
    pub days: Vec<time::PrimitiveDateTime>,
    pub venue: Option<String>,
    pub organization: Option<String>,
    /// "8 horas".
    pub workload: Option<String>,
}

/// "21 de novembro de 2026".
fn long_date(date: time::PrimitiveDateTime) -> String {
    let month = crate::texts::MONTHS
        .get(usize::from(u8::from(date.month()) - 1))
        .copied()
        .unwrap_or_default();
    format!("{} de {month} de {}", date.day(), date.year())
}

/// The certificate's text with its fields filled: `{nome}` becomes its own bold segment, the
/// others plain text (a field without a value, such as a venue never given, prints nothing).
/// Unknown names in braces stay as typed.
pub fn fill_certificate(text: &str, fields: &CertificateFields) -> Vec<CertificateSegment> {
    let mut segments: Vec<CertificateSegment> = Vec::new();
    let mut plain = String::new();
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        let (before, from_brace) = rest.split_at(open);
        plain.push_str(before);
        let field = from_brace.get(1..).and_then(|after| {
            let close = after.find('}')?;
            let name = after.get(..close)?;
            CERTIFICATE_FIELDS.contains(&name).then_some((name, close))
        });
        let Some((name, close)) = field else {
            plain.push('{');
            rest = from_brace.get(1..).unwrap_or_default();
            continue;
        };
        rest = from_brace.get(close + 2..).unwrap_or_default();
        let value = match name {
            "nome" => {
                if !plain.is_empty() {
                    segments.push(CertificateSegment {
                        text: std::mem::take(&mut plain),
                        strong: false,
                    });
                }
                segments.push(CertificateSegment {
                    text: fields.name.trim().to_owned(),
                    strong: true,
                });
                continue;
            }
            "evento" => fields.event.trim().to_owned(),
            "data" => fields
                .days
                .first()
                .copied()
                .map(long_date)
                .unwrap_or_default(),
            "dias" => crate::fields::days_text(&fields.days),
            "local" => fields.venue.clone().unwrap_or_default(),
            "organizacao" => fields.organization.clone().unwrap_or_default(),
            "carga" => fields.workload.clone().unwrap_or_default(),
            _ => String::new(),
        };
        plain.push_str(value.trim());
    }
    plain.push_str(rest);
    if !plain.is_empty() {
        segments.push(CertificateSegment {
            text: plain,
            strong: false,
        });
    }
    segments
}

/// A piece of the certificate's text; the person's name is set in bold.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CertificateSegment {
    pub text: String,
    pub strong: bool,
}

/// Who signs.
#[derive(Debug, Clone, Serialize)]
pub struct CertificateSigner {
    pub name: String,
    pub role: Option<String>,
}

/// One certificate, every value already in words.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Certificate {
    /// The small line above the title ("Certificado").
    pub kicker: String,
    /// "Certificado de participação".
    pub title: String,
    /// The text, with the person's name in its own segments.
    pub body: Vec<CertificateSegment>,
    /// "Carga horária:".
    pub workload_label: String,
    /// "8 horas"; `None`: no line.
    pub workload: Option<String>,
    /// "Porto Alegre, 21 de novembro de 2026".
    pub place: String,
    /// Up to two.
    pub signers: Vec<CertificateSigner>,
    /// Colour of the frame and the kicker (`#rrggbb`).
    pub color: String,
    /// "Código CERT-0007".
    pub code: String,
    /// "Confira com o QR".
    pub check: String,
    /// What the QR opens (the page that confirms the certificate).
    #[serde(skip)]
    pub check_url: String,
}

fn is_hex_color(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text.chars().skip(1).all(|c| c.is_ascii_hexdigit())
}

/// The certificate as a one-page PDF.
///
/// # Errors
///
/// [`RenderError::Typst`] for more than two signers, a bad colour or a Typst failure;
/// [`RenderError::Qr`] when the link does not fit a QR.
pub fn certificate_pdf(certificate: &Certificate) -> Result<Vec<u8>, RenderError> {
    if certificate.signers.len() > 2 {
        return Err(RenderError::Typst("at most two signers".to_owned()));
    }
    if !is_hex_color(&certificate.color) {
        return Err(RenderError::Typst("invalid colour".to_owned()));
    }
    let file_error = |error: FileError| RenderError::Typst(error.to_string());
    let mut world = MemoryWorld::new("/main.typ", CERTIFICATE_TEMPLATE).map_err(file_error)?;
    world
        .add_file(
            "/qr.svg",
            Bytes::from_string(qr::svg(&certificate.check_url)?),
        )
        .map_err(file_error)?;
    let mut data =
        serde_json::to_value(certificate).map_err(|error| RenderError::Typst(error.to_string()))?;
    data["qr"] = serde_json::Value::String("/qr.svg".to_owned());
    let json = serde_json::to_vec(&data).map_err(|error| RenderError::Typst(error.to_string()))?;
    world
        .add_file("/data.json", Bytes::new(json))
        .map_err(file_error)?;
    let compiled = typst::compile::<PagedDocument>(&world)
        .output
        .map_err(|diagnostics| RenderError::Typst(describe(&diagnostics)));
    typst::comemo::evict(0);
    pdf(&compiled?)
}

/// Most certificates in one ZIP.
pub const MAX_CERTIFICATES: usize = 2000;

/// Every certificate of an event as PDFs in a ZIP, one file per person (`(file name, certificate)`).
///
/// # Errors
///
/// See [`certificate_pdf`]; [`RenderError::Zip`] when the archive cannot be written, and
/// [`RenderError::Typst`] for more than [`MAX_CERTIFICATES`].
pub fn certificates_zip(items: &[(String, Certificate)]) -> Result<Vec<u8>, RenderError> {
    use std::io::Write as _;
    if items.len() > MAX_CERTIFICATES {
        return Err(RenderError::Typst("too many certificates".to_owned()));
    }
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    // A PDF is already compressed; a fixed timestamp keeps the archive reproducible.
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .last_modified_time(zip::DateTime::default());
    for (name, certificate) in items {
        let bytes = certificate_pdf(certificate)?;
        writer
            .start_file(name.as_str(), options)
            .map_err(|error| RenderError::Zip(error.to_string()))?;
        writer
            .write_all(&bytes)
            .map_err(|error| RenderError::Zip(error.to_string()))?;
    }
    Ok(writer
        .finish()
        .map_err(|error| RenderError::Zip(error.to_string()))?
        .into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn certificate() -> Certificate {
        let segment = |text: &str, strong: bool| CertificateSegment {
            text: text.to_owned(),
            strong,
        };
        Certificate {
            kicker: "Certificado".to_owned(),
            title: "Certificado de participação".to_owned(),
            body: vec![
                segment("Certificamos que ", false),
                segment("Ana #[eval(\"1\")] Souza", true),
                segment(
                    " participou da Semana de Ciências, realizada em 21 de novembro de 2026.",
                    false,
                ),
            ],
            workload_label: "Carga horária:".to_owned(),
            workload: Some("8 horas".to_owned()),
            place: "Escola Estadual · 21 de novembro de 2026".to_owned(),
            signers: vec![
                CertificateSigner {
                    name: "Maria Lima".to_owned(),
                    role: Some("Diretora".to_owned()),
                },
                CertificateSigner {
                    name: "João Reis".to_owned(),
                    role: None,
                },
            ],
            color: "#0f766e".to_owned(),
            code: "Código CERT-0007".to_owned(),
            check: "Confira com o QR".to_owned(),
            check_url: "https://ingressoimpresso.com.br/certificado#abc".to_owned(),
        }
    }

    #[test]
    fn fills_the_fields_with_the_name_apart() {
        let day = |d: u8| {
            time::PrimitiveDateTime::new(
                time::Date::from_calendar_date(2026, time::Month::November, d).unwrap(),
                time::Time::from_hms(19, 0, 0).unwrap(),
            )
        };
        let fields = CertificateFields {
            name: " Ana Souza ".to_owned(),
            event: "Semana de Ciências".to_owned(),
            days: vec![day(21), day(22)],
            venue: Some("Escola Estadual".to_owned()),
            organization: None,
            workload: Some("8 horas".to_owned()),
        };
        let filled = fill_certificate(
            "Certificamos que {nome} participou de {evento} ({dias}, {local}), {carga}{organizacao}. {outro}",
            &fields,
        );
        assert_eq!(
            filled,
            [
                CertificateSegment {
                    text: "Certificamos que ".to_owned(),
                    strong: false
                },
                CertificateSegment {
                    text: "Ana Souza".to_owned(),
                    strong: true
                },
                CertificateSegment {
                    text: " participou de Semana de Ciências (21 e 22 de novembro de 2026, Escola Estadual), 8 horas. {outro}".to_owned(),
                    strong: false
                },
            ]
        );
        let one_day = CertificateFields {
            days: vec![day(21)],
            ..fields
        };
        assert_eq!(
            fill_certificate("em {data}", &one_day),
            [CertificateSegment {
                text: "em 21 de novembro de 2026".to_owned(),
                strong: false
            }]
        );
    }

    #[test]
    fn one_landscape_page() {
        let bytes = certificate_pdf(&certificate()).unwrap();
        let document = lopdf::Document::load_mem(&bytes).unwrap();
        assert_eq!(document.get_pages().len(), 1);
    }

    #[test]
    fn a_zip_with_a_file_per_person() {
        let items = vec![
            ("0001-ana.pdf".to_owned(), certificate()),
            ("0002-bia.pdf".to_owned(), certificate()),
        ];
        let bytes = certificates_zip(&items).unwrap();
        let archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(archive.len(), 2);
    }

    #[test]
    fn without_signers_nor_workload() {
        let mut plain = certificate();
        plain.signers.clear();
        plain.workload = None;
        assert!(certificate_pdf(&plain).is_ok());
        plain.color = "teal".to_owned();
        assert!(certificate_pdf(&plain).is_err());
    }
}
