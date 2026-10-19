from sqlalchemy.orm import Session

from models import AppSetting
from proxy_config import normalize_http_proxy_url


MAIL_PROXY_SETTING_KEY = "mail_http_proxy"


def get_mail_proxy_url(db: Session) -> str:
    setting = db.query(AppSetting).filter(AppSetting.setting_key == MAIL_PROXY_SETTING_KEY).first()
    return normalize_http_proxy_url(setting.setting_value if setting else "")


def save_mail_proxy_url(db: Session, proxy_url: str) -> str:
    normalized_url = normalize_http_proxy_url(proxy_url)
    setting = db.query(AppSetting).filter(AppSetting.setting_key == MAIL_PROXY_SETTING_KEY).first()
    if setting is None:
        setting = AppSetting(setting_key=MAIL_PROXY_SETTING_KEY, setting_value=normalized_url)
        db.add(setting)
    else:
        setting.setting_value = normalized_url

    db.commit()
    return normalized_url
