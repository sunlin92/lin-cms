"""存活探针：供容器编排与监控轮询，不进入鉴权与限流。"""

from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


def _app_version() -> str:
    try:
        return version("lin-cms-fastapi")
    except PackageNotFoundError:
        return "0.1.0"


@router.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "version": _app_version()})
