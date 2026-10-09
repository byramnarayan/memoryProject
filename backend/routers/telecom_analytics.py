import logging
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from auth import CurrentUser
from database import get_db
from services.cross_silo_engine import compute_cross_silo_analytics, compute_spof_and_decay_matrix
from services.decision_simulator import simulate_operational_scenario

logger = logging.getLogger("uvicorn")
router = APIRouter()


class SimulationRequest(BaseModel):
    scenario_type: str = Field(..., description="EMPLOYEE_DEPARTURE | PLANNED_OUTAGE | HARDWARE_UPGRADE")
    scenario_name: Optional[str] = None
    params: Dict[str, Any] = Field(default_factory=dict)


@router.get("/cross-silo")
async def get_cross_silo_intelligence(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Unified Cross-Silo Analytics correlating Databricks outages, CRM tickets, and employee decisions.
    """
    analytics = await compute_cross_silo_analytics(current_user.tenant_id, db)
    return analytics


@router.get("/spof-matrix")
async def get_spof_and_decay_matrix(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Detects Single Points of Failure (SPOF) where knowledge is concentrated in a single employee,
    and identifies dormant subsystems at risk of knowledge decay.
    """
    matrix = await compute_spof_and_decay_matrix(current_user.tenant_id, db)
    return matrix


@router.post("/simulate")
async def run_decision_simulation(
    req: SimulationRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Simulates operational decisions (Employee Departure, Planned Outage, Hardware Upgrade)
    and projects quantitative impacts on SLA penalties, churn risk, and affected subscribers.
    """
    try:
        results = await simulate_operational_scenario(
            scenario_type=req.scenario_type,
            params=req.params,
            tenant_id=current_user.tenant_id,
            db=db,
        )

        name = req.scenario_name or results.get("scenario_title", req.scenario_type)
        rec = models.SimulationRecord(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            scenario_type=req.scenario_type,
            scenario_name=name,
        )
        rec.set_inputs(req.params)
        rec.set_results(results)
        db.add(rec)
        await db.commit()
        await db.refresh(rec)

        return {
            "success": True,
            "simulation_id": rec.id,
            "results": results,
        }
    except Exception as e:
        logger.error(f"Simulation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Simulation failed: {str(e)}",
        )


@router.get("/simulations")
async def list_past_simulations(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Lists past simulation runs for audit and historical decision comparison.
    """
    stmt = (
        select(models.SimulationRecord)
        .where(models.SimulationRecord.tenant_id == current_user.tenant_id)
        .order_by(models.SimulationRecord.created_at.desc())
        .limit(20)
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        {
            "id": r.id,
            "scenario_type": r.scenario_type,
            "scenario_name": r.scenario_name,
            "input_params": r.get_inputs(),
            "results": r.get_results(),
            "created_at": r.created_at.isoformat(),
        }
        for r in records
    ]
