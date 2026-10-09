//! A sealed Typst world: in-memory files only, embedded fonts, no network, no disk, no clock.
//!
//! Templates are compiled into the binary and user data enters exclusively as data files
//! (`/data.json`, images), never as Typst source (CLAUDE.md invariant 5).

use std::collections::HashMap;
use std::sync::LazyLock;

use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

/// Font files embedded in the binary (all SIL Open Font License, see `fonts/*-OFL.txt`).
const FONT_FILES: &[&[u8]] = &[
    include_bytes!("../fonts/Lato-Regular.ttf"),
    include_bytes!("../fonts/Lato-Bold.ttf"),
    include_bytes!("../fonts/BebasNeue-Regular.ttf"),
    include_bytes!("../fonts/SpaceMono-Regular.ttf"),
    include_bytes!("../fonts/SpaceMono-Bold.ttf"),
    include_bytes!("../fonts/Anton-Regular.ttf"),
    include_bytes!("../fonts/AbrilFatface-Regular.ttf"),
    include_bytes!("../fonts/GreatVibes-Regular.ttf"),
    include_bytes!("../fonts/Pacifico-Regular.ttf"),
    include_bytes!("../fonts/AlfaSlabOne-Regular.ttf"),
];

/// Shared, immutable parts of every world: the standard library and the fonts.
struct Shared {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
}

static SHARED: LazyLock<Shared> = LazyLock::new(|| {
    let fonts: Vec<Font> = FONT_FILES
        .iter()
        .flat_map(|data| Font::iter(Bytes::new(*data)))
        .collect();
    Shared {
        library: LazyHash::new(Library::default()),
        book: LazyHash::new(FontBook::from_fonts(&fonts)),
        fonts,
    }
});

/// Builds a [`FileId`] for an absolute virtual path such as `/main.typ`.
pub(crate) fn file_id(path: &str) -> Result<FileId, FileError> {
    let vpath = VirtualPath::new(path)
        .map_err(|_| FileError::Other(Some(format!("invalid path {path}").into())))?;
    Ok(FileId::new(RootedPath::new(VirtualRoot::Project, vpath)))
}

/// An in-memory world for one compilation.
pub(crate) struct MemoryWorld {
    main: FileId,
    sources: HashMap<FileId, Source>,
    files: HashMap<FileId, Bytes>,
}

impl MemoryWorld {
    /// Creates a world whose main file is `main_path` with the given source text.
    pub(crate) fn new(main_path: &str, main_source: &str) -> Result<Self, FileError> {
        let main = file_id(main_path)?;
        let mut world = Self {
            main,
            sources: HashMap::new(),
            files: HashMap::new(),
        };
        world.add_source(main_path, main_source)?;
        Ok(world)
    }

    /// Adds a Typst module (our own templates only).
    pub(crate) fn add_source(&mut self, path: &str, text: &str) -> Result<(), FileError> {
        let id = file_id(path)?;
        self.sources.insert(id, Source::new(id, text.to_owned()));
        Ok(())
    }

    /// Adds a data file (JSON, images). This is the only way user content enters a compilation.
    pub(crate) fn add_file(&mut self, path: &str, data: impl Into<Bytes>) -> Result<(), FileError> {
        self.files.insert(file_id(path)?, data.into());
        Ok(())
    }
}

impl World for MemoryWorld {
    fn library(&self) -> &LazyHash<Library> {
        &SHARED.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &SHARED.book
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        self.sources
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(id.vpath().get_with_slash().into()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if let Some(source) = self.sources.get(&id) {
            return Ok(Bytes::from_string(source.clone()));
        }
        self.files
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(id.vpath().get_with_slash().into()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        SHARED.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        // Deterministic output: templates never read the clock.
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_template_font_is_embedded() {
        // The families of `fonts` in templates/ticket.typ; Typst would silently fall back.
        let families = [
            "Bebas Neue",
            "Space Mono",
            "Lato",
            "Anton",
            "Abril Fatface",
            "Great Vibes",
            "Pacifico",
            "Alfa Slab One",
        ];
        for family in families {
            assert!(
                SHARED
                    .book
                    .select_family(&family.to_lowercase())
                    .next()
                    .is_some(),
                "{family} is missing"
            );
        }
    }
}
