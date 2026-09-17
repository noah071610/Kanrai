import enum
from typing import Optional

from sqlalchemy import Column, Enum, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Role(enum.Enum):
    admin = "a"
    user = "u"


class TimestampMixin:
    created_at: Mapped[str] = mapped_column(String(30))


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "handle"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column("email_address", String(255), unique=True)
    nickname: Mapped[Optional[str]]
    bio: Mapped[str | None] = mapped_column(nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role))
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))
    handle = Column(String)
    posts: Mapped[list["Post"]] = relationship(back_populates="author")


class Membership(Base):
    __tablename__ = "memberships"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    team_id: Mapped[int] = mapped_column(primary_key=True)


class Abstract(Base):
    __abstract__ = True
    __tablename__ = "never"


audit = Table("audit_log", Base.metadata, Column("id", Integer, primary_key=True), Column("note", String))
