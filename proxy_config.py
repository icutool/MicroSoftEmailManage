import base64
from urllib.parse import quote, unquote, urlsplit, urlunsplit


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


def normalize_proxy_user(proxy_user: str | None) -> str:
    proxy_user = proxy_user or ""
    if not proxy_user.strip():
        return ""
    username, separator, password = proxy_user.partition(":")
    if not separator or not username or not password:
        raise ValueError("代理认证格式错误，请按 用户名:密码 填写")
    return proxy_user


def _split_proxy_user(proxy_user: str) -> tuple[str, str]:
    username, _, password = normalize_proxy_user(proxy_user).partition(":")
    return username, password


def build_requests_proxy_map(proxy_url: str | None, proxy_user: str | None = None) -> dict[str, str]:
    proxy_url = normalize_http_proxy_url(proxy_url)
    if not proxy_url:
        return {}

    proxy_user = normalize_proxy_user(proxy_user)
    if proxy_user:
        parsed = urlsplit(proxy_url)
        username, password = _split_proxy_user(proxy_user)
        host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
        # Requests 从代理 URL 解析凭据，因此先编码保留字符，避免密码中的 @、: 等被误认为 URL 分隔符。
        netloc = f"{quote(username, safe='')}:{quote(password, safe='')}@{host}:{parsed.port}"
        proxy_url = urlunsplit((parsed.scheme, netloc, parsed.path, "", ""))

    return {"http": proxy_url, "https": proxy_url}


def get_proxy_authorization_header(
    proxy_url: str | None,
    proxy_user: str | None = None,
) -> str | None:
    proxy_url = normalize_http_proxy_url(proxy_url)
    if not proxy_url:
        return None

    proxy_user = normalize_proxy_user(proxy_user)
    if proxy_user:
        username, password = _split_proxy_user(proxy_user)
    else:
        parsed = urlsplit(proxy_url)
        if parsed.username is None:
            return None
        username = unquote(parsed.username)
        password = unquote(parsed.password or "")

    # IMAP 代理认证在 CONNECT 请求头中发送，使用 UTF-8 编码用户名和密码后再做 Basic 编码。
    credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {credentials}"
