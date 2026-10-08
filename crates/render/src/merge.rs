//! Merging of PDF chunks into one file (ADR 0015).
//!
//! Typst compiles one chunk of tickets at a time and [`PdfMerger`] appends each chunk as soon as
//! it is compiled, so only the merged document and one chunk are ever in memory. Identical
//! objects (the art, its alpha mask and colour space, identical font subsets) are kept once:
//! a merged file is about as large as a single compilation of the whole batch would be.

use std::collections::HashMap;

use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use sha2::{Digest, Sha256};

use crate::render::RenderError;

/// Concatenates untagged PDFs with a flat page tree, as [`crate::render`] compiles them.
pub(crate) struct PdfMerger {
    merged: Document,
    pages_id: ObjectId,
    kids: Vec<Object>,
    /// Digest of every shareable object already in `merged` → its id.
    shared: HashMap<[u8; 32], ObjectId>,
    /// When set, every page gets a `BleedBox`: its `TrimBox` grown by this many points.
    bleed_pt: Option<f32>,
    /// Document information of the first chunk (creator, producer).
    info: Option<Object>,
}

impl PdfMerger {
    /// A merger; `bleed_mm` sets each page's `BleedBox` (print-shop files).
    pub(crate) fn new(bleed_mm: Option<f64>) -> Self {
        let mut merged = Document::with_version("1.7");
        let pages_id = merged.new_object_id();
        #[expect(
            clippy::cast_possible_truncation,
            reason = "a bleed of a few millimetres, far inside f32 range and precision"
        )]
        let bleed_pt = bleed_mm.map(|mm| (mm * 72.0 / 25.4) as f32);
        Self {
            merged,
            pages_id,
            kids: Vec::new(),
            shared: HashMap::new(),
            bleed_pt,
            info: None,
        }
    }

    /// Appends every page of `pdf`.
    pub(crate) fn add(&mut self, pdf: &[u8]) -> Result<(), RenderError> {
        let mut part = Document::load_mem(pdf).map_err(pdf_error)?;
        part.renumber_objects_with(self.merged.max_id + 1);
        if self.kids.is_empty() {
            self.merged.version.clone_from(&part.version);
            self.info = part.trailer.get(b"Info").ok().cloned();
        }

        // Stream contents (the art: megabytes) are hashed once per chunk.
        let contents: HashMap<ObjectId, [u8; 32]> = part
            .objects
            .iter()
            .filter_map(|(id, object)| {
                let stream = object.as_stream().ok()?;
                Some((*id, Sha256::digest(&stream.content).into()))
            })
            .collect();
        let duplicates = self.duplicates(&part, &contents);
        for id in duplicates.keys() {
            part.objects.remove(id);
        }
        for object in part.objects.values_mut() {
            remap(object, &duplicates);
        }

        for page_id in part.get_pages().into_values() {
            let page = part
                .get_object_mut(page_id)
                .and_then(Object::as_dict_mut)
                .map_err(pdf_error)?;
            page.set("Parent", self.pages_id);
            if let Some(bleed) = self.bleed_pt {
                set_bleed_box(page, bleed)?;
            }
            self.kids.push(Object::Reference(page_id));
        }

        for (id, object) in &part.objects {
            if shareable(object) {
                self.shared
                    .entry(digest(object, contents.get(id), &HashMap::new()))
                    .or_insert(*id);
            }
        }
        self.merged.max_id = self.merged.max_id.max(part.max_id);
        // The chunk's catalog and page-tree root stay unreferenced and are pruned in `finish`.
        self.merged.objects.extend(part.objects);
        Ok(())
    }

    /// Objects of `part` identical to one already merged, mapped to the merged one.
    ///
    /// Repeated until nothing changes: an object that refers to a duplicate (an image and its
    /// alpha mask) only matches once that reference has been mapped.
    fn duplicates(
        &self,
        part: &Document,
        contents: &HashMap<ObjectId, [u8; 32]>,
    ) -> HashMap<ObjectId, ObjectId> {
        let mut map = HashMap::new();
        loop {
            let mut changed = false;
            for (id, object) in &part.objects {
                if map.contains_key(id) || !shareable(object) {
                    continue;
                }
                if let Some(&existing) = self.shared.get(&digest(object, contents.get(id), &map)) {
                    map.insert(*id, existing);
                    changed = true;
                }
            }
            if !changed {
                return map;
            }
        }
    }

    /// The merged file.
    pub(crate) fn finish(mut self) -> Result<Vec<u8>, RenderError> {
        let count =
            i64::try_from(self.kids.len()).map_err(|error| RenderError::Pdf(error.to_string()))?;
        self.merged.objects.insert(
            self.pages_id,
            Object::Dictionary(
                lopdf::dictionary! { "Type" => "Pages", "Kids" => self.kids, "Count" => count },
            ),
        );
        let catalog_id = self
            .merged
            .add_object(lopdf::dictionary! { "Type" => "Catalog", "Pages" => self.pages_id });
        self.merged.trailer.set("Root", catalog_id);
        if let Some(info) = self.info {
            self.merged.trailer.set("Info", info);
        }
        self.merged.prune_objects();
        self.merged.renumber_objects();
        let mut out = Vec::new();
        self.merged
            .save_to(&mut out)
            .map_err(|error| RenderError::Pdf(error.to_string()))?;
        Ok(out)
    }
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "a `map_err` adapter receives the error by value"
)]
fn pdf_error(error: lopdf::Error) -> RenderError {
    RenderError::Pdf(error.to_string())
}

