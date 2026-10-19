import email
import html
import imaplib
import base64
import binascii
import logging
import os
import re
import socket
from urllib.parse import urlsplit
from time import perf_counter
from datetime import timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime

from requests import HTTPError
from sqlalchemy.orm import Session

from models import MailAccount
from oauth_service import OAuthServiceError, get_valid_access_token
from proxy_config import get_proxy_authorization_header, normalize_http_proxy_url, normalize_proxy_user
from settings_service import get_mail_proxy_settings


IMAP_HOST = "outlook.live.com"
try:
    IMAP_TIMEOUT_SECONDS = max(float(os.getenv("IMAP_TIMEOUT_SECONDS", "15")), 1.0)
except ValueError:
    IMAP_TIMEOUT_SECONDS = 15.0
JUNK_CANDIDATES = ["Junk", "Junk Email", "Spam", "\u5783\u573e\u90ae\u4ef6"]
CHINA_TZ = timezone(timedelta(hours=8))


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


class MailServiceError(Exception):
    def __init__(self, message: str, tag: str | None = None):
        super().__init__(message)
        self.message = message
        self.tag = tag


PRE_CONTENT_PATTERN = re.compile(r"^<pre[^>]*>([\s\S]*)</pre>$", re.IGNORECASE)


def _normalize_tags(tags: str) -> str:
    seen = []
    for item in tags.replace("\uff0c", ",").split(","):
        value = item.strip()
        if value and value not in seen:
            seen.append(value)
    return ",".join(seen)


def _add_tag(account: MailAccount, tag: str) -> None:
    account.tags = _normalize_tags(",".join(filter(None, [account.tags or "", tag])))


def _generate_auth_string(email_name: str, access_token: str) -> str:
    return f"user={email_name}\1auth=Bearer {access_token}\1\1"


def _decode_modified_utf7(value: bytes) -> str:
    text = value.decode("ascii", errors="ignore")
    output = []
    index = 0

    while index < len(text):
        if text[index] != "&":
            output.append(text[index])
            index += 1
            continue

        end_index = text.find("-", index)
        if end_index == -1:
            output.append(text[index:])
            break

        encoded = text[index + 1 : end_index]
        if not encoded:
            output.append("&")
        else:
            padding = "=" * (-len(encoded) % 4)
            try:
                output.append(base64.b64decode((encoded + padding).replace(",", "/")).decode("utf-16-be"))
            except (binascii.Error, UnicodeDecodeError):
                output.append(text[index : end_index + 1])

        index = end_index + 1

    return "".join(output)


def _encode_modified_utf7(value: str) -> bytes:
    output = []
    buffer = []

    def flush_buffer() -> None:
        if not buffer:
            return
        encoded = base64.b64encode("".join(buffer).encode("utf-16-be")).decode("ascii")
        output.append("&" + encoded.rstrip("=").replace("/", ",") + "-")
        buffer.clear()

    for char in value:
        codepoint = ord(char)
        if char == "&":
            flush_buffer()
            output.append("&-")
        elif 0x20 <= codepoint <= 0x7E:
            flush_buffer()
            output.append(char)
        else:
            buffer.append(char)

    flush_buffer()
    return "".join(output).encode("ascii")


def _quote_mailbox_name(value: bytes) -> bytes:
    return b'"' + value.replace(b"\\", b"\\\\").replace(b'"', b'\\"') + b'"'


def _parse_list_item(item: bytes) -> tuple[bytes, str, str]:
    text = item.strip()
    flags_match = re.match(rb"\((?P<flags>[^)]*)\)", text)
    flags = flags_match.group("flags").decode("ascii", errors="ignore").lower() if flags_match else ""

    if text.endswith(b'"'):
        index = len(text) - 2
        escaped = False
        start_index = -1
        while index >= 0:
            char = text[index : index + 1]
            if char == b'"' and not escaped:
                start_index = index
                break
            escaped = char == b"\\" and not escaped
            if char != b"\\":
                escaped = False
            index -= 1

        raw_name = text[start_index + 1 : -1] if start_index >= 0 else text
        raw_name = raw_name.replace(b'\\"', b'"').replace(b"\\\\", b"\\")
    else:
        raw_name = text.rsplit(maxsplit=1)[-1]

    return raw_name, _decode_modified_utf7(raw_name), flags


def _decode_header(value: str | None) -> str:
    if not value:
        return ""
    return str(make_header(decode_header(value)))


def _format_mail_datetime(value: str | None) -> str:
    if not value:
        return ""

    mail_datetime = parsedate_to_datetime(value)
    if mail_datetime.tzinfo is not None:
        mail_datetime = mail_datetime.astimezone(CHINA_TZ)

    return mail_datetime.strftime("%Y-%m-%d %H:%M:%S")


