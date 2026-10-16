//! Uploaded images (the art and the sponsors' logos, ADRs 0011, 0059): what is kept of a file,
//! and how its bytes come back for every render.
//!
//! A phone photo carries EXIF: where and when it was taken, the device, sometimes a thumbnail of
//! the original. The bytes are stored and printed as uploaded (Typst embeds the JPEG stream), so
//! the metadata is cut out before anything is stored, losslessly: the pixels and the colour
//! profile stay, the rest goes (CLAUDE.md invariant 12 is about moderation; this one is about
//! privacy, LGPD). And every preview, export and ticket image reads the art again: the bytes are
//! kept on the instance's disk after the first read (`EXPORT_DIR`, cleaned with the exports), so
//! a design session or the day of the event costs the database one read per image, not one per
//! request (the database is a metered budget, ADR 0013).

use std::path::PathBuf;

use uuid::Uuid;

use crate::error::ApiResult;
use crate::state::AppState;

/// JPEG segments that carry metadata and nothing the decoder needs: APP1 (EXIF, XMP), APP13
/// (Photoshop IRB, IPTC) and comments. APP0 (JFIF), APP2 (the ICC colour profile) and APP14
/// (Adobe, the colour transform) stay.
const JPEG_METADATA_MARKERS: [u8; 3] = [0xE1, 0xED, 0xFE];
/// PNG chunks that carry metadata: EXIF and the text chunks (author, software, comments) and
/// the modification time. Everything the decoder may need stays (`iCCP`, `pHYs`, `gAMA`...).
const PNG_METADATA_CHUNKS: [&[u8; 4]; 5] = [b"eXIf", b"tEXt", b"zTXt", b"iTXt", b"tIME"];
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// The image without its metadata: a PNG or JPEG keeps its pixels and colour profile and loses
/// EXIF, XMP, IPTC, comments and timestamps. Anything this does not understand (a damaged file,
/// another format) comes back as it was: the caller has already checked the magic number, and
/// the decoder decides what is readable.
pub fn strip_metadata(bytes: &[u8]) -> Vec<u8> {
    if bytes.starts_with(PNG_SIGNATURE) {
        strip_png(bytes).unwrap_or_else(|| bytes.to_vec())
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        strip_jpeg(bytes).unwrap_or_else(|| bytes.to_vec())
    } else {
        bytes.to_vec()
    }
}

/// Walks the JPEG segments up to the scan data (which is copied whole) and leaves the metadata
/// ones out. `None` when the structure is not what a JPEG looks like.
fn strip_jpeg(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(bytes.len());
    out.extend_from_slice(bytes.get(..2)?);
    let mut at = 2;
    loop {
        // A marker is 0xFF (any number of fill bytes) and a code.
        if *bytes.get(at)? != 0xFF {
            return None;
        }
        while *bytes.get(at)? == 0xFF {
            at += 1;
        }
        let code = *bytes.get(at)?;
        at += 1;
        match code {
            // Start of scan: the entropy-coded data and the end marker follow, as they are.
            0xDA => {
                out.push(0xFF);
                out.extend_from_slice(bytes.get(at - 1..)?);
                return Some(out);
            }
            // Markers without a length (restart, temporary, end of image).
            0x01 | 0xD0..=0xD9 => {
                out.extend_from_slice(&[0xFF, code]);
            }
            _ => {
                let length =
                    usize::from(u16::from_be_bytes([*bytes.get(at)?, *bytes.get(at + 1)?]));
                if length < 2 {
                    return None;
                }
                let end = at.checked_add(length)?;
                let segment = bytes.get(at..end)?;
                if !JPEG_METADATA_MARKERS.contains(&code) {
                    out.extend_from_slice(&[0xFF, code]);
                    out.extend_from_slice(segment);
                }
                at = end;
            }
        }
    }
}

/// Copies the PNG chunks that are not metadata. `None` when the chunks do not add up.
fn strip_png(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(bytes.len());
    out.extend_from_slice(PNG_SIGNATURE);
    let mut at = PNG_SIGNATURE.len();
    while at < bytes.len() {
        let length =
            usize::try_from(u32::from_be_bytes(bytes.get(at..at + 4)?.try_into().ok()?)).ok()?;
        let kind: &[u8; 4] = bytes.get(at + 4..at + 8)?.try_into().ok()?;
        // Length, type, data and CRC.
        let end = at.checked_add(12)?.checked_add(length)?;
        let chunk = bytes.get(at..end)?;
        if !PNG_METADATA_CHUNKS.contains(&kind) {
            out.extend_from_slice(chunk);
        }
        at = end;
        if kind == b"IEND" {
            break;
        }
    }
    Some(out)
}

/// Where the bytes of an image of an event are kept on the instance (named after both, so a hit
/// is an image that was read for this event before).
fn cache_path(state: &AppState, event_id: Uuid, blob_id: Uuid) -> PathBuf {
    state
        .config
        .export_dir
        .join(format!("art-{event_id}-{blob_id}.bin"))
}

/// The bytes kept on disk for an image of the event, if any.
pub(crate) async fn cached(state: &AppState, event_id: Uuid, blob_id: Uuid) -> Option<Vec<u8>> {
    tokio::fs::read(cache_path(state, event_id, blob_id))
        .await
        .ok()
        .filter(|bytes| !bytes.is_empty())
}

