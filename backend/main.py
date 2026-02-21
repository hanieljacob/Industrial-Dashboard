import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import router as api_router

app = FastAPI(title="IndustrialDashboard API")

raw_cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
cors_allow_origins = [
    origin.strip().rstrip("/")
    for origin in raw_cors_origins.replace("\n", ",").split(",")
    if origin.strip()
]
raw_cors_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_origin_regex=raw_cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
