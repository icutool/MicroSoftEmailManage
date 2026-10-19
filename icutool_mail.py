import os
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
from urllib.parse import quote
from time import perf_counter

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine
from mail_service import MailServiceError, load_account_mails
from models import MailAccount, TokenRefreshLog
from settings_service import get_mail_proxy_settings, save_mail_proxy_settings
from token_refresh_service import (
    ALLOWED_PAGE_SIZES,
    TokenRefreshTaskRunningError,
    serialize_token_refresh_log,
    start_token_refresh_job_async,
    start_token_refresh_scheduler,
    stop_token_refresh_scheduler,
)


ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False

Base.metadata.create_all(bind=engine)


class LoginBody(BaseModel):
    password: str


class ImportBody(BaseModel):
    text: str


class TagsBody(BaseModel):
    tags: str


class RemarkBody(BaseModel):
    remark: str


class ProxySettingBody(BaseModel):
    proxy_url: str = ""
    proxy_user: str = ""


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_token(x_token: Optional[str] = Header(default=None)):
    if x_token != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="unauthorized")


def require_preview_token(token: Optional[str] = Query(default=None)):
    if token != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="unauthorized")


def normalize_tags(tags: str) -> str:
    seen = []
    for item in tags.replace("\uff0c", ",").split(","):
        value = item.strip()
        if value and value not in seen:
            seen.append(value)
    return ",".join(seen)


def parse_tags(tags: str) -> list[str]:
    return [tag for tag in normalize_tags(tags or "").split(",") if tag]


def matches_tag_filter(account: MailAccount, tag: str) -> bool:
    tag_text = tag.strip()
    if not tag_text:
        return True
    tags = parse_tags(account.tags or "")
    if tag_text == "__NO_TAG__":
        return not tags
    return tag_text in tags


def normalize_remark(remark: str) -> str:
    return (remark or "").strip()


def ensure_mail_account_schema() -> None:
    with engine.begin() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(mail_account)").fetchall()}
        if "remark" not in columns:
            conn.exec_driver_sql("ALTER TABLE mail_account ADD COLUMN remark TEXT NOT NULL DEFAULT ''")
        if "valid_status" not in columns:
            conn.exec_driver_sql("ALTER TABLE mail_account ADD COLUMN valid_status INTEGER NOT NULL DEFAULT 1")
        conn.exec_driver_sql("UPDATE mail_account SET valid_status = 1 WHERE valid_status IS NULL")


def ensure_token_refresh_log_schema() -> None:
    with engine.begin() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(token_refresh_log)").fetchall()}
        if "html_content" not in columns:
            conn.exec_driver_sql("ALTER TABLE token_refresh_log ADD COLUMN html_content TEXT NOT NULL DEFAULT ''")


ensure_mail_account_schema()
ensure_token_refresh_log_schema()


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_token_refresh_scheduler()
    try:
        yield
    finally:
        stop_token_refresh_scheduler()


app = FastAPI(title="Hotmail Mail Manager", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.middleware("http")
async def log_request_timing(request: Request, call_next):
    """记录每个 HTTP 请求耗时，便于区分接口、数据库和外部邮箱服务的延迟。"""
    started_at = perf_counter()
    response = None
    try:
        response = await call_next(request)
        return response
    except Exception:
        logger.exception("HTTP 请求异常: method=%s path=%s", request.method, request.url.path)
        raise
    finally:
        logger.info(
            "HTTP 请求完成: method=%s path=%s status=%s duration_ms=%.1f",
            request.method,
            request.url.path,
            response.status_code if response is not None else 500,
            (perf_counter() - started_at) * 1000,
        )


@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={})


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={})


@app.post("/login")
def login(body: LoginBody):
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="password error")
    return {"token": ADMIN_PASSWORD}


@app.get("/api/accounts", dependencies=[Depends(require_token)])
def list_accounts(
    q: str = Query(default=""),
    tag: str = Query(default=""),
    db: Session = Depends(get_db),
):
    query = db.query(MailAccount)
    if q:
        like_text = f"%{q.strip()}%"
        query = query.filter(MailAccount.email.like(like_text))
    if tag:
        tag_text = tag.strip()
        if tag_text == "__NO_TAG__":
            query = query.filter(or_(MailAccount.tags.is_(None), MailAccount.tags == ""))
        else:
            query = query.filter(MailAccount.tags.like(f"%{tag_text}%"))

    accounts = query.order_by(MailAccount.id.desc()).all()
    return {
        "items": [
            {
                "id": account.id,
                "email": account.email,
                "tags": normalize_tags(account.tags or ""),
                "remark": normalize_remark(account.remark or ""),
                "created_at": account.created_at,
            }
            for account in accounts
        ]
    }


@app.get("/api/settings/proxy", dependencies=[Depends(require_token)])
def get_proxy_settings(db: Session = Depends(get_db)):
    proxy_url, proxy_user = get_mail_proxy_settings(db)
    return {
        "proxy_url": proxy_url,
        "proxy_user": proxy_user,
        "enabled": bool(proxy_url),
    }


