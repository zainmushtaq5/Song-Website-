import re
import unicodedata
from uuid import uuid4


def slugify(text: str, max_length: int = 200) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_length] or "untitled"


def unique_slug(text: str, max_length: int = 200) -> str:
    return f"{slugify(text, max_length - 8)}-{uuid4().hex[:6]}"
