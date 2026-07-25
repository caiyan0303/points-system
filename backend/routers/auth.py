from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import User, AccountStatus
from schemas import LoginRequest, TokenResponse, UserInfo
from auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 支持用户名、姓名或邮箱登录
    user = db.query(User).filter(
        or_(
            User.username == req.username,
            User.real_name == req.username,
            User.email == req.username,
        )
    ).first()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if user.account_status == AccountStatus.TERMINATED.value:
        raise HTTPException(status_code=403, detail="账号已被终止，请联系管理员")

    if user.is_active == 0:
        raise HTTPException(status_code=403, detail="账号已被禁用")

    token = create_access_token({"user_id": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role,
        real_name=user.real_name, user_id=user.id,
    )


@router.get("/me", response_model=UserInfo)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
