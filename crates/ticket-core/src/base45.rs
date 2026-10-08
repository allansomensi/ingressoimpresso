//! Strict Base45 (RFC 9285).
//!
//! Base45 maps every 2 bytes to 3 characters of the QR alphanumeric alphabet, which QR codes store
//! at 5.5 bits per character. It is the most compact *text-safe* encoding for QR codes: browser
//! QR readers return strings, so raw binary payloads would be mangled by text decoding.
//!
//! The decoder is strict and therefore canonical: it accepts only the 45 uppercase alphabet
//! symbols, rejects lengths `≡ 1 (mod 3)` and rejects chunk values that do not fit their byte
//! width. As a consequence `encode(decode(s)?) == s` for every accepted `s`.

use thiserror::Error;

/// The 45 symbols, in value order.
const ALPHABET: &[u8; 45] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/// Why a string is not valid Base45.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum Base45Error {
    /// A byte outside the Base45 alphabet (this includes lowercase letters and any non-ASCII).
    #[error("invalid Base45 character at byte {position}")]
    InvalidCharacter {
        /// Byte offset of the offending character.
        position: usize,
    },
    /// The input length leaves a dangling single character.
    #[error("invalid Base45 length {length}")]
    InvalidLength {
        /// Length of the input in bytes.
        length: usize,
    },
    /// A chunk encodes a value that does not fit in its byte width.
    #[error("Base45 chunk at byte {position} is out of range")]
    ValueOutOfRange {
        /// Byte offset of the start of the chunk.
        position: usize,
    },
}

/// Encodes bytes as Base45.
pub fn encode(input: &[u8]) -> String {
    let mut out = String::with_capacity(encoded_len(input.len()));
    for chunk in input.chunks(2) {
        if let [high, low] = *chunk {
            push_symbols(&mut out, u32::from(u16::from_be_bytes([high, low])), 3);
        } else if let [single] = *chunk {
            push_symbols(&mut out, u32::from(single), 2);
        }
    }
    out
}

/// Number of Base45 characters produced for `byte_len` input bytes.
pub const fn encoded_len(byte_len: usize) -> usize {
    (byte_len / 2) * 3 + (byte_len % 2) * 2
}

/// Decodes a Base45 string.
///
/// # Errors
///
/// Returns a [`Base45Error`] if the input contains a character outside the alphabet, has a length
/// `≡ 1 (mod 3)` or contains a chunk whose value does not fit its byte width.
pub fn decode(input: &str) -> Result<Vec<u8>, Base45Error> {
    let bytes = input.as_bytes();
    if bytes.len() % 3 == 1 {
        return Err(Base45Error::InvalidLength {
            length: bytes.len(),
        });
    }
    let mut out = Vec::with_capacity(bytes.len() / 3 * 2 + 1);
    for (chunk_index, chunk) in bytes.chunks(3).enumerate() {
        let position = chunk_index * 3;
        let mut value: u32 = 0;
        let mut weight: u32 = 1;
        for (offset, &symbol) in chunk.iter().enumerate() {
            let digit = symbol_value(symbol).ok_or(Base45Error::InvalidCharacter {
                position: position + offset,
            })?;
            value += digit * weight;
            weight *= 45;
        }
        if chunk.len() == 3 {
            let pair =
                u16::try_from(value).map_err(|_| Base45Error::ValueOutOfRange { position })?;
            out.extend_from_slice(&pair.to_be_bytes());
        } else {
            let single =
                u8::try_from(value).map_err(|_| Base45Error::ValueOutOfRange { position })?;
            out.push(single);
        }
    }
    Ok(out)
}

/// Appends `count` little-endian base-45 digits of `value`.
fn push_symbols(out: &mut String, mut value: u32, count: usize) {
    for _ in 0..count {
        out.push(char::from(symbol(value % 45)));
        value /= 45;
    }
}

#[expect(
    clippy::indexing_slicing,
    reason = "callers pass `value % 45`, which is always < ALPHABET.len() == 45"
)]
fn symbol(digit: u32) -> u8 {
    ALPHABET[digit as usize]
}

