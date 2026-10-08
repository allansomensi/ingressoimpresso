//! `ii`: development and admin tooling for Ingresso Impresso.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use ii_cli::{job, vectors};
use ticket_render::{PrintOptions, RenderError, RenderJob, WHATSAPP_WIDTH_PX};

#[derive(Debug, Parser)]
#[command(
    name = "ii",
    version,
    about = "Ingresso Impresso development and admin tooling"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Shared ticket test vectors (testdata/vectors/ticket-v1.json).
    Vectors {
        #[command(subcommand)]
        action: VectorsAction,
    },
    /// Local job files (render tickets without the API; local tests only).
    Job {
        #[command(subcommand)]
        action: JobAction,
    },
    /// Renders every file of a job: home A4, print shop, control sheet, WhatsApp ZIP.
    Render {
        /// Job file.
        #[arg(long)]
        job: PathBuf,
        /// Private seed file. Without it, renders watermarked samples with invalid QR codes.
        #[arg(long)]
        seed: Option<PathBuf>,
        /// Output directory (created if missing).
        #[arg(long, default_value = "out")]
        out_dir: PathBuf,
        /// Print-shop file without crop marks.
        #[arg(long)]
        no_crop_marks: bool,
        /// Render only these files (repeatable): casa-a4.pdf, grafica.pdf, controle.pdf, whatsapp.zip.
        #[arg(long)]
        only: Vec<String>,
    },
    /// Verifies a scanned QR text against a job (prints the ticket number or the rejection).
    Verify {
        /// Job file.
        #[arg(long)]
        job: PathBuf,
        /// Private seed file (its public key is used).
        #[arg(long)]
        seed: PathBuf,
        /// The text read from the QR code.
        text: String,
    },
}

#[derive(Debug, Subcommand)]
enum VectorsAction {
    /// Regenerates the vectors file.
    Generate {
        /// Output path.
        #[arg(long, default_value = "testdata/vectors/ticket-v1.json")]
        out: PathBuf,
    },
    /// Fails if the committed vectors file differs from a fresh generation.
    Check {
        /// Path of the committed file.
        #[arg(long, default_value = "testdata/vectors/ticket-v1.json")]
        path: PathBuf,
    },
}

#[derive(Debug, Subcommand)]
enum JobAction {
    /// Creates a job file with a random event id/tag and a private seed file (mode 0600).
    Init {
        /// Event name.
        #[arg(long)]
        name: String,
        /// Job file to create.
        #[arg(long, default_value = "job.json")]
        out: PathBuf,
        /// Seed file to create. Keep it private: anyone with it can forge this event's tickets.
        #[arg(long, default_value = "event.seed")]
        seed: PathBuf,
    },
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            #[allow(clippy::print_stderr, reason = "CLI error reporting")]
            {
                eprintln!("error: {error:#}");
            }
            ExitCode::FAILURE
        }
    }
}

fn say(line: &str) -> Result<()> {
    writeln!(std::io::stdout().lock(), "{line}").context("writing to stdout")
}

fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Command::Vectors { action } => match action {
            VectorsAction::Generate { out } => {
                let json = vectors::to_json(&vectors::generate()?)?;
                fs::write(&out, json).with_context(|| format!("writing {}", out.display()))
            }
            VectorsAction::Check { path } => {
                let expected = vectors::to_json(&vectors::generate()?)?;
                let actual = fs::read_to_string(&path)
                    .with_context(|| format!("reading {}", path.display()))?;
                if actual != expected {
                    bail!("{} is out of date; run `just vectors`", path.display());
                }
                Ok(())
            }
        },
        Command::Job {
            action: JobAction::Init { name, out, seed },
        } => {
            let created = job::init(&name, &out, &seed)?;
            say(&format!(
                "created {} (event {}) and {}",
                out.display(),
                created.event.id,
                seed.display()
            ))?;
            say("the seed file is a private key: keep it out of git and never share it")
        }
        Command::Render {
            job: job_path,
            seed,
            out_dir,
            no_crop_marks,
            only,
        } => render(&job_path, seed.as_deref(), &out_dir, no_crop_marks, &only),
        Command::Verify {
            job: job_path,
            seed,
            text,
        } => {
            let job = job::load(&job_path)?;
            let verifier = job.verifier(&job::load_seed(&seed)?)?;
            match verifier.verify_qr_text(&text) {
                Ok(ticket) => say(&format!("valid: ticket {}", ticket.number())),
                Err(rejection) => bail!("rejected: {rejection}"),
            }
        }
    }
}

fn render(
    job_path: &Path,
    seed: Option<&Path>,
    out_dir: &Path,
    no_crop_marks: bool,
    only: &[String],
) -> Result<()> {
    let job = job::load(job_path)?;
    let seed = seed.map(job::load_seed).transpose()?;
    let render_job = job.render_job(job_path, seed.as_ref())?;
    fs::create_dir_all(out_dir).with_context(|| format!("creating {}", out_dir.display()))?;
    let named = |name: &str| only.iter().any(|item| item == name);
    let wanted = |name: &str| only.is_empty() || named(name);

    let pdfs: [(&str, PdfRenderer); 3] = [
        ("casa-a4.pdf", |job, _| ticket_render::home_pdf(job)),
        ("grafica.pdf", |job, crop_marks| {
            ticket_render::print_pdf(job, PrintOptions { crop_marks })
        }),
        ("controle.pdf", |job, _| {
            ticket_render::control_sheet_pdf(job)
        }),
    ];
    for (name, produce) in pdfs {
        if !wanted(name) {
            continue;
        }
        let path = out_dir.join(name);
        let bytes = match produce(&render_job, !no_crop_marks) {
            Ok(bytes) => bytes,
            // Large tickets are for print shops: without an explicit request, skip the A4 file.
            Err(RenderError::TooLargeForA4) if !named(name) => {
                say(&format!(
                    "skipped {name}: the ticket does not fit on an A4 sheet"
                ))?;
                continue;
            }
            Err(error) => return Err(error).with_context(|| format!("rendering {name}")),
        };
        fs::write(&path, &bytes).with_context(|| format!("writing {}", path.display()))?;
        say(&format!("{} ({} KiB)", path.display(), bytes.len() / 1024))?;
    }
    if wanted("whatsapp.zip") {
        // Streamed straight to disk: memory stays bounded for any batch size.
        let path = out_dir.join("whatsapp.zip");
        let file =
            fs::File::create(&path).with_context(|| format!("creating {}", path.display()))?;
        let file = ticket_render::write_whatsapp_zip(
            &render_job,
            WHATSAPP_WIDTH_PX,
            std::io::BufWriter::new(file),
        )
        .context("rendering whatsapp.zip")?;
        file.into_inner()
            .map_err(std::io::IntoInnerError::into_error)
            .and_then(|file| file.sync_all())
            .with_context(|| format!("writing {}", path.display()))?;
        let size = fs::metadata(&path)
            .map(|meta| meta.len() / 1024)
            .unwrap_or_default();
        say(&format!("{} ({size} KiB)", path.display()))?;
    }
    if seed.is_none() {
        say("no --seed: rendered SAMPLES (watermark, QR rejected at the door)")?;
    }
    Ok(())
}

/// Renders one PDF of a job; the flag is "crop marks" (used by the print-shop file only).
type PdfRenderer = fn(&RenderJob, bool) -> Result<Vec<u8>, RenderError>;
