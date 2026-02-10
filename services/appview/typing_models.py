from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class Author:
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None
    labels: List[Any] = field(default_factory=list)
    viewer: Any = None


@dataclass
class BallotRecord:
    type_: Optional[str] = None  # $type
    title: Optional[str] = None
    description: Optional[str] = None
    voteDate: Optional[str] = None
    createdAt: Optional[str] = None
    deleted: bool = False
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Ballot:
    uri: str
    cid: str
    author: Author
    record: Dict[str, Any]
    indexedAt: Optional[str] = None
    likeCount: int = 0
    replyCount: int = 0
    bookmarkCount: int = 0
    labels: List[Any] = field(default_factory=list)
    viewer: Any = None
