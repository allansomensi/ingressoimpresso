//! Certificates of participation (ADRs 0113, 0114): one A4 page per person (two with a back), drawn
//! from the event's design with the fields filled for that person. Values enter Typst only as
//! data (CLAUDE.md invariant 5).

use serde::Serialize;
use serde_json::{Value, json};
use typst::diag::FileError;
use typst::foundations::Bytes;
use typst_layout::PagedDocument;

use crate::certificate_design::{
    CertificateDesign, CertificateElement, CertificatePage, ImageSource,
};
use crate::qr;
use crate::render::{Art, RenderError, describe, pdf};
use crate::world::MemoryWorld;

const CERTIFICATE_TEMPLATE: &str = include_str!("../templates/certificate.typ");

/// The line at the bottom of the front when the design keeps the brand.
pub const CERTIFICATE_BRAND: &str = "Emitido com Ingresso Impresso · ingressoimpresso.com.br";

/// Fields of a certificate's texts, without braces. The panel's preview mirrors them
/// (`apps/web/src/lib/certificates.ts`), tested with the same examples.
pub const CERTIFICATE_FIELDS: &[&str] = &[
    "nome",
    "evento",
    "data",
    "dias",
    "local",
    "organizacao",
    "carga",
    "codigo",
];

/// What a certificate's texts can say.
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
    /// "CERT-0007".
    pub code: Option<String>,
}

/// "21 de novembro de 2026".
fn long_date(date: time::PrimitiveDateTime) -> String {
    let month = crate::texts::MONTHS
        .get(usize::from(u8::from(date.month()) - 1))
        .copied()
        .unwrap_or_default();
    format!("{} de {month} de {}", date.day(), date.year())
}

fn field_value(name: &str, fields: &CertificateFields) -> String {
    let value = match name {
        "nome" => fields.name.clone(),
        "evento" => fields.event.clone(),
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
        "codigo" => fields.code.clone().unwrap_or_default(),
        _ => String::new(),
    };
    value.trim().to_owned()
}

/// The text with its fields filled: `{nome}` becomes its own bold segment, the others plain text
/// (a field without a value, such as a venue never given, prints nothing). Unknown names in
/// braces stay as typed. A text whose fields are all empty ("Carga horária: {carga}" without a
/// workload) is left out: no segments at all.
pub fn fill_certificate(text: &str, fields: &CertificateFields) -> Vec<CertificateSegment> {
    let mut segments: Vec<CertificateSegment> = Vec::new();
    let mut plain = String::new();
    let mut rest = text;
    let (mut found, mut filled) = (0, 0);
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
        let value = field_value(name, fields);
        found += 1;
        if !value.is_empty() {
            filled += 1;
        }
        if name == "nome" {
            if !plain.is_empty() {
                segments.push(CertificateSegment {
                    text: std::mem::take(&mut plain),
                    strong: false,
                });
            }
            segments.push(CertificateSegment {
                text: value,
                strong: true,
            });
            continue;
        }
        plain.push_str(&value);
    }
    plain.push_str(rest);
    if found > 0 && filled == 0 {
        return Vec::new();
    }
    if !plain.is_empty() {
        segments.push(CertificateSegment {
            text: plain,
            strong: false,
        });
    }
    segments
}

/// A piece of a certificate's text; the person's name may be set in bold.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CertificateSegment {
    pub text: String,
    pub strong: bool,
}

/// One certificate to print: the design, the person's fields and the images.
#[derive(Debug, Clone)]
pub struct Certificate {
    pub design: CertificateDesign,
    pub fields: CertificateFields,
    /// The certificate's uploaded images, by index (`None`: missing, its elements are skipped).
    pub images: Vec<Option<Art>>,
    /// The organization's logo, when it has one.
    pub organization_logo: Option<Art>,
    /// What the QR opens (the page that confirms the certificate).
    pub check_url: String,
}

fn image_path(index: usize, art: &Art) -> String {
    format!("/image-{index}{}", art.extension())
}

const LOGO_PATH: &str = "/organization-logo";

impl Certificate {
    /// The path of an image in the Typst world, when it can be printed.
    fn source_path(&self, source: ImageSource) -> Option<String> {
        match source {
            ImageSource::Organization => self
                .organization_logo
                .as_ref()
                .map(|logo| format!("{LOGO_PATH}{}", logo.extension())),
            ImageSource::Upload { index } => self.upload_path(index),
        }
    }

