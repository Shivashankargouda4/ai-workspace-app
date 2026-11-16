import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Header, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal, Optional

app = FastAPI(
    title="Task Delay Prediction Microservice",
    description="Predicts the risk of project/task delay based on task features.",
    version="1.0.0"
)

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5000,http://127.0.0.1:5000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "x-api-key"],
)

# Load trained model pipeline
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models', 'delay_predictor.joblib')
model = None

@app.on_event("startup")
def load_model():
    global model
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        print("✅ ML Model loaded successfully into memory.")
    else:
        print("⚠️ Model file not found. Please run train.py first.")

class TaskPredictionInput(BaseModel):
    priority: Literal['low', 'medium', 'high'] = Field(..., description="Task priority")
    complexity: int = Field(..., ge=1, le=10, description="Complexity scale 1 to 10")
    estimated_days: int = Field(..., ge=1, description="Estimated work days")
    team_size: int = Field(default=2, ge=1, description="Members on task")
    assignee_workload: int = Field(default=3, ge=1, description="Concurrent active tasks")
    previous_delays_ratio: float = Field(default=0.2, ge=0.0, le=1.0, description="Historical delay ratio")
    midpoint_progress: int = Field(default=40, ge=0, le=100, description="Progress at midpoint checkpoint")

class PredictionResponse(BaseModel):
    delay_probability: float
    risk_level: Literal['low', 'medium', 'high']
    model_version: str

@app.get("/health")
def health(response: Response):
    global model
    is_loaded = model is not None
    if not is_loaded and os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            is_loaded = True
        except Exception:
            is_loaded = False

    if not is_loaded:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "degraded",
            "service": "ML Delay Predictor",
            "model_loaded": False,
            "error": "Model binary not loaded or unavailable"
        }

    return {
        "status": "ok",
        "service": "ML Delay Predictor",
        "model_loaded": True,
        "model_version": "rf-v1.0"
    }

@app.post("/predict", response_model=PredictionResponse)
def predict_delay(task: TaskPredictionInput, x_api_key: Optional[str] = Header(None)):
    expected_key = os.getenv("ML_API_KEY")
    if expected_key and x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid ML API Key")

    global model
    if model is None:
        if os.path.exists(MODEL_PATH):
            model = joblib.load(MODEL_PATH)
        else:
            raise HTTPException(status_code=503, detail="Model not loaded or trained yet.")

    df_input = pd.DataFrame([{
        'priority': task.priority,
        'complexity': task.complexity,
        'estimated_days': task.estimated_days,
        'team_size': task.team_size,
        'assignee_workload': task.assignee_workload,
        'previous_delays_ratio': task.previous_delays_ratio,
        'midpoint_progress': task.midpoint_progress
    }])

    proba = float(model.predict_proba(df_input)[:, 1][0])

    if proba >= 0.65:
        risk_level = "high"
    elif proba >= 0.35:
        risk_level = "medium"
    else:
        risk_level = "low"

    return {
        "delay_probability": round(proba, 4),
        "risk_level": risk_level,
        "model_version": "rf-v1.0"
    }
