from sqlalchemy.orm import Session

from models import AppSetting
from proxy_config import normalize_http_proxy_url, normalize_proxy_user


MAIL_PROXY_SETTING_KEY = "mail_http_proxy"
MAIL_PROXY_USER_SETTING_KEY = "mail_http_proxy_user"


def get_mail_proxy_settings(db: Session) -> tuple[str, str]:
    settings = db.query(AppSetting).filter(
        AppSetting.setting_key.in_((MAIL_PROXY_SETTING_KEY, MAIL_PROXY_USER_SETTING_KEY))
    ).all()
    values = {setting.setting_key: setting.setting_value for setting in settings}
    return (
        normalize_http_proxy_url(values.get(MAIL_PROXY_SETTING_KEY, "")),
        normalize_proxy_user(values.get(MAIL_PROXY_USER_SETTING_KEY, "")),
    )


def get_mail_proxy_url(db: Session) -> str:
    return get_mail_proxy_settings(db)[0]


def save_mail_proxy_settings(db: Session, proxy_url: str, proxy_user: str) -> tuple[str, str]:
    normalized_url = normalize_http_proxy_url(proxy_url)
    normalized_user = normalize_proxy_user(proxy_user)
    # 没有代理地址时认证信息不再具有作用，一并清掉避免遗留无效密钥。
    if not normalized_url:
        normalized_user = ""

    values = {
        MAIL_PROXY_SETTING_KEY: normalized_url,
        MAIL_PROXY_USER_SETTING_KEY: normalized_user,
    }
    settings = db.query(AppSetting).filter(AppSetting.setting_key.in_(tuple(values))).all()
    settings_by_key = {setting.setting_key: setting for setting in settings}
    for key, value in values.items():
        setting = settings_by_key.get(key)
        if setting is None:
            db.add(AppSetting(setting_key=key, setting_value=value))
        else:
            setting.setting_value = value

    db.commit()
    return normalized_url, normalized_user


def save_mail_proxy_url(db: Session, proxy_url: str) -> str:
    """兼容仅更新地址的调用方；保存空地址时也会清除认证信息。"""
    _, proxy_user = get_mail_proxy_settings(db)
    return save_mail_proxy_settings(db, proxy_url, proxy_user)[0]
