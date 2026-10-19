import base64
from urllib.parse import unquote, urlsplit


def normalize_http_proxy_url(proxy_url: str | None) -> str:
    proxy_url = (proxy_url or "").strip()
    if not proxy_url:
        return ""
    if any(char.isspace() or ord(char) < 32 for char in proxy_url):
        raise ValueError("代理地址格式错误，请输入 http://主机:端口")

    try:
        parsed = urlsplit(proxy_url)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("代理地址格式错误，请输入 http://主机:端口") from exc

    if (
        parsed.scheme.lower() != "http"
        or not parsed.hostname
        or port is None
        or not 1 <= port <= 65535
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("代理地址格式错误，请输入 http://主机:端口")

    return proxy_url


def build_requests_proxy_map(proxy_url: str | None) -> dict[str, str]:
    proxy_url = normalize_http_proxy_url(proxy_url)
    if not proxy_url:
        return {}
    return {"http": proxy_url, "https": proxy_url}


def get_proxy_authorization_header(proxy_url: str | None) -> str | None:
    proxy_url = normalize_http_proxy_url(proxy_url)
    if not proxy_url:
        return None

    parsed = urlsplit(proxy_url)
    if parsed.username is None:
        return None

    username = unquote(parsed.username)
    password = unquote(parsed.password or "")
    credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {credentials}"
