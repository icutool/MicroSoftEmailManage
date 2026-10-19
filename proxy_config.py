import base64
import os
from urllib.parse import unquote, urlsplit


def _load_http_proxy_url() -> str | None:
    proxy_url = os.getenv("MAIL_HTTP_PROXY", "").strip()
    if not proxy_url:
        return None

    try:
        parsed = urlsplit(proxy_url)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("MAIL_HTTP_PROXY must be a valid http://host:port URL") from exc

    if (
        parsed.scheme.lower() != "http"
        or not parsed.hostname
        or port is None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("MAIL_HTTP_PROXY must be a valid http://host:port URL")

    return proxy_url


MAIL_HTTP_PROXY_URL = _load_http_proxy_url()
REQUESTS_PROXY_MAP = (
    {"http": MAIL_HTTP_PROXY_URL, "https": MAIL_HTTP_PROXY_URL}
    if MAIL_HTTP_PROXY_URL
    else {}
)


def get_proxy_authorization_header() -> str | None:
    if not MAIL_HTTP_PROXY_URL:
        return None

    parsed = urlsplit(MAIL_HTTP_PROXY_URL)
    if parsed.username is None:
        return None

    username = unquote(parsed.username)
    password = unquote(parsed.password or "")
    credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {credentials}"
