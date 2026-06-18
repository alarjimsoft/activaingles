from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.activity_service import generate_activities, evaluate_answer

router = APIRouter(prefix="/activities")


class GenerateRequest(BaseModel):
    mission_id: int
    vocabulary: list = []
    grammar: Optional[dict] = None
    level_code: str = "A1"
    activity_count: int = 4


class EvaluateRequest(BaseModel):
    activity_type: str
    prompt: str
    correct_answer: str
    student_answer: str


@router.post("/generate")
async def generate_route(request: GenerateRequest):
    try:
        context = {
            "vocabulary": request.vocabulary,
            "grammar": request.grammar or {},
            "level_code": request.level_code,
        }
        activities = generate_activities(context, request.activity_count)
        return {"activities": activities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate")
async def evaluate_route(request: EvaluateRequest):
    # Multiple-choice: evaluación client-side, no necesita GPT
    if request.activity_type == "multiple_choice":
        is_correct = (
            request.student_answer.strip().lower()
            == request.correct_answer.strip().lower()
        )
        return {
            "is_correct": is_correct,
            "score": 100 if is_correct else 0,
            "explanation": (
                "Correct!" if is_correct
                else f"The correct answer is: {request.correct_answer}"
            ),
        }

    try:
        return evaluate_answer(
            request.activity_type,
            request.prompt,
            request.correct_answer,
            request.student_answer,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
