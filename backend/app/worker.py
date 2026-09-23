"""Standalone background worker: `uv run python -m app.worker`"""

import asyncio

from app.core.config import settings
from app.services.job_service import worker_loop


def main() -> None:
    try:
        asyncio.run(worker_loop())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