    fn upload_path(&self, index: u8) -> Option<String> {
        let index = usize::from(index);
        self.images
            .get(index)
            .and_then(Option::as_ref)
            .map(|art| image_path(index, art))
    }

    /// The JSON of one element as the template draws it, or `None` when it prints nothing (an
    /// image without a file, a text without values).
    fn element_data(&self, element: &CertificateElement) -> Result<Option<Value>, RenderError> {
        let mut data =
            serde_json::to_value(element).map_err(|error| RenderError::Typst(error.to_string()))?;
        match element {
            CertificateElement::Text(text) => {
                let segments = fill_certificate(&text.text, &self.fields);
                if segments
                    .iter()
                    .all(|segment| segment.text.trim().is_empty())
                {
                    return Ok(None);
                }
                data["segments"] = json!(segments);
            }
            CertificateElement::Image(image) => {
                let Some(path) = self.source_path(image.source) else {
                    return Ok(None);
                };
                data["path"] = json!(path);
            }
            CertificateElement::Signature(signature) => {
                data["path"] = json!(signature.image.and_then(|index| self.upload_path(index)));
            }
            CertificateElement::Qr(_) => {
                data["path"] = json!("/qr.svg");
            }
            CertificateElement::Seal(seal) => {
                let text = |value: &str| {
                    fill_certificate(value, &self.fields)
                        .into_iter()
                        .map(|segment| segment.text)
                        .collect::<String>()
                };
                data["text"] = json!(text(&seal.text));
                data["center"] = json!(text(&seal.center));
            }
            CertificateElement::Line(_) | CertificateElement::Shape(_) => {}
        }
        Ok(Some(data))
    }

    fn page_data(&self, page: &CertificatePage, front: bool) -> Result<Value, RenderError> {
        let elements = page
            .elements
            .iter()
            .map(|element| self.element_data(element))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        Ok(json!({
            "backgroundColor": page.background_color,
            "backgroundImage": page.background_image.and_then(|index| self.upload_path(index)),
            "frame": page.frame,
            "elements": elements,
            "brand": (front && self.design.brand).then_some(CERTIFICATE_BRAND),
        }))
    }

    fn data(&self) -> Result<Value, RenderError> {
        let (width, height) = self.design.page_size_mm();
        let mut pages = vec![self.page_data(&self.design.front, true)?];
        if let Some(back) = &self.design.back {
            pages.push(self.page_data(back, false)?);
        }
        Ok(json!({ "width": width, "height": height, "pages": pages }))
    }
}

