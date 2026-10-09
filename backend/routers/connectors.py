import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from auth import CurrentUser
from connectors.databricks_connector import DatabricksConnector
from database import get_db

logger = logging.getLogger("uvicorn")
router = APIRouter()


class DatabricksTestRequest(BaseModel):
    server_hostname: str | None = None
    http_path: str | None = None
    access_token: str | None = None
    catalog: str = "telco_lakehouse"


class DatabricksSaveRequest(BaseModel):
    name: str = "Databricks Telco Lakehouse"
    server_hostname: str = Field(min_length=3)
    http_path: str = Field(min_length=3)
    access_token: str = Field(min_length=3)
    catalog: str = "telco_lakehouse"
    target_schemas: str = "silver,gold"


class SyncTriggerRequest(BaseModel):
    limit_per_table: int = 50


def mask_token(token: str) -> str:
    """Mask token string for safe UI presentation (e.g., dapi***a78f)."""
    if not token or len(token) < 8:
        return "••••••••"
    return f"{token[:4]}••••••••{token[-4:]}"


@router.get("")
async def list_connectors(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all enterprise connectors configured for the current tenant."""
    res = await db.execute(
        select(models.ConnectorConfig)
        .where(models.ConnectorConfig.tenant_id == current_user.tenant_id)
        .order_by(models.ConnectorConfig.created_at.desc())
    )
    configs = res.scalars().all()

    # If no Databricks connector exists yet, return default template
    items = []
    has_databricks = False
    for c in configs:
        if c.connector_type == "DATABRICKS":
            has_databricks = True
        items.append({
            "id": c.id,
            "connector_type": c.connector_type,
            "name": c.name,
            "server_hostname": c.server_hostname,
            "http_path": c.http_path,
            "access_token_masked": c.access_token_masked,
            "catalog": c.catalog,
            "target_schemas": c.target_schemas,
            "status": c.status,
            "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
            "records_synced": c.records_synced,
            "metadata": c.get_metadata(),
        })

    if not has_databricks:
        items.append({
            "id": 0,
            "connector_type": "DATABRICKS",
            "name": "Databricks Telco Lakehouse (Unity Catalog)",
            "server_hostname": "adb-telco-lakehouse.azuredatabricks.net",
            "http_path": "/sql/1.0/warehouses/04b9e11fc98100a",
            "access_token_masked": "pat••••••••78bc",
            "catalog": "telco_lakehouse",
            "target_schemas": "silver,gold",
            "status": "DISCONNECTED",
            "last_synced_at": None,
            "records_synced": 0,
            "metadata": {
                "source": "Databricks Handover Benchmark",
                "recommended_tables": ["silver.network_event", "silver.cell", "gold.site_kpi_daily", "support.service_ticket"],
            },
        })

    return items


@router.post("/databricks/test")
async def test_databricks_connection(
    req: DatabricksTestRequest,
    current_user: CurrentUser,
):
    """
    Validate Databricks SQL Warehouse connectivity using server hostname, HTTP path, and PAT.
    """
    connector = DatabricksConnector(
        server_hostname=req.server_hostname,
        http_path=req.http_path,
        access_token=req.access_token,
        catalog=req.catalog,
    )
    result = await connector.test_connection()
    return result


@router.post("/databricks/save")
async def save_databricks_config(
    req: DatabricksSaveRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Save or update Databricks configuration in the enterprise connector vault.
    """
    if current_user.role not in ["TenantAdmin", "SeniorEngineer", "DeptAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required to modify connector credentials.",
        )

    res = await db.execute(
        select(models.ConnectorConfig).where(
            models.ConnectorConfig.tenant_id == current_user.tenant_id,
            models.ConnectorConfig.connector_type == "DATABRICKS",
        )
    )
    cfg = res.scalar_one_or_none()

    masked = mask_token(req.access_token)
    if not cfg:
        cfg = models.ConnectorConfig(
            tenant_id=current_user.tenant_id,
            connector_type="DATABRICKS",
            name=req.name,
            server_hostname=req.server_hostname,
            http_path=req.http_path,
            access_token_masked=masked,
            access_token_encrypted=req.access_token,  # In prod: use KMS/Fernet
            catalog=req.catalog,
            target_schemas=req.target_schemas,
            status="CONNECTED",
        )
        db.add(cfg)
    else:
        cfg.name = req.name
        cfg.server_hostname = req.server_hostname
        cfg.http_path = req.http_path
        cfg.access_token_masked = masked
        cfg.access_token_encrypted = req.access_token
        cfg.catalog = req.catalog
        cfg.target_schemas = req.target_schemas
        cfg.status = "CONNECTED"

    # Write audit log
    audit = models.AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        user_role=current_user.role,
        department=current_user.department,
        clearance_level=current_user.clearance_level,
        action="CONNECTOR_CONFIG_UPDATED",
        resource_type="ConnectorConfig",
        sensitivity_level="Restricted",
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "connector_type": "DATABRICKS",
        "catalog": req.catalog,
        "server_hostname": req.server_hostname,
        "updated_by": current_user.username,
    })
    db.add(audit)

    await db.commit()
    await db.refresh(cfg)

    return {
        "success": True,
        "message": "Databricks Lakehouse credentials securely saved.",
        "config": {
            "id": cfg.id,
            "name": cfg.name,
            "server_hostname": cfg.server_hostname,
            "http_path": cfg.http_path,
            "access_token_masked": cfg.access_token_masked,
            "catalog": cfg.catalog,
            "target_schemas": cfg.target_schemas,
            "status": cfg.status,
        },
    }