def _extract_body(message: email.message.Message) -> str:
    html_body = ""
    text_body = ""

    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition") or "")
            if "attachment" in disposition.lower():
                continue

            payload = part.get_payload(decode=True)
            if not payload:
                continue

            charset = part.get_content_charset() or "utf-8"
            content = payload.decode(charset, errors="ignore")

            if content_type == "text/html" and not html_body:
                html_body = content
            elif content_type == "text/plain" and not text_body:
                text_body = content
    else:
        payload = message.get_payload(decode=True) or b""
        charset = message.get_content_charset() or "utf-8"
        text_body = payload.decode(charset, errors="ignore")

    if html_body:
        return html_body
    if text_body:
        return f"<pre>{html.escape(text_body)}</pre>"
    return "<p>No content</p>"


def _looks_like_escaped_html(value: str) -> bool:
    sample = value.strip().lower()
    return any(
        marker in sample
        for marker in (
            "&lt;!doctype",
            "&lt;html",
            "&lt;body",
            "&lt;table",
            "&lt;div",
            "&lt;section",
            "&lt;p",
        )
    )


def _extract_pre_content(value: str) -> str:
    match = PRE_CONTENT_PATTERN.match(value)
    return match.group(1) if match else ""


def get_mail_body_render_mode(body: str | None) -> dict[str, str]:
    content = (body or "").strip()
    if not content:
        return {
            "type": "inline",
            "content": "<p>No content</p>",
        }

    if content.lower().startswith("<pre"):
        pre_content = _extract_pre_content(content)
        if pre_content and _looks_like_escaped_html(pre_content):
            return {
                "type": "iframe",
                "content": html.unescape(pre_content),
            }
        return {
            "type": "inline",
            "content": content,
        }

    return {
        "type": "iframe",
        "content": html.unescape(content) if _looks_like_escaped_html(content) else content,
    }


def _select_folder(mail_client: imaplib.IMAP4_SSL, folder: str) -> None:
    if folder.lower() == "junk":
        result, folders = mail_client.list()
        if result != "OK":
            raise MailServiceError("failed to list folders")

        folder_names = [_parse_list_item(item) for item in folders or []]

        target_folder = next(
            (
                raw_name
                for raw_name, display_name, flags in folder_names
                if "\\junk" in flags or any(key.lower() in display_name.lower() for key in JUNK_CANDIDATES)
            ),
            None,
        )
        if not target_folder:
            raise MailServiceError("junk folder not found")
    else:
        target_folder = _encode_modified_utf7("Inbox")

    result, _ = mail_client.select(_quote_mailbox_name(target_folder))
    if result != "OK":
        display_name = _decode_modified_utf7(target_folder)
        raise MailServiceError(f"failed to open folder: {display_name}")


class ProxyIMAP4SSL(imaplib.IMAP4_SSL):
    # IMAP 不是 HTTP 请求，需要先 CONNECT 建立隧道，再在隧道内进行 TLS 握手。
    def __init__(
        self,
        host="",
        port=imaplib.IMAP4_SSL_PORT,
        *,
        ssl_context=None,
        timeout=None,
        proxy_url=None,
        proxy_user=None,
    ):
        self.proxy_url = normalize_http_proxy_url(proxy_url)
        self.proxy_user = normalize_proxy_user(proxy_user)
        super().__init__(host, port, ssl_context=ssl_context, timeout=timeout)

    def _create_socket(self, timeout):
        if not self.proxy_url:
            return super()._create_socket(timeout)

        proxy = urlsplit(self.proxy_url)
        proxy_socket = socket.create_connection((proxy.hostname, proxy.port), timeout)
        try:
            target_host = f"[{self.host}]" if ":" in self.host else self.host
            target = f"{target_host}:{self.port}"
            request_lines = [
                f"CONNECT {target} HTTP/1.1",
                f"Host: {target}",
                "Proxy-Connection: Keep-Alive",
            ]
            authorization = get_proxy_authorization_header(self.proxy_url, self.proxy_user)
            if authorization:
                request_lines.append(f"Proxy-Authorization: {authorization}")
            proxy_socket.sendall(("\r\n".join(request_lines) + "\r\n\r\n").encode("ascii"))

            response = bytearray()
            while b"\r\n\r\n" not in response:
                chunk = proxy_socket.recv(min(4096, 65536 - len(response)))
                if not chunk:
                    raise OSError("HTTP proxy closed the connection before completing CONNECT")
                response.extend(chunk)
                if len(response) >= 65536 and b"\r\n\r\n" not in response:
                    raise OSError("HTTP proxy CONNECT response headers are too large")

            status_line = bytes(response).split(b"\r\n", 1)[0]
            status_parts = status_line.split(maxsplit=2)
            if len(status_parts) < 2 or status_parts[1] != b"200":
                status_text = status_line.decode("iso-8859-1", errors="replace")
                raise OSError(f"HTTP proxy CONNECT failed: {status_text}")

            # CONNECT 建立隧道后，在该 TCP 连接上继续执行 IMAP 的 TLS 握手。
            return self.ssl_context.wrap_socket(proxy_socket, server_hostname=self.host)
        except Exception:
            proxy_socket.close()
            raise


