from enum import Enum
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, Relationship, SQLModel


class Power(str, Enum):
    fly = "fly"
    swim = "swim"


class HeroBase(SQLModel):
    name: str = Field(index=True)
    secret_name: str = Field(unique=True)
    age: Optional[int] = None


class Hero(HeroBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    power: Power | None = None
    bio: str = Field(sa_column=Column(Text, nullable=True))
    team: Optional["Team"] = Relationship(back_populates="heroes")


class Team(SQLModel, table=True):
    __tablename__ = "teams"
    id: int = Field(primary_key=True)
    heroes: list[Hero] = Relationship(back_populates="team")


class HeroCreate(HeroBase):
    pass
