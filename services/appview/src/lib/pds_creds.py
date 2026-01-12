import base64
import os
from nacl import secret, utils
from nacl.exceptions import CryptoError

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