/// Keeps the bytes of an image on disk for the next read. Best effort: a full disk only costs
/// the next read a trip to the database. Written beside and renamed, so a concurrent read never
/// sees a half file.
pub(crate) async fn keep(state: &AppState, event_id: Uuid, blob_id: Uuid, bytes: &[u8]) {
    let path = cache_path(state, event_id, blob_id);
    let partial = path.with_extension(format!("{}.partial", Uuid::new_v4().simple()));
    if tokio::fs::write(&partial, bytes).await.is_ok()
        && tokio::fs::rename(&partial, &path).await.is_err()
    {
        let _ = tokio::fs::remove_file(&partial).await;
    }
}

/// The bytes of an image of the event: from the disk when read before, else from the database
/// (kept on disk after). `Ok(None)` when the image is not the event's.
pub(crate) async fn bytes(
    state: &AppState,
    event_id: Uuid,
    blob_id: Uuid,
) -> ApiResult<Option<Vec<u8>>> {
    if let Some(bytes) = cached(state, event_id, blob_id).await {
        return Ok(Some(bytes));
    }
    let Some(data) = sqlx::query_scalar!(
        "select data from blobs where id = $1 and event_id = $2",
        blob_id,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(None);
    };
    keep(state, event_id, blob_id, &data).await;
    Ok(Some(data))
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    fn jpeg() -> Vec<u8> {
        let image = image::RgbImage::from_fn(24, 16, |x, y| {
            image::Rgb([
                u8::try_from(x * 10).unwrap(),
                u8::try_from(y * 10).unwrap(),
                90,
            ])
        });
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Jpeg)
            .unwrap();
        bytes
    }

    fn png() -> Vec<u8> {
        let image = image::RgbaImage::from_fn(8, 8, |x, y| {
            image::Rgba([
                u8::try_from(x * 30).unwrap(),
                u8::try_from(y * 30).unwrap(),
                0,
                255,
            ])
        });
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    /// Inserts a segment right after the SOI marker.
    fn with_jpeg_segment(jpeg: &[u8], code: u8, payload: &[u8]) -> Vec<u8> {
        let length = u16::try_from(payload.len() + 2).unwrap();
        let mut out = jpeg[..2].to_vec();
        out.extend_from_slice(&[0xFF, code]);
        out.extend_from_slice(&length.to_be_bytes());
        out.extend_from_slice(payload);
        out.extend_from_slice(&jpeg[2..]);
        out
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for &byte in bytes {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0xEDB8_8320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    /// Inserts a chunk right after the signature (before IHDR, which decoders tolerate for
    /// text chunks only in theory; the stripped file is what must decode).
    fn with_png_chunk(png: &[u8], kind: [u8; 4], data: &[u8]) -> Vec<u8> {
        let mut chunk = kind.to_vec();
        chunk.extend_from_slice(data);
        let mut out = png[..8].to_vec();
        out.extend_from_slice(&u32::try_from(data.len()).unwrap().to_be_bytes());
        out.extend_from_slice(&chunk);
        out.extend_from_slice(&crc32(&chunk).to_be_bytes());
        out.extend_from_slice(&png[8..]);
        out
    }

    fn pixels(bytes: &[u8]) -> Vec<u8> {
        image::load_from_memory(bytes)
            .unwrap()
            .to_rgba8()
            .into_raw()
    }

    #[test]
    fn jpeg_loses_exif_and_comments_and_keeps_its_pixels() {
        let plain = jpeg();
        let exif = b"Exif\0\0MM\0*\0\0\0\x08GPS here";
        let tagged = with_jpeg_segment(&with_jpeg_segment(&plain, 0xFE, b"a comment"), 0xE1, exif);
        assert!(tagged.windows(exif.len()).any(|window| window == exif));
        let stripped = strip_metadata(&tagged);
        assert!(!stripped.windows(4).any(|window| window == b"Exif"));
        assert!(!stripped.windows(9).any(|window| window == b"a comment"));
        assert_eq!(pixels(&stripped), pixels(&plain));
        // The colour profile and the JFIF header are not metadata.
        let profiled = with_jpeg_segment(&plain, 0xE2, b"ICC_PROFILE\0profile bytes");
        assert!(
            strip_metadata(&profiled)
                .windows(11)
                .any(|window| window == b"ICC_PROFILE")
        );
    }

    #[test]
    fn png_loses_text_and_exif_chunks_and_keeps_its_pixels() {
        let plain = png();
        let tagged = with_png_chunk(
            &with_png_chunk(&plain, *b"tEXt", b"Author\0Someone"),
            *b"eXIf",
            b"MM\0*location",
        );
        assert!(tagged.windows(4).any(|window| window == b"eXIf"));
        let stripped = strip_metadata(&tagged);
        assert!(!stripped.windows(4).any(|window| window == b"eXIf"));
        assert!(!stripped.windows(4).any(|window| window == b"tEXt"));
        assert_eq!(pixels(&stripped), pixels(&plain));
        assert_eq!(strip_metadata(&plain), plain);
    }

    #[test]
    fn what_is_not_understood_comes_back_untouched() {
        let truncated = &jpeg()[..7];
        assert_eq!(strip_metadata(truncated), truncated.to_vec());
        let mut broken_png = png();
        broken_png.truncate(20);
        assert_eq!(strip_metadata(&broken_png), broken_png);
        assert_eq!(strip_metadata(b"GIF89a"), b"GIF89a".to_vec());
    }
}
