import time
import logging
from time import perf_counter

import requests
from sqlalchemy.orm import Session

from models import MailAccount, MailRefreshTokenHistory
from proxy_config import build_requests_proxy_map, normalize_http_proxy_url, normalize_proxy_user


TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
TOKEN_CACHE_SECONDS = 30 * 60


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


class OAuthServiceError(Exception):
    def __init__(self, message: str, tag: str | None = "token_invalid"):
        super().__init__(message)
        self.message = message
        # 网络暂时不可用时不能把账号误判成令牌失效，因此允许调用方关闭自动打标。
        self.tag = tag


def get_valid_access_token(
    account: MailAccount,
    db: Session,
    proxy_url: str | None = None,
    proxy_user: str | None = None,
) -> str:
    now = int(time.time())
    if account.cached_access_token and account.access_token_expire_time > now:
        logger.info(
            "OAuth access_token 命中缓存: account_id=%s email=%s remaining_seconds=%s",
            account.id,
            account.email,
            account.access_token_expire_time - now,
        )
        return account.cached_access_token

    old_refresh_token = account.refresh_token
    started_at = perf_counter()
    proxy_url = normalize_http_proxy_url(proxy_url)
    proxy_user = normalize_proxy_user(proxy_user)
    logger.info(
        "OAuth access_token 缓存未命中，开始刷新: account_id=%s email=%s route=%s proxy_auth=%s",
        account.id,
        account.email,
        "http_proxy" if proxy_url else "direct",
        bool(proxy_url and proxy_user),
    )
    try:
        # 不读取系统代理环境变量，只使用数据库中通过网页设置的代理地址。
        with requests.Session() as session:
            session.trust_env = False
            response = session.post(
                TOKEN_URL,
                data={
                    "client_id": account.client_id,
                    "grant_type": "refresh_token",
                    "refresh_token": old_refresh_token,
                },
                timeout=20,
                proxies=build_requests_proxy_map(proxy_url, proxy_user),
            )
    except requests.RequestException as exc:
        logger.warning(
            "OAuth 刷新接口失败: account_id=%s error_type=%s error=%s duration_ms=%.1f",
            account.id,
            type(exc).__name__,
            exc,
            (perf_counter() - started_at) * 1000,
        )
        raise OAuthServiceError(f"OAuth request failed: {exc}", tag=None) from exc
    logger.info(
        "OAuth 刷新接口响应: account_id=%s status=%s duration_ms=%.1f",
        account.id,
        response.status_code,
        (perf_counter() - started_at) * 1000,
    )
    response.raise_for_status()
    payload = response.json()

    if payload.get("error"):
        raise OAuthServiceError(payload.get("error_description") or payload["error"])

    access_token = payload.get("access_token")
    if not access_token:
        raise OAuthServiceError("token response missing access_token")

    new_refresh_token = str(payload.get("refresh_token") or "").strip()
    if new_refresh_token:
        logger.info("邮箱 %s 收到新的 refresh_token，开始更新数据库并记录历史 refresh_token", account.email)
        if old_refresh_token:
            db.add(
                MailRefreshTokenHistory(
                    mail_account_id=account.id,
                    old_refresh_token=old_refresh_token,
                    update_time=now,
                )
            )
            logger.info("邮箱 %s 的旧 refresh_token 已写入历史记录表", account.email)
        else:
            logger.info("邮箱 %s 当前没有旧 refresh_token，跳过历史记录写入", account.email)
        account.refresh_token = new_refresh_token
        logger.info("邮箱 %s 的 refresh_token 已更新为新值", account.email)

    account.cached_access_token = access_token
    account.access_token_expire_time = now + TOKEN_CACHE_SECONDS
    db.commit()
    db.refresh(account)
    logger.info(
        "OAuth access_token 刷新完成: account_id=%s duration_ms=%.1f",
        account.id,
        (perf_counter() - started_at) * 1000,
    )
    return access_token