def _fetch_mail_payloads(
    mail_client: imaplib.IMAP4_SSL,
    mail_ids: list[bytes],
) -> list[tuple[bytes, bytes]]:
    """一次批量获取邮件，避免逐封请求产生大量 IMAP 网络往返。"""
    if not mail_ids:
        return []

    result, data = mail_client.fetch(b",".join(mail_ids), "(RFC822)")
    if result != "OK":
        raise MailServiceError("failed to fetch mails")

    # IMAP 返回的数据通常是 ``(响应头, 原始邮件)`` 与结尾标记交错排列，
    # 不能直接依赖返回顺序，因此从响应头提取序列号后再恢复搜索结果顺序。
    payload_by_id: dict[bytes, bytes] = {}
    for item in data or []:
        if not isinstance(item, tuple) or len(item) < 2:
            continue
        response_header, raw_email = item[0], item[1]
        if not isinstance(response_header, bytes) or not isinstance(raw_email, bytes):
            continue
        sequence_match = re.match(rb"(\d+)", response_header)
        if sequence_match:
            payload_by_id[sequence_match.group(1)] = raw_email

    return [(mail_id, payload_by_id[mail_id]) for mail_id in mail_ids if mail_id in payload_by_id]


def load_mail_messages(
    account: MailAccount,
    db: Session,
    folder: str = "inbox",
    limit: int = 20,
):
    started_at = perf_counter()
    proxy_url, proxy_user = get_mail_proxy_settings(db)
    logger.info(
        "读取邮件开始: account_id=%s email=%s folder=%s limit=%s route=%s proxy_auth=%s",
        account.id,
        account.email,
        folder,
        limit,
        "http_proxy" if proxy_url else "direct",
        bool(proxy_url and proxy_user),
    )

    token_started_at = perf_counter()
    try:
        access_token = get_valid_access_token(
            account,
            db,
            proxy_url=proxy_url,
            proxy_user=proxy_user,
        )
    except HTTPError as exc:
        logger.warning(
            "读取邮件失败: account_id=%s stage=access_token error_type=%s error=%s duration_ms=%.1f",
            account.id,
            type(exc).__name__,
            exc,
            (perf_counter() - started_at) * 1000,
        )
        raise MailServiceError(f"token refresh failed: {exc}", tag="token_invalid") from exc
    except OAuthServiceError as exc:
        logger.warning(
            "读取邮件失败: account_id=%s stage=access_token error_type=%s error=%s duration_ms=%.1f",
            account.id,
            type(exc).__name__,
            exc,
            (perf_counter() - started_at) * 1000,
        )
        raise MailServiceError(
            f"token refresh failed: {exc}",
            tag=getattr(exc, "tag", "token_invalid"),
        ) from exc
    logger.info(
        "读取邮件阶段耗时: account_id=%s stage=access_token duration_ms=%.1f",
        account.id,
        (perf_counter() - token_started_at) * 1000,
    )

    mail = None
    graceful_logout = False
    try:
        connect_started_at = perf_counter()
        mail = ProxyIMAP4SSL(
            IMAP_HOST,
            timeout=IMAP_TIMEOUT_SECONDS,
            proxy_url=proxy_url,
            proxy_user=proxy_user,
        )
        logger.info(
            "读取邮件阶段耗时: account_id=%s stage=imap_connect duration_ms=%.1f timeout_seconds=%s route=%s",
            account.id,
            (perf_counter() - connect_started_at) * 1000,
            IMAP_TIMEOUT_SECONDS,
            "http_proxy" if proxy_url else "direct",
        )

        auth_started_at = perf_counter()
        mail.authenticate(
            "XOAUTH2",
            lambda _: _generate_auth_string(account.email, access_token),
        )
        logger.info(
            "读取邮件阶段耗时: account_id=%s stage=imap_auth duration_ms=%.1f",
            account.id,
            (perf_counter() - auth_started_at) * 1000,
        )

        select_started_at = perf_counter()
        _select_folder(mail, folder)
        logger.info(
            "读取邮件阶段耗时: account_id=%s stage=select_folder duration_ms=%.1f folder=%s",
            account.id,
            (perf_counter() - select_started_at) * 1000,
            folder,
        )

        search_started_at = perf_counter()
        result, data = mail.search(None, "ALL")
        if result != "OK":
            raise MailServiceError("failed to search mails")

        # IMAP search returns byte-string sequence ids; sort them numerically
        # so values like 60/6/59 don't end up in lexicographic order.
        all_mail_ids = data[0].split() if data and data[0] else []
        mail_ids = sorted(all_mail_ids, key=lambda value: int(value), reverse=True)[:limit]
        logger.info(
            "读取邮件阶段耗时: account_id=%s stage=search duration_ms=%.1f total_ids=%s selected_ids=%s",
            account.id,
            (perf_counter() - search_started_at) * 1000,
            len(all_mail_ids),
            len(mail_ids),
        )

        fetch_started_at = perf_counter()
        fetched_payloads = _fetch_mail_payloads(mail, mail_ids)
        logger.info(
            "读取邮件阶段耗时: account_id=%s stage=batch_fetch duration_ms=%.1f requested=%s fetched=%s",
            account.id,
            (perf_counter() - fetch_started_at) * 1000,
            len(mail_ids),
            len(fetched_payloads),
        )

        parse_started_at = perf_counter()
        items = []
        for mail_id, raw_email in fetched_payloads:
            message = email.message_from_bytes(raw_email)
            try:
                mail_dt = _format_mail_datetime(message["Date"])
            except Exception:
                mail_dt = ""

            items.append(
                {
                    "id": mail_id.decode("utf-8", errors="ignore"),
                    "subject": _decode_header(message.get("Subject")),
                    "mail_from": _decode_header(message.get("From")).replace("<", "(").replace(">", ")"),
                    "mail_to": _decode_header(message.get("To")).replace("<", "(").replace(">", ")"),
                    "mail_dt": mail_dt,
                    "body": _extract_body(message),
                }
            )

        logger.info(
            "读取邮件阶段耗时: account_id=%s stage=parse duration_ms=%.1f items=%s",
            account.id,
            (perf_counter() - parse_started_at) * 1000,
            len(items),
        )
        graceful_logout = True
        return items
    except MailServiceError as exc:
        logger.warning(
            "读取邮件失败: account_id=%s stage=imap error=%s duration_ms=%.1f",
            account.id,
            exc.message,
            (perf_counter() - started_at) * 1000,
        )
        raise
    except imaplib.IMAP4.error as exc:
        logger.warning(
            "读取邮件失败: account_id=%s stage=imap error_type=%s error=%s duration_ms=%.1f",
            account.id,
            type(exc).__name__,
            exc,
            (perf_counter() - started_at) * 1000,
        )
        raise MailServiceError(f"imap login failed: {exc}") from exc
    except (socket.timeout, TimeoutError, OSError) as exc:
        logger.warning(
            "读取邮件失败: account_id=%s email=%s error_type=%s error=%s duration_ms=%.1f",
            account.id,
            account.email,
            type(exc).__name__,
            exc,
            (perf_counter() - started_at) * 1000,
        )
        raise MailServiceError(f"imap request timed out or failed: {exc}") from exc
    finally:
        if mail is not None:
            close_started_at = perf_counter()
            try:
                if graceful_logout:
                    try:
                        mail.logout()
                    except (imaplib.IMAP4.error, OSError, socket.timeout, TimeoutError) as exc:
                        logger.warning(
                            "退出 IMAP 连接失败: account_id=%s error_type=%s error=%s duration_ms=%.1f",
                            account.id,
                            type(exc).__name__,
                            exc,
                            (perf_counter() - close_started_at) * 1000,
                        )
                        try:
                            mail.shutdown()
                        except (OSError, socket.timeout, TimeoutError):
                            pass
                else:
                    # 请求失败时直接关闭 socket，避免再次发送 LOGOUT 并额外等待一个网络超时。
                    try:
                        mail.shutdown()
                    except (OSError, socket.timeout, TimeoutError) as exc:
                        logger.warning(
                            "强制关闭 IMAP 连接失败: account_id=%s error_type=%s error=%s",
                            account.id,
                            type(exc).__name__,
                            exc,
                        )
            finally:
                logger.info(
                    "读取邮件阶段耗时: account_id=%s stage=%s duration_ms=%.1f total_duration_ms=%.1f",
                    account.id,
                    "logout" if graceful_logout else "shutdown",
                    (perf_counter() - close_started_at) * 1000,
                    (perf_counter() - started_at) * 1000,
                )


def load_account_mails(
    account: MailAccount,
    db: Session,
    folder: str = "inbox",
    limit: int = 20,
):
    try:
        return load_mail_messages(account, db, folder=folder, limit=limit)
    except MailServiceError as exc:
        if exc.tag:
            _add_tag(account, exc.tag)
            db.commit()
        raise
