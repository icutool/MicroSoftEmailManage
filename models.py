from sqlalchemy import Column, Integer, Text

from database import Base


class MailAccount(Base):
    __tablename__ = "mail_account"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(Text, unique=True, index=True, nullable=False)
    password = Column(Text, default="", nullable=False)
    client_id = Column(Text, default="", nullable=False)
    refresh_token = Column(Text, default="", nullable=False)
    cached_access_token = Column(Text, default="", nullable=False)
    access_token_expire_time = Column(Integer, default=0, nullable=False)
    tags = Column(Text, default="", nullable=False)
    remark = Column(Text, default="", nullable=False)
    valid_status = Column(Integer, default=1, nullable=False)
    created_at = Column(Integer, nullable=False)


class TokenRefreshLog(Base):
    __tablename__ = "token_refresh_log"

    id = Column(Integer, primary_key=True, index=True)
    trigger_type = Column(Text, default="manual", nullable=False)
    total_count = Column(Integer, default=0, nullable=False)
    success_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    failure_details = Column(Text, default="[]", nullable=False)
    html_content = Column(Text, default="", nullable=False)
    started_at = Column(Integer, nullable=False)
    finished_at = Column(Integer, nullable=False)
    duration_seconds = Column(Integer, default=0, nullable=False)
    created_at = Column(Integer, nullable=False)


class MailRefreshTokenHistory(Base):
    __tablename__ = "mail_refresh_token_history"

    id = Column(Integer, primary_key=True, index=True)
    mail_account_id = Column(Integer, index=True, nullable=False)
    old_refresh_token = Column(Text, default="", nullable=False)
    update_time = Column(Integer, nullable=False)


class AppSetting(Base):
    __tablename__ = "app_setting"

    setting_key = Column(Text, primary_key=True)
    setting_value = Column(Text, default="", nullable=False)