fn symbol_value(symbol: u8) -> Option<u32> {
    let value = match symbol {
        b'0'..=b'9' => symbol - b'0',
        b'A'..=b'Z' => symbol - b'A' + 10,
        b' ' => 36,
        b'$' => 37,
        b'%' => 38,
        b'*' => 39,
        b'+' => 40,
        b'-' => 41,
        b'.' => 42,
        b'/' => 43,
        b':' => 44,
        _ => return None,
    };
    Some(u32::from(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Examples from RFC 9285, section 4.
    const RFC_EXAMPLES: &[(&[u8], &str)] = &[
        (b"AB", "BB8"),
        (b"Hello!!", "%69 VD92EX0"),
        (b"base-45", "UJCLQE7W581"),
        (b"ietf!", "QED8WEX0"),
    ];

    #[test]
    fn encodes_rfc_examples() {
        for (input, expected) in RFC_EXAMPLES {
            assert_eq!(encode(input), *expected);
        }
    }

    #[test]
    fn decodes_rfc_examples() {
        for (expected, input) in RFC_EXAMPLES {
            assert_eq!(decode(input).unwrap(), *expected);
        }
    }

    #[test]
    fn empty_round_trips() {
        assert_eq!(encode(&[]), "");
        assert_eq!(decode("").unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn alphabet_is_consistent_with_symbol_value() {
        for (index, &symbol) in ALPHABET.iter().enumerate() {
            assert_eq!(symbol_value(symbol), Some(u32::try_from(index).unwrap()));
        }
    }

    #[test]
    fn rejects_value_out_of_range_triple() {
        // "GGW" = 16 + 16·45 + 32·45² = 65536, one past u16::MAX (RFC 9285 §6).
        assert_eq!(
            decode("GGW"),
            Err(Base45Error::ValueOutOfRange { position: 0 })
        );
        // ":::" = 44 + 44·45 + 44·45² = 91124.
        assert_eq!(
            decode("BB8:::"),
            Err(Base45Error::ValueOutOfRange { position: 3 })
        );
    }

    #[test]
    fn rejects_value_out_of_range_pair() {
        // "Z5" = 35 + 5·45 = 260 > 255.
        assert_eq!(
            decode("Z5"),
            Err(Base45Error::ValueOutOfRange { position: 0 })
        );
        // "U5" = 30 + 5·45 = 255 is the largest valid pair.
        assert_eq!(decode("U5").unwrap(), vec![255]);
    }

    #[test]
    fn rejects_invalid_characters() {
        assert_eq!(
            decode("bb8"),
            Err(Base45Error::InvalidCharacter { position: 0 })
        );
        assert_eq!(
            decode("BB#"),
            Err(Base45Error::InvalidCharacter { position: 2 })
        );
        assert_eq!(decode("BBÁ"), Err(Base45Error::InvalidLength { length: 4 }));
        assert_eq!(
            decode("BB8\n"),
            Err(Base45Error::InvalidLength { length: 4 })
        );
        assert_eq!(
            decode("BB8B\n"),
            Err(Base45Error::InvalidCharacter { position: 4 })
        );
    }

    #[test]
    fn rejects_dangling_character() {
        assert_eq!(decode("B"), Err(Base45Error::InvalidLength { length: 1 }));
        assert_eq!(
            decode("BB8B"),
            Err(Base45Error::InvalidLength { length: 4 })
        );
    }

    #[test]
    fn every_short_chunk_is_canonical() {
        // Exhaustive over all 2- and 3-symbol strings: exactly 256 pairs and 65536 triples
        // decode, and each re-encodes to itself.
        let mut pairs = 0;
        let mut triples = 0;
        for &a in ALPHABET {
            for &b in ALPHABET {
                let pair = String::from_utf8(vec![a, b]).unwrap();
                if let Ok(bytes) = decode(&pair) {
                    assert_eq!(encode(&bytes), pair);
                    pairs += 1;
                }
                for &c in ALPHABET {
                    let triple = String::from_utf8(vec![a, b, c]).unwrap();
                    if let Ok(bytes) = decode(&triple) {
                        assert_eq!(encode(&bytes), triple);
                        triples += 1;
                    }
                }
            }
        }
        assert_eq!(pairs, 256);
        assert_eq!(triples, 65_536);
    }

    #[test]
    fn encoded_len_matches_encode() {
        for len in 0..64 {
            let input = vec![0xA5; len];
            assert_eq!(encode(&input).len(), encoded_len(len));
        }
    }
}
