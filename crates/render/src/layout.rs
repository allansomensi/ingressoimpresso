//! Imposition of tickets on A4 sheets for home printing.

use serde::Serialize;

/// A4 portrait, in millimetres.
pub(crate) const A4_MM: (f64, f64) = (210.0, 297.0);
/// Page margin kept free for home printers (non-printable area + cut marks).
pub(crate) const HOME_MARGIN_MM: f64 = 10.0;

/// Tickets laid out on a sheet: edge to edge (single guillotine cuts) on plain A4, or one per
/// piece of a ready-made paper (ADR 0102).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Grid {
    pub cols: u32,
    pub rows: u32,
    /// Tickets turned 90°.
    pub rotated: bool,
    /// Cell size on the sheet (after rotation).
    pub cell_w_mm: f64,
    pub cell_h_mm: f64,
    /// Top-left corner of the grid.
    pub origin_x_mm: f64,
    pub origin_y_mm: f64,
    /// Distance from one cell to the next (labels have gaps between them).
    pub pitch_x_mm: f64,
    pub pitch_y_mm: f64,
    /// The ticket's size on the sheet over its real size (1 on plain A4).
    pub scale: f64,
    /// Offset of the ticket inside its cell (centred).
    pub inset_x_mm: f64,
    pub inset_y_mm: f64,
    /// Cut marks in the margins (plain A4 only: ready-made paper is already cut).
    pub marks: bool,
}

impl Grid {
    pub(crate) fn per_page(&self) -> u32 {
        self.cols * self.rows
    }
}

/// Best grid for an item of `width × height` mm on A4, trying both orientations.
/// Returns `None` if the item does not fit even once.
pub(crate) fn a4_grid(width_mm: f64, height_mm: f64) -> Option<Grid> {
    let upright = grid(width_mm, height_mm, false);
    let rotated = grid(height_mm, width_mm, true);
    match (upright, rotated) {
        (Some(a), Some(b)) => Some(if b.per_page() > a.per_page() { b } else { a }),
        (a, b) => a.or(b),
    }
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "floor of a finite, non-negative ratio of page and item sizes (both bounded by validation)"
)]
fn grid(item_width_mm: f64, item_height_mm: f64, rotated: bool) -> Option<Grid> {
    let usable_w = A4_MM.0 - 2.0 * HOME_MARGIN_MM;
    let usable_h = A4_MM.1 - 2.0 * HOME_MARGIN_MM;
    if !(item_width_mm > 0.0 && item_height_mm > 0.0) {
        return None;
    }
    let cols = (usable_w / item_width_mm).floor().max(0.0) as u32;
    let rows = (usable_h / item_height_mm).floor().max(0.0) as u32;
    if cols == 0 || rows == 0 {
        return None;
    }
    Some(Grid {
        cols,
        rows,
        rotated,
        cell_w_mm: item_width_mm,
        cell_h_mm: item_height_mm,
        origin_x_mm: (A4_MM.0 - f64::from(cols) * item_width_mm) / 2.0,
        origin_y_mm: (A4_MM.1 - f64::from(rows) * item_height_mm) / 2.0,
        pitch_x_mm: item_width_mm,
        pitch_y_mm: item_height_mm,
        scale: 1.0,
        inset_x_mm: 0.0,
        inset_y_mm: 0.0,
        marks: true,
    })
}

/// A ready-made A4 paper (ADR 0102): plain with cut marks, pre-perforated or a sheet of labels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Paper {
    /// Plain A4: tickets edge to edge with cut marks in the margins.
    Plain,
    /// A4 perforated in 3 strips of 210 × 99 mm.
    Perforated3,
    /// A4 perforated in 4 pieces of 105 × 148.5 mm.
    Perforated4,
    /// A4 perforated in 6 pieces of 105 × 99 mm.
    Perforated6,
    /// A4 perforated in 8 pieces of 105 × 74.25 mm.
    Perforated8,
    /// A4 perforated in 10 pieces of 105 × 59.4 mm.
    Perforated10,
    /// A4 sheet of 21 labels of 63.5 × 38.1 mm (3 × 7).
    Labels21,
    /// A4 sheet of 14 labels of 99.1 × 38.1 mm (2 × 7).
    Labels14,
    /// A4 sheet of 8 labels of 99.1 × 67.7 mm (2 × 4).
    Labels8,
    /// A4 sheet of 2 labels of 199.6 × 143.5 mm.
    Labels2,
}

impl Paper {
    /// Every paper, in the order the panel lists them.
    pub const ALL: [Self; 10] = [
        Self::Plain,
        Self::Perforated3,
        Self::Perforated4,
        Self::Perforated6,
        Self::Perforated8,
        Self::Perforated10,
        Self::Labels21,
        Self::Labels14,
        Self::Labels8,
        Self::Labels2,
    ];