@app.put("/api/settings/proxy", dependencies=[Depends(require_token)])
def update_proxy_settings(body: ProxySettingBody, db: Session = Depends(get_db)):
    try:
        proxy_url, proxy_user = save_mail_proxy_settings(db, body.proxy_url, body.proxy_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info("邮件 HTTP 代理设置已保存: enabled=%s authentication_enabled=%s", bool(proxy_url), bool(proxy_user))
    return {
        "proxy_url": proxy_url,
        "proxy_user": proxy_user,
        "enabled": bool(proxy_url),
    }


@app.post("/api/accounts/import", dependencies=[Depends(require_token)])
def import_accounts(body: ImportBody, db: Session = Depends(get_db)):
    lines = body.text.splitlines()
    inserted = 0
    updated = 0
    skipped = 0

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        parts = [part.strip() for part in line.split("----")]
        if len(parts) != 4:
            skipped += 1
            continue

        email_value, password, client_id, refresh_token = parts
        account = db.query(MailAccount).filter(MailAccount.email == email_value).first()
        now = int(time.time())

        if account is None:
            account = MailAccount(
                email=email_value,
                password=password,
                client_id=client_id,
                refresh_token=refresh_token,
                cached_access_token="",
                access_token_expire_time=0,
                tags="",
                remark="",
                valid_status=1,
                created_at=now,
            )
            db.add(account)
            inserted += 1
        else:
            account.password = password
            account.client_id = client_id
            account.refresh_token = refresh_token
            updated += 1

    db.commit()
    return {"inserted": inserted, "updated": updated, "skipped": skipped}


@app.get("/api/accounts/export", dependencies=[Depends(require_token)])
def export_accounts(
    tag: str = Query(default=""),
    db: Session = Depends(get_db),
):
    accounts = (
        db.query(MailAccount)
        .filter(MailAccount.valid_status != 0)
        .order_by(MailAccount.id.asc())
        .all()
    )
    if tag:
        accounts = [account for account in accounts if matches_tag_filter(account, tag)]

    lines = [
        "----".join(
            [
                (account.email or "").replace("\r", " ").replace("\n", " "),
                (account.password or "").replace("\r", " ").replace("\n", " "),
                (account.client_id or "").replace("\r", " ").replace("\n", " "),
                (account.refresh_token or "").replace("\r", " ").replace("\n", " "),
            ]
        )
        for account in accounts
    ]
    content = "\n".join(lines)
    now = datetime.now()
    timestamp = now.strftime("%Y年%m月%d日%H时%M分%S秒")
    filename = f"emailToken{timestamp}.txt"
    fallback_filename = f"emailToken{now.strftime('%Y%m%d%H%M%S')}.txt"
    headers = {
        "Content-Disposition": (
            f'attachment; filename="{fallback_filename}"; '
            f"filename*=UTF-8''{quote(filename)}"
        )
    }
    return Response(content=content, media_type="text/plain; charset=utf-8", headers=headers)


@app.post("/api/accounts/{account_id}/tags", dependencies=[Depends(require_token)])
def update_tags(account_id: int, body: TagsBody, db: Session = Depends(get_db)):
    account = db.query(MailAccount).filter(MailAccount.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")

    account.tags = normalize_tags(body.tags)
    db.commit()
    return {"ok": True, "tags": account.tags}


@app.post("/api/accounts/{account_id}/remark", dependencies=[Depends(require_token)])
def update_remark(account_id: int, body: RemarkBody, db: Session = Depends(get_db)):
    account = db.query(MailAccount).filter(MailAccount.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")

    account.remark = normalize_remark(body.remark)
    db.commit()
    return {"ok": True, "remark": account.remark}


@app.get("/api/accounts/{account_id}/mails", dependencies=[Depends(require_token)])
def get_account_mails(
    account_id: int,
    folder: str = Query(default="inbox"),
    db: Session = Depends(get_db),
):
    started_at = perf_counter()
    logger.info(
        "收信箱业务开始: account_id=%s folder=%s limit=%s",
        account_id,
        folder,
        20,
    )
    account = db.query(MailAccount).filter(MailAccount.id == account_id).first()
    if account is None:
        logger.info(
            "收信箱业务结束: account_id=%s result=not_found duration_ms=%.1f",
            account_id,
            (perf_counter() - started_at) * 1000,
        )
        raise HTTPException(status_code=404, detail="account not found")

    try:
        items = load_account_mails(account, db, folder=folder, limit=20)
        logger.info(
            "收信箱业务结束: account_id=%s result=success item_count=%s duration_ms=%.1f",
            account_id,
            len(items),
            (perf_counter() - started_at) * 1000,
        )
        return {"items": items}
    except MailServiceError as exc:
        logger.warning(
            "收信箱业务结束: account_id=%s result=failed error=%s duration_ms=%.1f",
            account_id,
            exc.message,
            (perf_counter() - started_at) * 1000,
        )
        raise HTTPException(status_code=400, detail=exc.message)


@app.get("/api/token-refresh-logs", dependencies=[Depends(require_token)])
def list_token_refresh_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    if page_size not in ALLOWED_PAGE_SIZES:
        raise HTTPException(status_code=400, detail="每页条数仅支持 10、30、50")

    query = db.query(TokenRefreshLog)
    total = query.count()
    total_pages = max((total + page_size - 1) // page_size, 1)
    items = (
        query.order_by(TokenRefreshLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [serialize_token_refresh_log(item) for item in items],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


@app.get("/token-refresh-logs/{log_id}/preview", response_class=HTMLResponse)
def preview_token_refresh_log_html(
    log_id: int,
    _: None = Depends(require_preview_token),
    db: Session = Depends(get_db),
):
    log = db.query(TokenRefreshLog).filter(TokenRefreshLog.id == log_id).first()
    if log is None:
        raise HTTPException(status_code=404, detail="log not found")
    if not (log.html_content or "").strip():
        raise HTTPException(status_code=404, detail="html not found")
    return HTMLResponse(content=log.html_content)


@app.post("/api/token-refresh-logs/trigger", dependencies=[Depends(require_token)])
def trigger_token_refresh_task():
    try:
        start_token_refresh_job_async(trigger_type="manual")
    except TokenRefreshTaskRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {
        "ok": True,
        "message": "刷新任务已开始，正在后台执行",
    }


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10019)
