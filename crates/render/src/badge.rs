//! Credentials (ADR 0111): badges of the staff, the press and the artists, with their role in a
//! coloured band, their name, the areas they may enter and a QR of the event's format v1, four to
//! an A4 with cut lines. The QR texts come signed by the caller; values enter Typst only as data
//! (CLAUDE.md invariant 5).

use serde::Serialize;
use typst::diag::FileError;
use typst::foundations::Bytes;
use typst_layout::PagedDocument;

use crate::qr;
use crate::render::{RenderError, describe, pdf};
use crate::world::MemoryWorld;

const BADGE_TEMPLATE: &str = include_str!("../templates/badge.typ");

/// Most badges in one PDF.
pub const MAX_BADGES: usize = 500;

/// The sheet of badges of an event.
#[derive(Debug, Clone)]
pub struct BadgeSheet {
    /// The event's name.
    pub event: String,
    /// Date and venue.
    pub subtitle: String,
    /// The line at the bottom of every badge ("Pessoal e intransferível").
    pub footer: String,
    pub badges: Vec<Badge>,
}

/// One badge.
#[derive(Debug, Clone)]
pub struct Badge {
    /// The person.
    pub name: String,
    /// What they do there ("Imprensa").
    pub role: String,
    /// Their company, outlet or band.
    pub organization: Option<String>,
    /// Colour of the role's band (`#rrggbb`, dark enough for white text).
    pub color: String,
    /// The printed code ("C-0007").
    pub code: String,
    /// Where it lets in ("Entrada · Camarim").
    pub areas: String,
    /// The signed QR text (format v1).
    pub qr_text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Data<'a> {
    event: &'a str,
    subtitle: &'a str,
    footer: &'a str,
    badges: Vec<BadgeData<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BadgeData<'a> {
    name: &'a str,
    role: &'a str,
    organization: Option<&'a str>,
    color: &'a str,
    code: &'a str,
    areas: &'a str,
    qr: String,
}

fn is_hex_color(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text.chars().skip(1).all(|c| c.is_ascii_hexdigit())
}

/// The badges as a PDF, four per A4 page.
///
/// # Errors
///
/// [`RenderError::Typst`] for no badges, too many, a bad colour, a QR that does not fit or a Typst
/// failure.
pub fn badges_pdf(sheet: &BadgeSheet) -> Result<Vec<u8>, RenderError> {
    if sheet.badges.is_empty() || sheet.badges.len() > MAX_BADGES {
        return Err(RenderError::Typst("1 to 500 badges".to_owned()));
    }
    if sheet.badges.iter().any(|badge| !is_hex_color(&badge.color)) {
        return Err(RenderError::Typst("invalid colour".to_owned()));
    }
    let file_error = |error: FileError| RenderError::Typst(error.to_string());
    let mut world = MemoryWorld::new("/main.typ", BADGE_TEMPLATE).map_err(file_error)?;
    let mut badges = Vec::with_capacity(sheet.badges.len());
    for (index, badge) in sheet.badges.iter().enumerate() {
        let path = format!("/qr/{index}.svg");
        let svg = qr::svg(&badge.qr_text)?;
        world
            .add_file(&path, Bytes::from_string(svg))
            .map_err(file_error)?;
        badges.push(BadgeData {
            name: &badge.name,
            role: &badge.role,
            organization: badge.organization.as_deref(),
            color: &badge.color,
            code: &badge.code,
            areas: &badge.areas,
            qr: path,
        });
    }
    let data = Data {
        event: &sheet.event,
        subtitle: &sheet.subtitle,
        footer: &sheet.footer,
        badges,
    };
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

#[cfg(test)]
mod tests {
    use super::*;

    fn badge(name: &str) -> Badge {
        Badge {
            name: name.to_owned(),
            role: "Imprensa".to_owned(),
            organization: Some("Rádio #[eval(\"1\")]".to_owned()),
            color: "#1d4ed8".to_owned(),
            code: "C-0001".to_owned(),
            areas: "Entrada · Camarim".to_owned(),
            qr_text: crate::render::sample_qr_text(),
        }
    }

    fn sheet(count: usize) -> BadgeSheet {
        BadgeSheet {
            event: "Festival de Inverno".to_owned(),
            subtitle: "21/11/2026 · Praça".to_owned(),
            footer: "Credencial pessoal e intransferível".to_owned(),
            badges: (0..count)
                .map(|index| badge(&format!("Pessoa {index}")))
                .collect(),
        }
    }

    #[test]
    fn four_badges_a_page() {
        let bytes = badges_pdf(&sheet(5)).unwrap();
        let document = lopdf::Document::load_mem(&bytes).unwrap();
        assert_eq!(document.get_pages().len(), 2);
    }

    #[test]
    fn refuses_nothing_or_a_bad_colour() {
        assert!(badges_pdf(&sheet(0)).is_err());
        let mut bad = sheet(1);
        bad.badges[0].color = "blue".to_owned();
        assert!(badges_pdf(&bad).is_err());
    }
}
