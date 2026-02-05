from __future__ import annotations

import datetime as dt
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..core.database import Base


class Printer(Base):
    __tablename__ = "printers"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    base_url = Column(String(500), nullable=False)
    api_key = Column(String(500), nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    tags = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)

    targets = relationship("JobTarget", back_populates="printer")


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True)
    original_filename = Column(String(255), nullable=False)
    storage_path = Column(String(1000), nullable=False)
    file_hash = Column(String(64), nullable=False)
    size = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)

    jobs = relationship("Job", back_populates="file")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True)
    file_id = Column(Integer, ForeignKey("files.id"), nullable=False)
    status = Column(String(50), nullable=False, default="uploaded")
    requested_action = Column(String(20), nullable=False, default="upload")
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)

    file = relationship("File", back_populates="jobs")
    targets = relationship("JobTarget", back_populates="job")


class JobTarget(Base):
    __tablename__ = "job_targets"

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    printer_id = Column(Integer, ForeignKey("printers.id"), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    error_message = Column(Text, nullable=True)

    job = relationship("Job", back_populates="targets")
    printer = relationship("Printer", back_populates="targets")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
