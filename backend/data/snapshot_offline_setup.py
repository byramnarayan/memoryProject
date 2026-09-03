import os
import sys
import shutil
import datetime
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("offline_snapshot")

backend_dir = Path(__file__).resolve().parent.parent
snapshots_dir = backend_dir / "snapshots"
snapshots_dir.mkdir(exist_ok=True)

timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
snapshot_folder = snapshots_dir / f"offline_snapshot_{timestamp}"
snapshot_folder.mkdir(exist_ok=True)

def create_offline_snapshot():
    logger.info("=========================================================")
    logger.info(f"Creating Offline Setup Snapshot in {snapshot_folder}...")
    logger.info("=========================================================")

    env_path = backend_dir / ".env"
    if env_path.exists():
        shutil.copy(env_path, snapshot_folder / ".env.offline.backup")
        logger.info("✅ Saved backup of backend/.env")

    dataset_path = backend_dir / "data" / "unified_gacm_dataset.json"
    if dataset_path.exists():
        shutil.copy(dataset_path, snapshot_folder / "unified_gacm_dataset.json")
        logger.info("✅ Saved backup of master dataset JSON")

    meta_path = snapshot_folder / "SNAPSHOT_METADATA.txt"
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write(f"Offline Setup Snapshot\n")
        f.write(f"Created At: {datetime.datetime.now().isoformat()}\n")
        f.write(f"Branch: main\n")
        f.write(f"Description: Full offline local database & environment backup before cloud deployment.\n")

    logger.info(f"🎉 Offline Snapshot successfully created at: {snapshot_folder}")

if __name__ == "__main__":
    create_offline_snapshot()
