"""统一异常体系与响应信封。

契约（与旧 Flask 实现对齐）：
- 操作类接口返回信封 ``{message, code, request}``，``request`` 为 "METHOD  path"（两个空格）。
- 业务码独立于 HTTP 状态码；前端以 ``code < 9998`` 判定成功。
"""

from typing import Any

from fastapi import Request


class APIException(Exception):
    status_code: int = 500
    code: int = 9999
    message: str = "抱歉，服务器未知错误"

    def __init__(self, message: str | None = None, *, code: int | None = None) -> None:
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        super().__init__(self.message)

    def envelope(self, request_line: str) -> dict[str, Any]:
        return {"message": self.message, "code": self.code, "request": request_line}


def request_line_of(request: Request) -> str:
    return f"{request.method}  {request.url.path}"


def success_envelope(request: Request, *, code: int = 0, message: str = "成功") -> dict[str, Any]:
    return {"message": message, "code": code, "request": request_line_of(request)}


class Failed(APIException):
    status_code = 400
    code = 10200
    message = "失败"


class UnAuthentication(APIException):
    status_code = 401
    code = 10010
    message = "授权失败"


class NotFound(APIException):
    status_code = 404
    code = 10021
    message = "资源不存在"


class ParameterError(APIException):
    status_code = 400
    code = 10030
    message = "参数错误"


class TokenInvalid(APIException):
    status_code = 401
    code = 10041
    message = "access token 损坏"


class TokenExpired(APIException):
    status_code = 422
    code = 10051
    message = "access token 过期"


class RefreshFailed(APIException):
    status_code = 400
    code = 10052
    message = "令牌刷新失败"


class Duplicated(APIException):
    status_code = 400
    code = 10060
    message = "字段重复"


class Forbidden(APIException):
    status_code = 401
    code = 10070
    message = "禁止操作"


class RootGroupAddForbidden(Forbidden):
    code = 10073
    message = "root分组不可添加用户"


class GroupAssignInvalid(Forbidden):
    code = 10077
    message = "不可将用户分配给不存在的分组"


class RootUserGroupLocked(Forbidden):
    code = 10078
    message = "不可修改root用户的分组"


class FileTooLarge(APIException):
    status_code = 413
    code = 10110
    message = "文件体积过大"


class FileTooMany(APIException):
    status_code = 413
    code = 10120
    message = "文件数量过多"


class FileExtensionError(APIException):
    status_code = 401
    code = 10130
    message = "文件扩展名不符合规范"


class RequestLimit(APIException):
    status_code = 429
    code = 10140
    message = "请求过于频繁，请稍后重试"


class RouteNotFound(APIException):
    status_code = 404
    code = 10025
    message = "找不到相应的视图处理器"


class MethodNotAllowed(APIException):
    status_code = 405
    code = 10080
    message = "请求方法不允许"


# ---------------- Agent 接入错误码段 10300-10399（docs/04 §5/§6，docs/05 Task 1）----------------


class AgentTokenInvalid(APIException):
    status_code = 401
    code = 10300
    message = "Agent Token 无效"


class AgentTokenExpired(APIException):
    status_code = 401
    code = 10301
    message = "Agent Token 已过期"


class AgentTokenRevoked(APIException):
    status_code = 401
    code = 10302
    message = "Agent Token 已吊销"


class ContentForbidden(APIException):
    status_code = 403
    code = 10310
    message = "无权执行该内容操作"


class ContentTypeArchived(APIException):
    status_code = 403
    code = 10311
    message = "内容模型已归档，禁止写入"


class ContentTypeNotFound(APIException):
    status_code = 404
    code = 10320
    message = "内容模型不存在"


class ContentRecordNotFound(APIException):
    status_code = 404
    code = 10321
    message = "内容记录不存在"


class ContentSchemaInvalid(APIException):
    status_code = 400
    code = 10330
    message = "内容模型字段定义不合法"


class ContentDataInvalid(APIException):
    status_code = 400
    code = 10331
    message = "内容数据不符合模型字段定义"


class ContentSchemaBreaking(APIException):
    status_code = 400
    code = 10332
    message = "模型变更会令已有记录失效，已拒绝"


class AgentTokenLimitReached(APIException):
    status_code = 400
    code = 10340
    message = "有效 Agent Token 数量已达上限，请先吊销旧凭证"


class AgentTokenScopeInvalid(APIException):
    status_code = 400
    code = 10341
    message = "Token 范围超出当前用户被授予的内容能力"


class ContentPayloadTooLarge(APIException):
    status_code = 413
    code = 10350
    message = "内容记录体积超过上限"


class InternalServerError(APIException):
    status_code = 500
    code = 9999
    message = "服务器未知错误"


# 图书业务成功码（与旧 MESSAGE 表一致）
BOOK_CREATED = 12
BOOK_UPDATED = 13
BOOK_DELETED = 14
