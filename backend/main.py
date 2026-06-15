import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.routers.upload import router as upload_router
from backend.routers.loginsystem import router as auth_router
from backend.routers.assistant import router as assistant_router
from backend.routers.reviewroutes import router as review_router
from backend.database import check_db_connection, engine, Base
from sqlalchemy import text

# ------------------------------------------------------------------
# Filter noisy tracker requests from logs
# ------------------------------------------------------------------
class FilterZybTracker(logging.Filter):
    def filter(self, record):
        return "zybTracker" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(FilterZybTracker())

# ------------------------------------------------------------------
# App
# ------------------------------------------------------------------
app = FastAPI(title="Medical Coding Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# DEBUG MIDDLEWARE — logs every upload request so we can see the
# exact Content-Type and body the frontend is sending.
# Remove this block once uploads are working.
# ------------------------------------------------------------------
@app.middleware("http")
async def log_upload_requests(request: Request, call_next):
    if "/upload" in request.url.path and request.method == "POST":
        body = await request.body()
        ct   = request.headers.get("content-type", "*** MISSING ***")
        auth = request.headers.get("authorization", "absent")
        print("\n" + "=" * 70)
        print("UPLOAD DEBUG")
        print(f"  Path:         {request.method} {request.url.path}")
        print(f"  Content-Type: {ct}")
        print(f"  Auth:         {'present' if auth != 'absent' else 'absent'}")
        print(f"  Body preview: {body[:400]}")
        print("=" * 70 + "\n")
        request._body = body   # re-inject so the route can still read it
    response = await call_next(request)
    if "/upload" in request.url.path and response.status_code in (400, 422):
        print(f"!!! Upload returned {response.status_code} — check Content-Type above !!!")
    return response

@app.exception_handler(422)
async def show_422_detail(request: Request, exc):
    errors = getattr(exc, "errors", lambda: [])()
    readable = [
        {"field": " → ".join(str(x) for x in e.get("loc", [])),
         "problem": e.get("msg", "")}
        for e in errors
    ]
    print(f"422 VALIDATION ERRORS: {readable}")
    return JSONResponse(status_code=422, content={"validation_errors": readable})

# ------------------------------------------------------------------
# Startup — verify DB connection and create tables automatically
# ------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    connected = check_db_connection()
    if connected:
        try:
            Base.metadata.create_all(bind=engine)
            print("✅ PostgreSQL tables checked and initialized successfully.")
        except Exception as e:
            print(f"❌ Error creating PostgreSQL tables: {e}")
    else:
        print("\n⚠️  WARNING: Could not connect to PostgreSQL.")
        print("   Check your DATABASE_URL in .env and make sure PostgreSQL is running.\n")


# ------------------------------------------------------------------
# Routers
# ------------------------------------------------------------------
app.include_router(upload_router,    prefix="/api")
app.include_router(auth_router,      prefix="/api/auth", tags=["Authentication"])
app.include_router(assistant_router, prefix="/api",      tags=["AI Assistant"])
app.include_router(review_router,    prefix="/api",      tags=["Code Review"])

# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@app.get("/")
async def root():
    return {"message": "Medical Coding Assistant API is running!"}


@app.get("/health")
async def health_check():
    """Hit this to verify DB connectivity at any time."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected ✅"}
    except Exception as e:
        return {"status": "error", "database": f"❌ {str(e)}"}