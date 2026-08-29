import asyncio
from pathlib import Path

import httpx
from sqlalchemy import delete

import models
from database import AsyncSessionLocal, engine
from image_utils import PROFILE_PICS_DIR
from main import app

POPULATE_IMAGES_DIR = Path("populate_images")

USERS = [
    {
        "username": "CoreyMSchafer",
        "email": "m@m.com",
        "password": "12345678",
        "image": "corey.png",
    },
    {
        "username": "DefaultDude",
        "email": "TestEmail2@test.com",
        "password": "TestPassword2!",
        # No image - uses default
    },
    {
        "username": "WillowTheCat",
        "email": "TestEmail3@test.com",
        "password": "TestPassword3!",
        "image": "willow.png",
    },
    {
        "username": "FarmDogs",
        "email": "TestEmail4@test.com",
        "password": "TestPassword4!",
        "image": "farmdogs.png",
    },
    {
        "username": "PoppyTheCoder",
        "email": "TestEmail5@test.com",
        "password": "TestPassword5!",
        "image": "poppy.png",
    },
    {
        "username": "GoodBoyBronx",
        "email": "TestEmail6@test.com",
        "password": "TestPassword6!",
        "image": "bronx.png",
    },
]


async def clear_existing_data() -> None:
    # Delete profile pictures from local storage
    if PROFILE_PICS_DIR.exists():
        for file in PROFILE_PICS_DIR.iterdir():
            if file.is_file() and file.name != ".gitkeep":
                file.unlink()
        print(f"Deleted profile pictures from {PROFILE_PICS_DIR}")

    # Ensure all tables exist before we try to delete from them. 
    # This fixes the "no such table: password_reset_tokens" error!
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    # Clear database tables (order respects foreign keys)
    async with AsyncSessionLocal() as db:
        await db.execute(delete(models.PasswordResetToken))

        await db.execute(delete(models.User))
        await db.commit()
    print("Cleared existing data")



async def populate() -> None:
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://localhost",
    ) as client:
        # Clear existing data (local images first, then database)
        await clear_existing_data()

        users: list[dict] = []

        print(f"\nCreating {len(USERS)} users...")
        for user_data in USERS:
            response = await client.post(
                "/api/users",
                json={
                    "username": user_data["username"],
                    "email": user_data["email"],
                    "password": user_data["password"],
                },
            )
            response.raise_for_status()
            user = response.json()
            print(f"  Created: {user['username']}")

            response = await client.post(
                "/api/users/token",
                data={
                    "username": user_data["email"],
                    "password": user_data["password"],
                },
            )
            response.raise_for_status()
            token = response.json()["access_token"]

            if image_name := user_data.get("image"):
                image_path = POPULATE_IMAGES_DIR / image_name
                if image_path.exists():
                    response = await client.patch(
                        f"/api/users/{user['id']}/picture",
                        files={
                            "file": (
                                image_name,
                                image_path.read_bytes(),
                                "image/png",
                            ),
                        },
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    response.raise_for_status()
                    print(f"    Uploaded: {image_name}")

            users.append(
                {"id": user["id"], "username": user["username"], "token": token},
            )


    await engine.dispose()

    print("\nDone!")
    print(f"  {len(USERS)} users")

    print("  Profile pictures saved locally")


if __name__ == "__main__":
    import sys
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    asyncio.run(populate())