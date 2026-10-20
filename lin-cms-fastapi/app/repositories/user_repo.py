"""用户仓储：查询/创建/凭证/分组关联/非 Root 用户分页。"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, ParameterError
from app.core.security import password_hasher
from app.models import Group, User, UserGroup, UserIdentity


def get_by_id(db: Session, uid: int) -> User | None:
    return db.get(User, uid)


def get_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def create_user(db: Session, *, username: str, email: str | None = None) -> User:
    user = User(username=username, email=email or None)
    db.add(user)
    db.flush()
    return user


def set_password(db: Session, user: User, raw: str) -> None:
    """写入/更新凭证并将 token_version +1（旧令牌全部失效）。"""
    identity = db.scalar(select(UserIdentity).where(UserIdentity.user_id == user.id))
    credential = password_hasher.hash(raw)
    if identity is None:
        db.add(
            UserIdentity(
                user_id=user.id,
                identity_type="USERNAME_PASSWORD",
                identifier=user.username,
                credential=credential,
            )
        )
    else:
        identity.credential = credential
    user.token_version = (user.token_version or 0) + 1
    db.flush()


def credential_of(db: Session, user_id: int) -> str:
    identity = db.scalar(select(UserIdentity).where(UserIdentity.user_id == user_id))
    return identity.credential if identity else ""


def update_credential(db: Session, user_id: int, credential: str) -> None:
    identity = db.scalar(select(UserIdentity).where(UserIdentity.user_id == user_id))
    if identity is not None:
        identity.credential = credential
        db.flush()


def verify_login(db: Session, username: str, password: str) -> User:
    user = get_by_username(db, username)
    if user is None:
        raise NotFound("用户不存在")
    stored = credential_of(db, user.id)
    if not stored or not password_hasher.verify(password, stored):
        raise ParameterError("密码错误，请输入正确密码")
    if password_hasher.needs_upgrade(stored):
        update_credential(db, user.id, password_hasher.hash(password))
    return user


def groups_of(db: Session, user_id: int) -> list[Group]:
    stmt = (
        select(Group)
        .join(UserGroup, UserGroup.group_id == Group.id)
        .where(UserGroup.user_id == user_id, Group.deleted_token == 0)
    )
    return list(db.scalars(stmt))


def replace_user_groups(db: Session, user_id: int, group_ids: list[int]) -> None:
    db.query(UserGroup).filter(UserGroup.user_id == user_id).delete()
    for gid in group_ids:
        db.add(UserGroup(user_id=user_id, group_id=gid))
    db.flush()


def page_non_root_users(
    db: Session, *, count: int, offset: int, group_id: int | None
) -> tuple[int, list[tuple[User, list[Group]]]]:
    """分页返回非 Root 组用户及各自分组；返回 (total, [(user, groups)])。"""
    group_filter = [Group.deleted_token == 0, Group.level != 1]
    if group_id:
        group_filter.append(Group.id == group_id)

    user_ids_stmt = (
        select(UserGroup.user_id)
        .join(Group, Group.id == UserGroup.group_id)
        .where(*group_filter)
        .group_by(UserGroup.user_id)
    )
    total = db.scalar(select(func.count()).select_from(user_ids_stmt.subquery())) or 0

    page_ids = list(db.scalars(user_ids_stmt.order_by(UserGroup.user_id).offset(offset).limit(count)))
    if not page_ids:
        return total, []

    rows = db.execute(
        select(User, Group)
        .join(UserGroup, UserGroup.user_id == User.id)
        .join(Group, Group.id == UserGroup.group_id)
        .where(User.id.in_(page_ids), Group.deleted_token == 0, Group.level != 1)
        .order_by(User.id)
    ).all()

    groups_by_uid: dict[int, list[Group]] = {uid: [] for uid in page_ids}
    for user, group in rows:
        groups_by_uid[user.id].append(group)

    users_by_id = {u.id: u for u, _ in rows}
    ordered = [(users_by_id[uid], groups_by_uid[uid]) for uid in page_ids if uid in users_by_id]
    return total, ordered


def delete_user_cascade(db: Session, user: User) -> None:
    """硬删除用户并清理关联（分组关联 + 身份凭证）。"""
    db.query(UserGroup).filter(UserGroup.user_id == user.id).delete()
    db.query(UserIdentity).filter(UserIdentity.user_id == user.id).delete()
    db.delete(user)
    db.flush()
