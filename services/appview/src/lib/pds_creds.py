import base64
import os
from nacl import secret, utils
from nacl.exceptions import CryptoError
from nacl.signing import SigningKey
import base64

# XChaCha20-Poly1305 via SecretBox?:
# SecretBox nutzt XSalsa20-Poly1305 (auch okay). Wenn du explizit XChaCha willst,
# nimm bindings crypto_aead_xchacha20poly1305_ietf_* (siehe unten).
#
# Minimal & robust: SecretBox (XSalsa20-Poly1305)


def load_master_key() -> bytes:
    key_b64: str | None = os.getenv("APPVIEW_PDS_CREDS_MASTER_KEY_B64")
    if key_b64 is None:
        raise ValueError(
            "APPVIEW_PDS_CREDS_MASTER_KEY_B64 environment variable is not set"
        )
    key = base64.b64decode(key_b64)
    if len(key) != secret.SecretBox.KEY_SIZE:
        raise ValueError("Master key must be 32 bytes")
    return key


def encrypt_app_password(plaintext: str) -> tuple[bytes, bytes]:
    master_key = load_master_key()
    box = secret.SecretBox(master_key)
    nonce = utils.random(secret.SecretBox.NONCE_SIZE)  # 24 bytes
    ct = box.encrypt(plaintext.encode("utf-8"), nonce).ciphertext
    return ct, nonce


def decrypt_app_password(ciphertext: bytes, nonce: bytes) -> str:
    master_key = load_master_key()
    box = secret.SecretBox(master_key)
    try:
        pt = box.decrypt(ciphertext, nonce)
    except CryptoError as e:
        raise ValueError("Decryption failed (wrong key or corrupted data)") from e
    return pt.decode("utf-8")


def get_signing_key() -> SigningKey:
    """Load the AppView's Ed25519 signing key from environment."""
    key_b64 = os.getenv("APPVIEW_SIGNING_KEY_SEED")
    if not key_b64:
        raise ValueError("APPVIEW_SIGNING_KEY_SEED not set in environment")
    seed = base64.b64decode(key_b64)
    return SigningKey(seed)


def sign_eid_verification(eid_hash: str, eid_issuer: str, verified_at: str) -> str:
    """
    Create Ed25519 signature for eID verification record.
    Signs the canonical message: "eidHash|eidIssuer|verifiedAt"
    Returns base64-encoded signature.
    """
    signing_key = get_signing_key()
    message = f"{eid_hash}|{eid_issuer}|{verified_at}".encode("utf-8")
    signed = signing_key.sign(message)
    return base64.b64encode(signed.signature).decode("ascii")


def get_public_key_multibase() -> str:
    """Derive public key from signing key seed and encode as multibase (base58btc)."""
    key_b64 = os.getenv("APPVIEW_SIGNING_KEY_SEED")
    if not key_b64:
        return None
    seed = base64.b64decode(key_b64)
    signing_key = SigningKey(seed)
    public_key_bytes = bytes(signing_key.verify_key)
    # Multicodec prefix for Ed25519 public key: 0xed01
    prefixed = b"\xed\x01" + public_key_bytes
    # Base58btc encoding with 'z' prefix (multibase)
    import base58

    return "z" + base58.b58encode(prefixed).decode("ascii")
