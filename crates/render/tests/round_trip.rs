//! Round trip: render → rasterize → decode the QR codes → verify with ticket-core.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "test helpers fail loudly by design"
)]

use std::collections::BTreeSet;

use ticket_core::{
    EventId, EventKey, EventSigningKey, EventTag, EventVerifier, KeyId, KeyStatus, Rejection,
    TicketIssuer, TicketNumber,
};
use ticket_render::{
    Art, PrintOptions, RenderJob, StubSide, TicketDesign, TicketQr, TicketToRender,
    control_sheet_pdf, home_pdf, home_sheet_pngs, print_pdf, ticket_images, whatsapp_zip,
};

const SEED: [u8; 32] = [7; 32];
const EVENT: [u8; 16] = [0x11; 16];
const TAG: u32 = 0xCAFE_F00D;

fn issuer() -> TicketIssuer {
    TicketIssuer::new(
        EventId::from_bytes(EVENT),
        EventTag::new(TAG),
        KeyId::new(1),
        EventSigningKey::from_seed(&SEED),
    )
}

fn verifier() -> EventVerifier {
    EventVerifier::new(
        EventId::from_bytes(EVENT),
        EventTag::new(TAG),
        vec![EventKey {
            key_id: KeyId::new(1),
            public_key: EventSigningKey::from_seed(&SEED).public_key(),
            status: KeyStatus::Active,
        }],
    )
    .unwrap()
}

/// A colourful gradient covering body + bleed (156 × 61 mm at ~12 px/mm), busy enough to
/// challenge the QR quiet zone.
fn art() -> Art {
    let image = image::RgbImage::from_fn(1872, 732, |x, y| {
        image::Rgb([
            (x % 256) as u8,
            (y % 256) as u8,
            ((x / 7 + y / 3) % 256) as u8,
        ])
    });
    let mut png = Vec::new();
    image::DynamicImage::ImageRgb8(image)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .unwrap();
    Art::from_bytes(png).unwrap()
}

fn job(numbers: &[u32], design: TicketDesign) -> RenderJob {
    let issuer = issuer();
    RenderJob {
        design,
        art: Some(art()),
        event_name: "Show de Lançamento — Banda Teste".to_owned(),
        tickets: numbers
            .iter()
            .map(|&number| TicketToRender {
                qr: TicketQr::Signed(issuer.issue(TicketNumber::new(number).unwrap())),
                seller: Some(if number <= 3 { "João" } else { "Maria" }.to_owned()),
            })
            .collect(),
    }
}

fn decode_all(image: &image::GrayImage) -> Vec<String> {
    let mut prepared = rqrr::PreparedImage::prepare(image.clone());
    prepared
        .detect_grids()
        .into_iter()
        .map(|grid| grid.decode().expect("QR decodes").1)
        .collect()
}

fn verified_numbers(texts: &[String]) -> BTreeSet<u32> {
    let verifier = verifier();
    texts
        .iter()
        .map(|text| {
            verifier
                .verify_qr_text(text)
                .expect("authentic")
                .number()
                .get()
        })
        .collect()
}

#[test]
fn whatsapp_images_round_trip() {
    let job = job(&[1, 2, 42], TicketDesign::default_v1());
    let images = ticket_images(&job, 1080).unwrap();
    assert_eq!(images.len(), 3);
    for image in &images {
        let decoded = image::load_from_memory(&image.jpeg).unwrap();
        assert_eq!(decoded.width(), 1080);
        let texts = decode_all(&decoded.to_luma8());
        assert_eq!(texts.len(), 1, "exactly one QR per ticket image");
        assert_eq!(verified_numbers(&texts), BTreeSet::from([image.number]));
    }
}

#[test]
fn home_sheets_round_trip_upright_and_rotated() {
    let mut rotated = TicketDesign::default_v1();
    // 150 + 40 = 190 mm wide does not fit across with 2 columns; a 95 mm-wide body without a
    // stub tiles 2 × 5 upright, and a 120 × 80 body is placed rotated (2 × 2 → 3 × 2).
    rotated.width_mm = 120.0;
    rotated.height_mm = 80.0;
    rotated.stub = None;
    rotated.qr.x_mm = 85.0;
    rotated.qr.y_mm = 40.0;
    for design in [TicketDesign::default_v1(), rotated] {
        let numbers: Vec<u32> = (1..=7).collect();
        let pages = home_sheet_pngs(&job(&numbers, design), 200, 10).unwrap();
        let mut found = BTreeSet::new();
        for png in pages {
            let page = image::load_from_memory(&png).unwrap().to_luma8();
            found.extend(verified_numbers(&decode_all(&page)));
        }
        assert_eq!(found, numbers.iter().copied().collect());
    }
}

#[test]
fn samples_are_rejected_at_the_door() {
    let mut sample = job(&[5], TicketDesign::default_v1());
    sample.tickets[0].qr = TicketQr::Sample { number: 5 };
    let images = ticket_images(&sample, 1080).unwrap();
    let texts = decode_all(&image::load_from_memory(&images[0].jpeg).unwrap().to_luma8());
    assert_eq!(texts.len(), 1);
    assert!(matches!(
        verifier().verify_qr_text(&texts[0]),
        Err(Rejection::Malformed(_))
    ));
}

