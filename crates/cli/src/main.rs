//! `ii`: development and admin tooling for Ingresso Impresso.

use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use ii_cli::vectors;

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
    }
}
