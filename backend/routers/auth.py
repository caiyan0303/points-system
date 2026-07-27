from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import User, AccountStatus, UserRole
from schemas import LoginRequest, TokenResponse, UserInfo
from auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 支持用户名、姓名或邮箱登录
    query = db.query(User).filter(
        or_(
            User.username == req.username,
            User.real_name == req.username,
            User.email == req.username,
        )
    )
    if req.role in {UserRole.ADMIN.value, UserRole.STUDENT.value}:
        query = query.filter(User.role == req.role)
    user = query.order_by(User.id.asc()).first()

    if not user:
        raise HTTPException(status_code=401, detail="账号不存在")
    if user.role == UserRole.ADMIN.value and not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="管理员账号或密码错误")

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