fn pdf_pages(bytes: &[u8]) -> Vec<lopdf::Dictionary> {
    let document = lopdf::Document::load_mem(bytes).unwrap();
    document
        .get_pages()
        .values()
        .map(|id| document.get_dictionary(*id).unwrap().clone())
        .collect()
}

fn rect(page: &lopdf::Dictionary, key: &[u8]) -> [f32; 4] {
    let values = page.get(key).unwrap().as_array().unwrap();
    let mut out = [0.0; 4];
    for (slot, value) in out.iter_mut().zip(values) {
        *slot = value.as_float().unwrap();
    }
    out
}

fn mm(value: f32) -> f32 {
    value * 72.0 / 25.4
}

#[test]
fn home_pdf_is_a4_and_paginated() {
    let numbers: Vec<u32> = (1..=12).collect();
    let pdf = home_pdf(&job(&numbers, TicketDesign::default_v1())).unwrap();
    let pages = pdf_pages(&pdf);
    // 190 × 55 mm → 5 per sheet → 3 sheets for 12 tickets.
    assert_eq!(pages.len(), 3);
    let media = rect(&pages[0], b"MediaBox");
    assert!((media[2] - media[0] - mm(210.0)).abs() < 0.5);
    assert!((media[3] - media[1] - mm(297.0)).abs() < 0.5);
}

#[test]
fn print_pdf_has_trim_box_and_bleed() {
    let design = TicketDesign::default_v1();
    for crop_marks in [true, false] {
        let pdf = print_pdf(&job(&[1, 2], design.clone()), PrintOptions { crop_marks }).unwrap();
        let pages = pdf_pages(&pdf);
        assert_eq!(pages.len(), 2);
        let outer = if crop_marks { 3.0 + 5.0 } else { 3.0 };
        let media = rect(&pages[0], b"MediaBox");
        let trim = rect(&pages[0], b"TrimBox");
        assert!(
            (media[2] - media[0] - mm(190.0 + 2.0 * outer)).abs() < 0.5,
            "{media:?}"
        );
        assert!((trim[2] - trim[0] - mm(190.0)).abs() < 0.5, "{trim:?}");
        assert!((trim[3] - trim[1] - mm(55.0)).abs() < 0.5, "{trim:?}");
        assert!((trim[0] - media[0] - mm(outer)).abs() < 0.5, "{trim:?}");
    }
}

#[test]
fn control_sheet_has_one_section_per_seller() {
    let numbers: Vec<u32> = (1..=6).collect();
    let pdf = control_sheet_pdf(&job(&numbers, TicketDesign::default_v1())).unwrap();
    assert_eq!(
        pdf_pages(&pdf).len(),
        2,
        "João (1–3) and Maria (4–6) start on separate pages"
    );
}

#[test]
fn outputs_are_reproducible() {
    let job = job(&[1, 2, 3], TicketDesign::default_v1());
    assert_eq!(home_pdf(&job).unwrap(), home_pdf(&job).unwrap());
    assert_eq!(
        print_pdf(&job, PrintOptions::default()).unwrap(),
        print_pdf(&job, PrintOptions::default()).unwrap()
    );
    assert_eq!(
        whatsapp_zip(&job, 600).unwrap(),
        whatsapp_zip(&job, 600).unwrap()
    );
}

#[test]
fn whatsapp_zip_has_one_folder_per_seller() {
    let zip_bytes = whatsapp_zip(&job(&[1, 2, 4], TicketDesign::default_v1()), 600).unwrap();
    let archive = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes)).unwrap();
    let mut names: Vec<&str> = archive.file_names().collect();
    names.sort_unstable();
    assert_eq!(names, ["João/0001.jpg", "João/0002.jpg", "Maria/0004.jpg"]);
}

#[test]
fn right_side_stub_and_no_art_render() {
    let mut design = TicketDesign::default_v1();
    if let Some(stub) = design.stub.as_mut() {
        stub.side = StubSide::Right;
    }
    let mut job = job(&[9], design);
    job.art = None;
    let pages = home_sheet_pngs(&job, 200, 10).unwrap();
    let page = image::load_from_memory(&pages[0]).unwrap().to_luma8();
    assert_eq!(verified_numbers(&decode_all(&page)), BTreeSet::from([9]));
}

#[test]
fn user_text_is_data_not_code() {
    // Typst markup and code in user strings must be printed literally, never evaluated.
    let mut job = job(&[1], TicketDesign::default_v1());
    job.event_name = "#panic(\"boom\") ] [ $x$ #import \"/data.json\"".to_owned();
    job.tickets[0].seller = Some("#read(\"/etc/passwd\")".to_owned());
    if let Some(stub) = job.design.stub.as_mut() {
        stub.fields = vec!["#{1/0}".to_owned()];
    }
    job.design.number.prefix = "#sys ".to_owned();
    home_pdf(&job).unwrap();
    control_sheet_pdf(&job).unwrap();
}