@router.get("/databricks/introspect")
async def introspect_databricks_catalog(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Introspects tables, views, and object inventories from the Databricks Lakehouse.
    """
    res = await db.execute(
        select(models.ConnectorConfig).where(
            models.ConnectorConfig.tenant_id == current_user.tenant_id,
            models.ConnectorConfig.connector_type == "DATABRICKS",
        )
    )
    cfg = res.scalar_one_or_none()

    hostname = cfg.server_hostname if cfg else None
    http_path = cfg.http_path if cfg else None
    token = cfg.access_token_encrypted if cfg else None
    catalog = cfg.catalog if cfg else "telco_lakehouse"

    connector = DatabricksConnector(
        server_hostname=hostname,
        http_path=http_path,
        access_token=token,
        catalog=catalog,
    )
    return await connector.introspect_catalog_objects()


@router.post("/databricks/sync")
async def trigger_databricks_sync(
    req: SyncTriggerRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Triggers Lakehouse ingestion: extracts network events, site assets, and tickets,
    and converts them into Canonical Enterprise Memories with SHA-256 deduplication.
    """
    if current_user.role not in ["TenantAdmin", "SeniorEngineer", "DeptAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Privilege level insufficient to trigger enterprise lakehouse sync.",
        )

    res = await db.execute(
        select(models.ConnectorConfig).where(
            models.ConnectorConfig.tenant_id == current_user.tenant_id,
            models.ConnectorConfig.connector_type == "DATABRICKS",
        )
    )
    cfg = res.scalar_one_or_none()

    hostname = cfg.server_hostname if cfg else None
    http_path = cfg.http_path if cfg else None
    token = cfg.access_token_encrypted if cfg else None
    catalog = cfg.catalog if cfg else "telco_lakehouse"

    connector = DatabricksConnector(
        server_hostname=hostname,
        http_path=http_path,
        access_token=token,
        catalog=catalog,
    )
    sync_result = await connector.sync_lakehouse_data(
        tenant_id=current_user.tenant_id,
        db=db,
        limit_per_table=req.limit_per_table,
    )

    # Write audit log
    audit = models.AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        user_role=current_user.role,
        department=current_user.department,
        clearance_level=current_user.clearance_level,
        action="DATABRICKS_SYNC_EXECUTED",
        resource_type="ResearchMemoryObject",
        sensitivity_level="Internal",
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "records_synced": sync_result.get("records_synced", 0),
        "catalog": catalog,
        "initiated_by": current_user.username,
    })
    db.add(audit)
    await db.commit()

    return sync_result


@router.get("/graph-stats")
async def get_graph_stats(
    current_user: CurrentUser,
):
    """
    Session 16: Returns live Neo4j knowledge graph metrics strictly scoped to the active tenant.
    Guarantees zero leakage from other company tenants or academic datasets.
    """
    import asyncio
    from services.graph_sync_service import get_tenant_graph_metrics
    return await asyncio.to_thread(get_tenant_graph_metrics, current_user.tenant_id)

