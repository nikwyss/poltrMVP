from typing import Any, Dict, List, Optional
from datetime import datetime


DBRow = Dict[str, Any]


def get_string(obj: DBRow, key: str) -> Optional[str]:
    v = obj.get(key)
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        return str(v)
    return None


def get_date_iso(obj: DBRow, key: str) -> Optional[str]:
    v = obj.get(key)
    if not v:
        return None
    if isinstance(v, str):
        try:
            d = datetime.fromisoformat(v.replace('Z', '+00:00'))
            return d.isoformat()
        except:
            return None
    if isinstance(v, datetime):
        return v.isoformat()
    return None


def get_number(obj: DBRow, key: str) -> int:
    v = obj.get(key)
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        try:
            return int(v)
        except:
            return 0
    return 0


def get_array(obj: DBRow, key: str) -> List[Any]:
    v = obj.get(key)
    return v if isinstance(v, list) else []


def get_object(obj: DBRow, key: str) -> Optional[Dict[str, Any]]:
    v = obj.get(key)
    return v if isinstance(v, dict) else None
