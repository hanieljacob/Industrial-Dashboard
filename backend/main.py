import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import router as api_router

app = FastAPI(title="IndustrialDashboard API")

raw_cors_origins = os.getenv("CORS_ALLOW_ORIGINS")
if raw_cors_origins:
    cors_allow_origins = [origin.strip() for origin in raw_cors_origins.split(",") if origin.strip()]
else:
    cors_allow_origins = []

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
