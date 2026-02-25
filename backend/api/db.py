"""Database connectivity helpers for API request handlers."""

import os

from fastapi import HTTPException

try:
    import psycopg
except ImportError:
    psycopg = None


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://hanie@localhost:5432/postgres")


def get_connection():
    """Create and return a PostgreSQL connection for the current request."""
    if psycopg is None:
        raise HTTPException(
            status_code=500,
            detail="PostgreSQL driver missing. Install with: pip install 'psycopg[binary]'",
        )

    try:
        return psycopg.connect(DATABASE_URL)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database connection error: {exc}") from exc
