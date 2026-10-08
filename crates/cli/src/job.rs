//! Local job files: render and verify tickets without the API (phase 2 tooling).
//!
//! A job file describes one event, its design, art and seller ranges. The private seed lives in
//! a separate file created with mode 0600: **local tests only** — production keys are generated
//! and kept encrypted by the server (ADR 0005).

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use ticket_core::{
    EventId, EventKey, EventSigningKey, EventTag, EventVerifier, KeyId, KeyStatus, TicketIssuer,
    TicketNumber,
};
use ticket_render::{Art, RenderJob, TicketDesign, TicketQr, TicketToRender};

/// A local job file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobFile {
    /// Event identity.
    pub event: JobEvent,
    /// Ticket design.
    pub design: TicketDesign,
    /// Art path, relative to the job file (PNG or JPEG covering body + 3 mm bleed).
    pub art: Option<PathBuf>,
    /// Inclusive range of ticket numbers to render.
    pub tickets: NumberRange,
    /// Seller ranges (must lie inside `tickets` and not overlap).
    pub sellers: Vec<SellerRange>,
}

/// Event identity used for signing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobEvent {
    /// UUID.
    pub id: String,
    /// Tag printed in the QR.
    pub tag: u32,
    /// Signing key generation.
    pub key_id: u8,
    /// Name printed on stubs and control sheets.
    pub name: String,
}

/// Inclusive number range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NumberRange {
    /// First number.
    pub first: u32,
    /// Last number (inclusive).
    pub last: u32,
}

/// A block of tickets held by a seller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SellerRange {
    /// Seller name.
    pub name: String,
    /// First number.
    pub first: u32,
    /// Last number (inclusive).
    pub last: u32,
}

impl NumberRange {
    fn contains(self, number: u32) -> bool {
        self.first <= number && number <= self.last
    }
}

/// Creates a new job with a random event id, tag and private seed.
///
/// # Errors
///
/// Fails if the OS RNG fails or a file cannot be written (existing files are never overwritten).
pub fn init(name: &str, job_path: &Path, seed_path: &Path) -> Result<JobFile> {
    let mut id_bytes = [0u8; 16];
    getrandom::fill(&mut id_bytes).map_err(|error| anyhow::anyhow!("OS RNG: {error}"))?;
    let id = uuid::Builder::from_random_bytes(id_bytes).into_uuid();
    let tag = getrandom::u32().map_err(|error| anyhow::anyhow!("OS RNG: {error}"))?;
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).map_err(|error| anyhow::anyhow!("OS RNG: {error}"))?;

    let job = JobFile {
        event: JobEvent {
            id: id.hyphenated().to_string(),
            tag,
            key_id: 1,
            name: name.to_owned(),
        },
        design: TicketDesign::default_v1(),
        art: None,
        tickets: NumberRange { first: 1, last: 50 },
        sellers: vec![SellerRange {
            name: "Vendedor 1".to_owned(),
            first: 1,
            last: 25,
        }],
    };
    write_new(
        job_path,
        format!("{}\n", serde_json::to_string_pretty(&job)?).as_bytes(),
        false,
    )?;
    write_new(
        seed_path,
        format!("{}\n", hex::encode(seed)).as_bytes(),
        true,
    )?;
    Ok(job)
}

/// Loads a job file.
///
/// # Errors
///
/// Fails if the file cannot be read or parsed.
pub fn load(path: &Path) -> Result<JobFile> {
    let json = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    serde_json::from_str(&json).with_context(|| format!("parsing {}", path.display()))
}

/// Loads a hex seed file.
///
/// # Errors
///
/// Fails unless the file holds exactly 32 hex-encoded bytes.
pub fn load_seed(path: &Path) -> Result<[u8; 32]> {
    let text = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    let mut seed = [0u8; 32];
    hex::decode_to_slice(text.trim(), &mut seed)
        .with_context(|| format!("{} is not 32 hex bytes", path.display()))?;
    Ok(seed)
}

impl JobFile {
    fn event_id(&self) -> Result<EventId> {
        self.event.id.parse().context("event.id is not a UUID")
    }

    /// Builds the render job. Signs every ticket with `seed`, or renders samples without it.
    ///
    /// # Errors
    ///
    /// Fails on invalid ranges or unreadable art.
    pub fn render_job(&self, job_path: &Path, seed: Option<&[u8; 32]>) -> Result<RenderJob> {
        let range = self.tickets;
        ensure!(
            range.first >= 1 && range.first <= range.last,
            "tickets: first must be ≥ 1 and ≤ last"
        );
        for (index, seller) in self.sellers.iter().enumerate() {
            ensure!(
                seller.first <= seller.last
                    && range.contains(seller.first)
                    && range.contains(seller.last),
                "seller {} must lie inside tickets {}–{}",
                seller.name,
                range.first,
                range.last
            );
            for other in self.sellers.iter().skip(index + 1) {
                ensure!(
                    other.last < seller.first || other.first > seller.last,
                    "sellers {} and {} overlap",
                    seller.name,
                    other.name
                );
            }
        }
        let issuer = match seed {
            Some(seed) => Some(TicketIssuer::new(
                self.event_id()?,
                EventTag::new(self.event.tag),
                KeyId::new(self.event.key_id),
                EventSigningKey::from_seed(seed),
            )),
            None => None,
        };
        let tickets = (range.first..=range.last)
            .map(|number| {
                let qr = match &issuer {
                    Some(issuer) => TicketQr::Signed(
                        issuer.issue(TicketNumber::new(number).context("ticket number zero")?),
                    ),
                    None => TicketQr::Sample { number },
                };
                let seller = self
                    .sellers
                    .iter()
                    .find(|seller| seller.first <= number && number <= seller.last)
                    .map(|seller| seller.name.clone());
                Ok(TicketToRender { qr, seller })
            })
            .collect::<Result<Vec<_>>>()?;
        let art = match &self.art {
            Some(art) => {
                let path = job_path
                    .parent()
                    .unwrap_or_else(|| Path::new("."))
                    .join(art);
                let bytes =
                    fs::read(&path).with_context(|| format!("reading art {}", path.display()))?;
                Some(Art::from_bytes(bytes)?)
            }
            None => None,
        };
        Ok(RenderJob {
            design: self.design.clone(),
            art,
            event_name: self.event.name.clone(),
            tickets,
        })
    }

    /// A verifier for this event with the public key derived from `seed`.
    ///
    /// # Errors
    ///
    /// Fails if the event id is invalid.
    pub fn verifier(&self, seed: &[u8; 32]) -> Result<EventVerifier> {
        Ok(EventVerifier::new(
            self.event_id()?,
            EventTag::new(self.event.tag),
            vec![EventKey {
                key_id: KeyId::new(self.event.key_id),
                public_key: EventSigningKey::from_seed(seed).public_key(),
                status: KeyStatus::Active,
            }],
        )?)
    }
}

fn write_new(path: &Path, contents: &[u8], secret: bool) -> Result<()> {
    use std::io::Write as _;
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    if secret {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    #[cfg(not(unix))]
    let _ = secret;
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            bail!("{} already exists; refusing to overwrite", path.display())
        }
        Err(error) => return Err(error).with_context(|| format!("creating {}", path.display())),
    };
    file.write_all(contents)
        .with_context(|| format!("writing {}", path.display()))
}
