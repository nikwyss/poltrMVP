from nacl.signing import SigningKey
import base64

key = SigningKey.generate()
print("APPVIEW_SIGNING_KEY_SEED=" + base64.b64encode(bytes(key)).decode())
print("Public Key (für DID Doc):" + base64.b64encode(bytes(key.verify_key)).decode())
