"""导出 OpenAPI 契约：uv run python scripts/export_openapi.py [target.json]"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import create_settings  # noqa: E402
from app.main import create_app  # noqa: E402


def main() -> None:
    import os

    os.environ.setdefault("LIN_SECRET_KEY", "export-only")
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "../contracts/openapi.json")
    settings = create_settings()
    settings.secret_key = os.environ["LIN_SECRET_KEY"]
    app = create_app(settings)
    spec = app.openapi()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"openapi written to {target}")


if __name__ == "__main__":
    main()
