//! Imposition of tickets on A4 sheets for home printing.

use serde::Serialize;

/// A4 portrait, in millimetres.
pub(crate) const A4_MM: (f64, f64) = (210.0, 297.0);
/// Page margin kept free for home printers (non-printable area + cut marks).
pub(crate) const HOME_MARGIN_MM: f64 = 10.0;

/// Tickets laid out edge to edge (single guillotine cuts), centred on the sheet.
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
