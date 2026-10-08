//! The committed vectors file must match a fresh generation byte for byte.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

use std::fs;
use std::path::Path;

#[test]
fn committed_vectors_match_generator() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/vectors/ticket-v1.json");
    let committed = fs::read_to_string(&path).expect("vectors file is committed");
    let generated = ii_cli::vectors::to_json(&ii_cli::vectors::generate().unwrap()).unwrap();
    assert!(
        committed == generated,
        "{} is out of date; run `just vectors` and review the diff",
        path.display()
    );
}

#[test]
fn generation_is_deterministic() {
    let first = ii_cli::vectors::to_json(&ii_cli::vectors::generate().unwrap()).unwrap();
    let second = ii_cli::vectors::to_json(&ii_cli::vectors::generate().unwrap()).unwrap();
    assert_eq!(first, second);
}