/// Rewrites references to duplicates.
fn remap(object: &mut Object, map: &HashMap<ObjectId, ObjectId>) {
    match object {
        Object::Reference(id) => {
            if let Some(target) = map.get(id) {
                *id = *target;
            }
        }
        Object::Array(items) => items.iter_mut().for_each(|item| remap(item, map)),
        Object::Dictionary(dict) => dict.iter_mut().for_each(|(_, value)| remap(value, map)),
        Object::Stream(stream) => stream
            .dict
            .iter_mut()
            .for_each(|(_, value)| remap(value, map)),
        _ => {}
    }
}

/// Whether identical copies of `object` can be replaced by one. Everything is a plain value
/// except the page tree, whose nodes have an identity (their place in the tree).
fn shareable(object: &Object) -> bool {
    match object {
        Object::Dictionary(dict) => {
            !dict.has(b"Parent")
                && !dict
                    .get(b"Type")
                    .and_then(Object::as_name)
                    .is_ok_and(|kind| matches!(kind, b"Page" | b"Pages" | b"Catalog" | b"Annot"))
        }
        _ => true,
    }
}

/// SHA-256 of an object, dictionary keys sorted and references seen through `map`. A stream
/// is hashed through the digest of its content, `content` when already known.
fn digest(
    object: &Object,
    content: Option<&[u8; 32]>,
    map: &HashMap<ObjectId, ObjectId>,
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    match (object, content) {
        (Object::Stream(stream), Some(content)) => feed_stream(&mut hasher, stream, content, map),
        _ => feed(&mut hasher, object, map),
    }
    hasher.finalize().into()
}

fn feed_stream(
    hasher: &mut Sha256,
    stream: &Stream,
    content: &[u8; 32],
    map: &HashMap<ObjectId, ObjectId>,
) {
    hasher.update([8]);
    feed_dictionary(hasher, &stream.dict, map);
    hasher.update(content);
}

fn feed_bytes(hasher: &mut Sha256, bytes: &[u8]) {
    hasher.update((bytes.len() as u64).to_le_bytes());
    hasher.update(bytes);
}

fn feed_dictionary(hasher: &mut Sha256, dict: &Dictionary, map: &HashMap<ObjectId, ObjectId>) {
    let mut entries: Vec<_> = dict.iter().collect();
    entries.sort_by(|a, b| a.0.cmp(b.0));
    hasher.update((entries.len() as u64).to_le_bytes());
    for (key, value) in entries {
        feed_bytes(hasher, key);
        feed(hasher, value, map);
    }
}

fn feed(hasher: &mut Sha256, object: &Object, map: &HashMap<ObjectId, ObjectId>) {
    match object {
        Object::Null => hasher.update([0]),
        Object::Boolean(value) => hasher.update([1, u8::from(*value)]),
        Object::Integer(value) => {
            hasher.update([2]);
            hasher.update(value.to_le_bytes());
        }
        Object::Real(value) => {
            hasher.update([3]);
            hasher.update(value.to_bits().to_le_bytes());
        }
        Object::Name(name) => {
            hasher.update([4]);
            feed_bytes(hasher, name);
        }
        Object::String(text, _) => {
            hasher.update([5]);
            feed_bytes(hasher, text);
        }
        Object::Array(items) => {
            hasher.update([6]);
            hasher.update((items.len() as u64).to_le_bytes());
            for item in items {
                feed(hasher, item, map);
            }
        }
        Object::Dictionary(dict) => {
            hasher.update([7]);
            feed_dictionary(hasher, dict, map);
        }
        Object::Stream(stream) => {
            let content: [u8; 32] = Sha256::digest(&stream.content).into();
            feed_stream(hasher, stream, &content, map);
        }
        Object::Reference(id) => {
            let (number, generation) = map.get(id).copied().unwrap_or(*id);
            hasher.update([9]);
            hasher.update(number.to_le_bytes());
            hasher.update(generation.to_le_bytes());
        }
    }
}

/// Sets `BleedBox` to `TrimBox` grown by `bleed` points, kept inside the `MediaBox`.
fn set_bleed_box(page: &mut Dictionary, bleed: f32) -> Result<(), RenderError> {
    let (Some(trim), Some(media)) = (rect(page, b"TrimBox"), rect(page, b"MediaBox")) else {
        return Err(RenderError::Pdf(
            "page without TrimBox or MediaBox".to_owned(),
        ));
    };
    let bleed_box = [
        (trim[0] - bleed).max(media[0]),
        (trim[1] - bleed).max(media[1]),
        (trim[2] + bleed).min(media[2]),
        (trim[3] + bleed).min(media[3]),
    ];
    page.set(
        "BleedBox",
        bleed_box.into_iter().map(Object::Real).collect::<Vec<_>>(),
    );
    Ok(())
}

fn rect(page: &Dictionary, key: &[u8]) -> Option<[f32; 4]> {
    let [x0, y0, x1, y1] = page.get(key).ok()?.as_array().ok()?.as_slice() else {
        return None;
    };
    Some([
        x0.as_float().ok()?,
        y0.as_float().ok()?,
        x1.as_float().ok()?,
        y1.as_float().ok()?,
    ])
}
