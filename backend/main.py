from fastapi import FastAPI

from backend.api import router as api_router

app = FastAPI(title="IndustrialDashboard API")
app.include_router(api_router)
