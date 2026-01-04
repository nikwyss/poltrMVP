import json
import base64
from typing import TypedDict


class CursorPayload(TypedDict):
    sort: str  # 'newest' | 'vote_date' | 'topic' | 'popularity'
    p: str     # primary key (date, topic, popularity) as string
    r: str     # rkey


def encode_cursor(payload: CursorPayload) -> str:
    json_str = json.dumps(payload)
    return base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8')


def decode_cursor(cursor: str) -> CursorPayload:
    decoded = base64.urlsafe_b64decode(cursor.encode('utf-8')).decode('utf-8')
    return json.loads(decoded)