    /// The pieces of the sheet: columns, rows, piece size, first piece's corner, pitch and the
    /// margin kept free inside each piece.
    const fn spec(self) -> Option<PaperSpec> {
        // Perforated sheets are cut edge to edge, so the outer pieces touch the sheet's edge,
        // which home printers do not print: 5 mm stay free inside every piece.
        const fn perforated(cols: u32, rows: u32) -> PaperSpec {
            let w = A4_MM.0 / cols as f64;
            let h = A4_MM.1 / rows as f64;
            PaperSpec { cols, rows, w, h, x: 0.0, y: 0.0, pitch_x: w, pitch_y: h, padding: 5.0 }
        }
        // The usual A4 label layouts (the same sizes under several brands).
        const fn labels(cols: u32, rows: u32, w: f64, h: f64, x: f64, y: f64, pitch_x: f64) -> PaperSpec {
            PaperSpec { cols, rows, w, h, x, y, pitch_x, pitch_y: h, padding: 1.5 }
        }
        Some(match self {
            Self::Plain => return None,
            Self::Perforated3 => perforated(1, 3),
            Self::Perforated4 => perforated(2, 2),
            Self::Perforated6 => perforated(2, 3),
            Self::Perforated8 => perforated(2, 4),
            Self::Perforated10 => perforated(2, 5),
            Self::Labels21 => labels(3, 7, 63.5, 38.1, 7.25, 15.15, 66.04),
            Self::Labels14 => labels(2, 7, 99.1, 38.1, 4.65, 15.15, 101.6),
            Self::Labels8 => labels(2, 4, 99.1, 67.7, 4.65, 13.1, 101.6),
            Self::Labels2 => labels(1, 2, 199.6, 143.5, 5.2, 5.0, 199.6),
        })
    }

    /// Pieces per sheet.
    #[must_use]
    pub fn per_sheet(self) -> u32 {
        self.spec().map_or(0, |spec| spec.cols * spec.rows)
    }

    /// The size of one piece, in millimetres (`None` for plain A4).
    #[must_use]
    pub fn piece_mm(self) -> Option<(f64, f64)> {
        self.spec().map(|spec| (spec.w, spec.h))
    }
}

#[derive(Debug, Clone, Copy)]
struct PaperSpec {
    cols: u32,
    rows: u32,
    w: f64,
    h: f64,
    x: f64,
    y: f64,
    pitch_x: f64,
    pitch_y: f64,
    padding: f64,
}

