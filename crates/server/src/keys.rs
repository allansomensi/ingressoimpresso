//! Event key custody (ADR 0005): random Ed25519 seed per event, sealed with XChaCha20-Poly1305
//! under the master key. The AAD binds the ciphertext to its event and key id, so a sealed key
//! cannot be moved to another row.

use base64::Engine as _;
use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use thiserror::Error;
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

const AAD_DOMAIN: &[u8] = b"ingressoimpresso:event-key:v1";
const NONCE_LEN: usize = 24;

/// The 32-byte master key. Never printed, zeroed on drop.
#[derive(Clone)]
pub struct MasterKey([u8; 32]);

impl Drop for MasterKey {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl MasterKey {
    /// Parses standard base64 of exactly 32 bytes.
    ///
    /// # Errors
    ///
    /// Returns a static reason when the value is not base64 of 32 bytes.
    pub fn from_base64(value: &str) -> Result<Self, &'static str> {
        let mut bytes = Zeroizing::new(
            base64::engine::general_purpose::STANDARD
                .decode(value.trim())
                .map_err(|_| "not valid base64")?,
        );
        let key: [u8; 32] = bytes
            .as_slice()
            .try_into()
            .map_err(|_| "must decode to 32 bytes")?;
        bytes.zeroize();
        Ok(Self(key))
    }
}

impl std::fmt::Debug for MasterKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MasterKey(<redacted>)")
    }
}

/// Key sealing or randomness failure.
#[derive(Debug, Error)]
pub enum KeyError {
    /// The OS random generator failed.
    #[error("OS random generator failed")]
    Random,
    /// Encryption failed.
    #[error("sealing failed")]
    Seal,
    /// Wrong master key, tampered ciphertext or ciphertext moved to another event/key id.
    #[error("unsealing failed")]
    Unseal,
}

/// A fresh random Ed25519 seed.
///
/// # Errors
///
/// [`KeyError::Random`] if the OS RNG fails.
pub fn generate_seed() -> Result<Zeroizing<[u8; 32]>, KeyError> {
    let mut seed = Zeroizing::new([0u8; 32]);
    getrandom::fill(seed.as_mut_slice()).map_err(|_| KeyError::Random)?;
    Ok(seed)
}

fn aad(event_id: Uuid, key_id: u8) -> Vec<u8> {
    let mut aad = Vec::with_capacity(AAD_DOMAIN.len() + 17);
    aad.extend_from_slice(AAD_DOMAIN);
    aad.extend_from_slice(event_id.as_bytes());
    aad.push(key_id);
    aad
}

/// Seals `seed`: output is `nonce (24 bytes) || ciphertext`.
///
/// # Errors
///
/// See [`KeyError`].
pub fn seal(
    master: &MasterKey,
    event_id: Uuid,
    key_id: u8,
    seed: &[u8; 32],
) -> Result<Vec<u8>, KeyError> {
    let cipher = XChaCha20Poly1305::new(&master.0.into());
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce).map_err(|_| KeyError::Random)?;
    let ciphertext = cipher
        .encrypt(
            &XNonce::from(nonce),
            Payload {
                msg: seed,
                aad: &aad(event_id, key_id),
            },
        )
        .map_err(|_| KeyError::Seal)?;
    let mut sealed = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    sealed.extend_from_slice(&nonce);
    sealed.extend_from_slice(&ciphertext);
    Ok(sealed)
}

/// Unseals a key sealed by [`seal`] for the same event and key id.
///
/// # Errors
///
/// [`KeyError::Unseal`] on any mismatch.
pub fn unseal(
    master: &MasterKey,
    event_id: Uuid,
    key_id: u8,
    sealed: &[u8],
) -> Result<Zeroizing<[u8; 32]>, KeyError> {
    let (nonce, ciphertext) = sealed.split_at_checked(NONCE_LEN).ok_or(KeyError::Unseal)?;
    let nonce: [u8; NONCE_LEN] = nonce.try_into().map_err(|_| KeyError::Unseal)?;
    let cipher = XChaCha20Poly1305::new(&master.0.into());
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(
                &XNonce::from(nonce),
                Payload {
                    msg: ciphertext,
                    aad: &aad(event_id, key_id),
                },
            )
            .map_err(|_| KeyError::Unseal)?,
    );
    let seed: [u8; 32] = plaintext
        .as_slice()
        .try_into()
        .map_err(|_| KeyError::Unseal)?;
    Ok(Zeroizing::new(seed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn master(byte: u8) -> MasterKey {
        MasterKey([byte; 32])
    }

    #[test]
    fn round_trips() {
        let event = Uuid::from_bytes([1; 16]);
        let seed = generate_seed().unwrap();
        let sealed = seal(&master(9), event, 1, &seed).unwrap();
        assert_eq!(*unseal(&master(9), event, 1, &sealed).unwrap(), *seed);
    }

    #[test]
    fn binds_master_event_and_key_id() {
        let event = Uuid::from_bytes([1; 16]);
        let sealed = seal(&master(9), event, 1, &[7; 32]).unwrap();
        assert!(unseal(&master(8), event, 1, &sealed).is_err());
        assert!(unseal(&master(9), Uuid::from_bytes([2; 16]), 1, &sealed).is_err());
        assert!(unseal(&master(9), event, 2, &sealed).is_err());
        let mut tampered = sealed.clone();
        if let Some(last) = tampered.last_mut() {
            *last ^= 1;
        }
        assert!(unseal(&master(9), event, 1, &tampered).is_err());
        assert!(unseal(&master(9), event, 1, &sealed[..10]).is_err());
    }

    #[test]
    fn nonces_are_fresh() {
        let event = Uuid::from_bytes([1; 16]);
        assert_ne!(
            seal(&master(9), event, 1, &[7; 32]).unwrap(),
            seal(&master(9), event, 1, &[7; 32]).unwrap()
        );
    }

    #[test]
    fn debug_is_redacted() {
        assert_eq!(format!("{:?}", master(1)), "MasterKey(<redacted>)");
    }
}
