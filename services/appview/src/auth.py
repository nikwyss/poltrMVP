import secrets
import json
import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
import src.db as db
from src.email_service import email_service


class SendMagicLinkRequest(BaseModel):
    email: EmailStr


class VerifyMagicLinkRequest(BaseModel):
    token: str


async def send_magic_link_handler(request: SendMagicLinkRequest):
    """Generate and send magic link to user's email"""
    try:
        if db.pool is None:
            print("Pool is None, initializing now...")
            await db.init_pool()
            print("Pool initialized successfully")

        email = request.email.lower()

        # Generate secure random token
        token = secrets.token_urlsafe(32)

        # Set expiration to 15 minutes from now
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        # Store token in database
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO magic_links (email, token, expires_at)
                VALUES ($1, $2, $3)
                """,
                email,
                token,
                expires_at,
            )

        # Send email
        success = email_service.send_magic_link(email, token)

        if not success:
            return JSONResponse(
                status_code=500,
                content={"error": "email_failed", "message": "Failed to send email"},
            )

        return JSONResponse(
            status_code=200,
            content={"success": True, "message": "Magic link sent to your email"},
        )

    except Exception as e:
        print(f"Send magic link error: {e}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "message": str(e)}
        )


async def verify_magic_link_handler(request: VerifyMagicLinkRequest):
    """Verify magic link token and create session"""
    try:
        if db.pool is None:
            print("Pool is None, initializing now...")
            await db.init_pool()
            print("Pool initialized successfully")

        token = request.token
        print(f"Verifying token: {token}")

        async with db.pool.acquire() as conn:
            # Find token
            row = await conn.fetchrow(
                """
                SELECT id, email, expires_at, used
                FROM magic_links
                WHERE token = $1
                """,
                token,
            )

            print(f"Database lookup result: {row}")

            if not row:
                print(f"Token not found in database: {token}")
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "invalid_token",
                        "message": "Invalid or expired token",
                    },
                )

            # Check if already used
            if row["used"]:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "token_used",
                        "message": "This link has already been used",
                    },
                )

            # Check if expired
            if datetime.utcnow() > row["expires_at"]:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "token_expired",
                        "message": "This link has expired",
                    },
                )

            # Mark token as used
            await conn.execute(
                """
                UPDATE magic_links
                SET used = TRUE
                WHERE id = $1
                """,
                row["id"],
            )

            # Generate secure session token
            session_token = secrets.token_urlsafe(48)

            # Session expires in 7 days
            session_expires = datetime.utcnow() + timedelta(days=7)

            # Store session in database
            user_data = {
                "email": row["email"],
                "handle": row["email"].split("@")[0],
                "displayName": row["email"].split("@")[0],
            }

            await conn.execute(
                """
                INSERT INTO sessions (session_token, email, user_data, expires_at)
                VALUES ($1, $2, $3, $4)
                """,
                session_token,
                row["email"],
                json.dumps(user_data),
                session_expires,
            )

            # Return response with httpOnly cookie
            response = JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "user": user_data,
                    "session_token": session_token,  # Also return in body for localStorage fallback
                    "expires_at": session_expires.isoformat(),
                },
            )

            # Set secure httpOnly cookie
            is_production = os.getenv("ENVIRONMENT", "development") == "production"
            response.set_cookie(
                key="session_token",
                value=session_token,
                httponly=True,
                secure=is_production,  # Only send over HTTPS in production
                samesite="lax",
                max_age=7 * 24 * 60 * 60,  # 7 days in seconds
                path="/",
            )

            return response

    except Exception as e:
        print(f"Verify magic link error: {e}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "message": str(e)}
        )