/// The certificate as a PDF: one page, two with a back.
///
/// # Errors
///
/// [`RenderError::Typst`] for an invalid design or a Typst failure; [`RenderError::Qr`] when the
/// link does not fit a QR.
pub fn certificate_pdf(certificate: &Certificate) -> Result<Vec<u8>, RenderError> {
    let images = certificate.images.len();
    certificate.design.validate(images).map_err(|issues| {
        RenderError::Typst(
            issues
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("; "),
        )
    })?;
    let file_error = |error: FileError| RenderError::Typst(error.to_string());
    let mut world = MemoryWorld::new("/main.typ", CERTIFICATE_TEMPLATE).map_err(file_error)?;
    world
        .add_file(
            "/qr.svg",
            Bytes::from_string(qr::svg(&certificate.check_url)?),
        )
        .map_err(file_error)?;
    for (index, art) in certificate.images.iter().enumerate() {
        if let Some(art) = art {
            world
                .add_file(&image_path(index, art), art.bytes.clone())
                .map_err(file_error)?;
        }
    }
    if let Some(logo) = &certificate.organization_logo {
        world
            .add_file(
                &format!("{LOGO_PATH}{}", logo.extension()),
                logo.bytes.clone(),
            )
            .map_err(file_error)?;
    }
    let json = serde_json::to_vec(&certificate.data()?)
        .map_err(|error| RenderError::Typst(error.to_string()))?;
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
    use crate::FontChoice;
    use crate::certificate_design::{
        CertificateFrame, CertificateLine, CertificateQr, CertificateSeal, CertificateShape,
        CertificateSignature, CertificateText, FrameStyle, LineStyle, PageOrientation,
        ParagraphAlign, VerticalAlign,
    };

    fn png() -> Art {
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(60, 30, |x, _| {
            image::Rgba([20, 40, 90, if x < 5 { 0 } else { 255 }])
        }))
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
        Art::from_bytes(bytes).unwrap()
    }

    fn day(d: u8) -> time::PrimitiveDateTime {
        time::PrimitiveDateTime::new(
            time::Date::from_calendar_date(2026, time::Month::November, d).unwrap(),
            time::Time::from_hms(19, 0, 0).unwrap(),
        )
    }

    fn fields() -> CertificateFields {
        CertificateFields {
            name: "Ana #[eval(\"1\")] Souza".to_owned(),
            event: "Semana de Ciências".to_owned(),
            days: vec![day(21)],
            venue: Some("Escola Estadual".to_owned()),
            organization: Some("Escola".to_owned()),
            workload: Some("8 horas".to_owned()),
            code: Some("CERT-0007".to_owned()),
        }
    }

    pub(crate) fn certificate() -> Certificate {
        let design = CertificateDesign::classic(
            "Certificado de participação",
            "Certificamos que {nome} participou da {evento}, realizada em {data}.",
            &[
                ("Maria Lima".to_owned(), Some("Diretora".to_owned())),
                ("João Reis".to_owned(), None),
            ],
            "#0f766e",
        );
        Certificate {
            design,
            fields: fields(),
            images: Vec::new(),
            organization_logo: Some(png()),
            check_url: "https://ingressoimpresso.com.br/certificado#abc".to_owned(),
        }
    }

    #[test]
    fn fills_the_fields_with_the_name_apart() {
        let fields = CertificateFields {
            name: " Ana Souza ".to_owned(),
            days: vec![day(21), day(22)],
            organization: None,
            ..fields()
        };
        let filled = fill_certificate(
            "Certificamos que {nome} participou de {evento} ({dias}, {local}), {carga}{organizacao}. {codigo} {outro}",
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
                    text: " participou de Semana de Ciências (21 e 22 de novembro de 2026, Escola Estadual), 8 horas. CERT-0007 {outro}".to_owned(),
                    strong: false
                },
            ]
        );
        assert_eq!(
            fill_certificate(
                "em {data}",
                &CertificateFields {
                    days: vec![day(21)],
                    ..fields.clone()
                }
            ),
            [CertificateSegment {
                text: "em 21 de novembro de 2026".to_owned(),
                strong: false
            }]
        );
        // Every field empty: the whole text goes; one filled keeps it.
        let empty = CertificateFields {
            workload: None,
            venue: None,
            ..fields.clone()
        };
        assert_eq!(fill_certificate("Carga horária: {carga}", &empty), []);
        assert_eq!(
            fill_certificate("{local} · {evento}", &empty),
            [CertificateSegment {
                text: " · Semana de Ciências".to_owned(),
                strong: false
            }]
        );
        assert_eq!(
            fill_certificate("Sem campos", &empty),
            [CertificateSegment {
                text: "Sem campos".to_owned(),
                strong: false
            }]
        );
    }

    #[test]
    fn one_landscape_page() {
        let bytes = certificate_pdf(&certificate()).unwrap();
        let document = lopdf::Document::load_mem(&bytes).unwrap();
        assert_eq!(document.get_pages().len(), 1);
        let page = document.get_pages()[&1];
        let media = document
            .get_dictionary(page)
            .unwrap()
            .get(b"MediaBox")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_float().unwrap())
            .collect::<Vec<_>>();
        // A4 lying down, in points.
        assert!(
            (media[2] - 841.89).abs() < 0.5 && (media[3] - 595.28).abs() < 0.5,
            "{media:?}"
        );
    }

    #[test]
    #[expect(
        clippy::too_many_lines,
        reason = "one design with every kind of element"
    )]
    fn every_element_and_a_back() {
        let mut full = certificate();
        let text = |text: &str, y_mm: f64, font: FontChoice| {
            CertificateElement::Text(CertificateText {
                text: text.to_owned(),
                x_mm: 20.0,
                y_mm,
                width_mm: 170.0,
                height_mm: 30.0,
                font,
                size_pt: 60.0,
                color: "#222222".to_owned(),
                align: ParagraphAlign::Justify,
                valign: VerticalAlign::Top,
                bold: true,
                italic: true,
                uppercase: true,
                letter_spacing: 0.05,
                line_height: 1.6,
                bold_name: false,
            })
        };
        full.images = vec![Some(png()), None];
        full.design.front.background_image = Some(0);
        full.design
            .front
            .elements
            .push(CertificateElement::Signature(CertificateSignature {
                x_mm: 100.0,
                y_mm: 100.0,
                width_mm: 60.0,
                height_mm: 30.0,
                name: String::new(),
                role: String::new(),
                image: Some(0),
                font: FontChoice::Script,
                size_pt: 12.0,
                color: "#000000".to_owned(),
                line_color: "#000000".to_owned(),
            }));
        full.design.front.elements.push(CertificateElement::Image(
            crate::certificate_design::CertificateImage {
                // The second image is gone: nothing is printed for it.
                source: ImageSource::Upload { index: 1 },
                x_mm: 10.0,
                y_mm: 10.0,
                width_mm: 20.0,
                height_mm: 20.0,
            },
        ));
        let mut back = CertificatePage {
            background_color: "#ffffff".to_owned(),
            background_image: None,
            frame: None,
            elements: vec![
                text(
                    &"Conteúdo programático da semana. ".repeat(40),
                    20.0,
                    FontChoice::Classic,
                ),
                text("{nome}", 60.0, FontChoice::Roman),
                CertificateElement::Line(CertificateLine {
                    x_mm: 20.0,
                    y_mm: 100.0,
                    width_mm: 100.0,
                    height_mm: 3.0,
                    style: LineStyle::Dotted,
                    color: "#999999".to_owned(),
                    thickness_mm: 0.5,
                }),
                CertificateElement::Shape(CertificateShape {
                    x_mm: 0.0,
                    y_mm: 200.0,
                    width_mm: 297.0,
                    height_mm: 10.0,
                    color: "#0f766e".to_owned(),
                    opacity: 0.4,
                    radius_mm: 2.0,
                }),
                CertificateElement::Seal(CertificateSeal {
                    x_mm: 200.0,
                    y_mm: 100.0,
                    size_mm: 40.0,
                    color: "#b8860b".to_owned(),
                    text_color: "#ffffff".to_owned(),
                    text: "{organizacao}".to_owned(),
                    center: "2026".to_owned(),
                }),
                CertificateElement::Qr(CertificateQr {
                    x_mm: 250.0,
                    y_mm: 20.0,
                    size_mm: 20.0,
                }),
            ],
        };
        for style in [
            FrameStyle::Simple,
            FrameStyle::Double,
            FrameStyle::Band,
            FrameStyle::Classic,
            FrameStyle::Corners,
            FrameStyle::Geometric,
            FrameStyle::Side,
        ] {
            back.frame = Some(CertificateFrame {
                style,
                color: "#0f766e".to_owned(),
                accent: "#b8860b".to_owned(),
                margin_mm: 8.0,
                thickness_mm: 1.0,
            });
            full.design.back = Some(back.clone());
            let bytes = certificate_pdf(&full).unwrap_or_else(|error| panic!("{style:?}: {error}"));
            let document = lopdf::Document::load_mem(&bytes).unwrap();
            assert_eq!(document.get_pages().len(), 2);
        }
    }

    #[test]
    fn portrait() {
        let mut tall = certificate();
        tall.design.orientation = PageOrientation::Portrait;
        tall.design.front.elements.retain(|element| {
            let (x, _, width, _) = element.rect();
            x + width <= 210.0
        });
        tall.design
            .front
            .elements
            .push(CertificateElement::Qr(CertificateQr {
                x_mm: 20.0,
                y_mm: 250.0,
                size_mm: 22.0,
            }));
        let bytes = certificate_pdf(&tall).unwrap();
        assert_eq!(
            lopdf::Document::load_mem(&bytes).unwrap().get_pages().len(),
            1
        );
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
    fn refuses_an_invalid_design() {
        let mut broken = certificate();
        broken.design.front.background_color = "teal".to_owned();
        assert!(certificate_pdf(&broken).is_err());
        let mut no_logo = certificate();
        no_logo.organization_logo = None;
        assert!(certificate_pdf(&no_logo).is_ok());
    }
}