/// How a ticket of `width × height` mm sits on a ready-made paper: one per piece, turned when
/// that makes it bigger, and scaled down (never up) only when it does not fit as it is.
/// `None` when it would have to shrink below half its size or its QR below `min_qr_mm`.
pub(crate) fn paper_grid(
    paper: Paper,
    width_mm: f64,
    height_mm: f64,
    qr_mm: f64,
    min_qr_mm: f64,
) -> Option<Grid> {
    let Some(spec) = paper.spec() else {
        return a4_grid(width_mm, height_mm);
    };
    if !(width_mm > 0.0 && height_mm > 0.0) {
        return None;
    }
    let fits = |w: f64, h: f64| w <= spec.w + 1e-9 && h <= spec.h + 1e-9;
    // As it is when it fits the piece (a ficha on its own label), else shrunk inside the margin.
    let scale_of = |w: f64, h: f64| {
        if fits(w, h) {
            1.0
        } else {
            ((spec.w - 2.0 * spec.padding) / w)
                .min((spec.h - 2.0 * spec.padding) / h)
                .min(1.0)
        }
    };
    let upright = scale_of(width_mm, height_mm);
    let turned = scale_of(height_mm, width_mm);
    let rotated = turned > upright + 1e-9;
    let scale = upright.max(turned);
    if scale < 0.5 || qr_mm * scale < min_qr_mm - 1e-9 {
        return None;
    }
    let (w, h) = if rotated {
        (height_mm * scale, width_mm * scale)
    } else {
        (width_mm * scale, height_mm * scale)
    };
    Some(Grid {
        cols: spec.cols,
        rows: spec.rows,
        rotated,
        cell_w_mm: spec.w,
        cell_h_mm: spec.h,
        origin_x_mm: spec.x,
        origin_y_mm: spec.y,
        pitch_x_mm: spec.pitch_x,
        pitch_y_mm: spec.pitch_y,
        scale,
        inset_x_mm: (spec.w - w) / 2.0,
        inset_y_mm: (spec.h - h) / 2.0,
        marks: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_ticket_fits_five_per_sheet() {
        // 190 × 55 mm (150 body + 40 stub): 1 column × 5 rows upright.
        let grid = a4_grid(190.0, 55.0).unwrap();
        assert_eq!((grid.cols, grid.rows, grid.rotated), (1, 5, false));
        assert!((grid.origin_x_mm - 10.0).abs() < 1e-9);
    }

    #[test]
    fn picks_rotation_when_it_fits_more() {
        // 200 × 60: no upright column fits (190 mm usable); rotated 60 × 200 gives 3 × 1.
        let grid = a4_grid(200.0, 60.0).unwrap();
        assert!(grid.rotated);
        assert_eq!((grid.cols, grid.rows), (3, 1));
    }

    #[test]
    fn small_tickets_tile() {
        let grid = a4_grid(90.0, 50.0).unwrap();
        assert_eq!(grid.per_page(), 2 * 5);
    }

    #[test]
    fn too_large_does_not_fit() {
        assert_eq!(a4_grid(300.0, 300.0), None);
        assert_eq!(a4_grid(f64::NAN, 10.0), None);
    }

    #[test]
    fn papers_fill_the_sheet() {
        for paper in Paper::ALL {
            let Some(spec) = paper.spec() else { continue };
            let right = spec.x + f64::from(spec.cols - 1) * spec.pitch_x + spec.w;
            let bottom = spec.y + f64::from(spec.rows - 1) * spec.pitch_y + spec.h;
            assert!(right <= A4_MM.0 + 1e-6, "{paper:?} is {right} mm wide");
            assert!(bottom <= A4_MM.1 + 1e-6, "{paper:?} is {bottom} mm tall");
        }
        assert_eq!(Paper::Labels21.per_sheet(), 21);
        assert_eq!(Paper::Perforated10.per_sheet(), 10);
    }

    #[test]
    fn a_ficha_takes_its_label_as_it_is() {
        // 63 × 38 mm with a 22 mm QR on a 63.5 × 38.1 label: no shrinking, centred.
        let grid = paper_grid(Paper::Labels21, 63.0, 38.0, 22.0, 22.0).unwrap();
        assert!((grid.scale - 1.0).abs() < 1e-9);
        assert!(!grid.rotated);
        assert!((grid.inset_x_mm - 0.25).abs() < 1e-9);
        assert!(!grid.marks);
    }

    #[test]
    fn a_ticket_shrinks_or_turns_to_fit_a_piece() {
        // 150 × 55 on a 210 × 99 strip: as it is.
        let grid = paper_grid(Paper::Perforated3, 190.0, 55.0, 28.0, 22.0).unwrap();
        assert!((grid.scale - 1.0).abs() < 1e-9);
        // 120 × 80 on 105 × 148.5: turned, it fits as it is.
        let grid = paper_grid(Paper::Perforated4, 120.0, 80.0, 30.0, 22.0).unwrap();
        assert!(grid.rotated);
        assert!((grid.scale - 1.0).abs() < 1e-9);
        // 120 × 70 with a 30 mm QR on 105 × 74.25: shrunk inside the 5 mm margin (95 / 120).
        let grid = paper_grid(Paper::Perforated8, 120.0, 70.0, 30.0, 22.0).unwrap();
        assert!(!grid.rotated);
        assert!((grid.scale - 95.0 / 120.0).abs() < 1e-9);
        assert!((grid.inset_x_mm - 5.0).abs() < 1e-9);
        // Shrinking the QR below the minimum is refused.
        assert_eq!(paper_grid(Paper::Labels21, 190.0, 55.0, 28.0, 22.0), None);
    }

    #[test]
    fn plain_a4_is_the_home_grid() {
        assert_eq!(
            paper_grid(Paper::Plain, 190.0, 55.0, 28.0, 22.0),
            a4_grid(190.0, 55.0)
        );
    }

    #[test]
    fn grid_stays_inside_margins() {
        for (w, h) in [(40.0, 20.0), (190.0, 55.0), (120.0, 80.0), (277.0, 30.0)] {
            if let Some(grid) = a4_grid(w, h) {
                let right = grid.origin_x_mm + f64::from(grid.cols) * grid.cell_w_mm;
                let bottom = grid.origin_y_mm + f64::from(grid.rows) * grid.cell_h_mm;
                assert!(
                    grid.origin_x_mm >= HOME_MARGIN_MM - 1e-9
                        && right <= A4_MM.0 - HOME_MARGIN_MM + 1e-9
                );
                assert!(
                    grid.origin_y_mm >= HOME_MARGIN_MM - 1e-9
                        && bottom <= A4_MM.1 - HOME_MARGIN_MM + 1e-9
                );
            }
        }
    }
}
