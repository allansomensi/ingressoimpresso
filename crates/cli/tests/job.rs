//! Local job files: creation, ticket assembly and verification.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "test helpers fail loudly by design"
)]

use std::fs;
use std::path::PathBuf;

use ii_cli::job::{self, SellerRange};
use ticket_render::TicketQr;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ii-job-test-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn init_creates_job_and_private_seed_without_overwriting() {
    let dir = scratch("init");
    let (job_path, seed_path) = (dir.join("job.json"), dir.join("event.seed"));
    let created = job::init("Show", &job_path, &seed_path).unwrap();
    assert_eq!(job::load(&job_path).unwrap(), created);
    assert_eq!(job::load_seed(&seed_path).unwrap().len(), 32);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        assert_eq!(
            fs::metadata(&seed_path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    let error = job::init("Show", &job_path, &dir.join("other.seed")).unwrap_err();
    assert!(error.to_string().contains("already exists"), "{error}");
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn signed_jobs_verify_and_samples_do_not() {
    let dir = scratch("render");
    let (job_path, seed_path) = (dir.join("job.json"), dir.join("event.seed"));
    let file = job::init("Show", &job_path, &seed_path).unwrap();
    let seed = job::load_seed(&seed_path).unwrap();
    let verifier = file.verifier(&seed).unwrap();

    let signed = file.render_job(&job_path, Some(&seed)).unwrap();
    assert_eq!(signed.tickets.len(), 50);
    for ticket in &signed.tickets {
        let TicketQr::Signed(signed_ticket) = &ticket.qr else {
            panic!("expected signed tickets");
        };
        let authentic = verifier.verify(signed_ticket).unwrap();
        assert_eq!(authentic.number().get(), ticket.number());
        let expected_seller = (ticket.number() <= 25).then(|| "Vendedor 1".to_owned());
        assert_eq!(ticket.seller, expected_seller);
    }

    let samples = file.render_job(&job_path, None).unwrap();
    assert!(
        samples
            .tickets
            .iter()
            .all(|ticket| matches!(ticket.qr, TicketQr::Sample { .. }))
    );
    assert!(
        verifier
            .verify_qr_text(&ticket_render::sample_qr_text())
            .is_err()
    );
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn rejects_overlapping_or_out_of_range_sellers() {
    let dir = scratch("sellers");
    let (job_path, seed_path) = (dir.join("job.json"), dir.join("event.seed"));
    let mut file = job::init("Show", &job_path, &seed_path).unwrap();
    file.sellers.push(SellerRange {
        name: "Outro".to_owned(),
        first: 20,
        last: 30,
    });
    assert!(
        file.render_job(&job_path, None)
            .unwrap_err()
            .to_string()
            .contains("overlap")
    );
    file.sellers = vec![SellerRange {
        name: "Fora".to_owned(),
        first: 40,
        last: 60,
    }];
    assert!(
        file.render_job(&job_path, None)
            .unwrap_err()
            .to_string()
            .contains("inside")
    );
    fs::remove_dir_all(dir).unwrap();
}
