"""验证码工具：4 位数字；渲染 PNG 需要 Pillow（可选依赖）。"""

import random
import string


def generate_code(length: int = 4) -> str:
    return "".join(random.choices(string.digits, k=length))


def render_png() -> str:
    """返回 data:image/png;base64,... ；未安装 Pillow 时抛出可读错误。"""
    try:
        import io

        from PIL import Image, ImageDraw
    except ImportError as exc:  # pragma: no cover - 可选依赖
        raise RuntimeError("验证码功能需要安装 Pillow：uv sync --group dev 或 uv add pillow") from exc

    code = generate_code()
    width, height = 120, 40
    image = Image.new("RGB", (width, height), (245, 246, 250))
    draw = ImageDraw.Draw(image)
    for i, char in enumerate(code):
        draw.text((12 + i * 26, 10), char, fill=(48, 60, 90))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    import base64

    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()
