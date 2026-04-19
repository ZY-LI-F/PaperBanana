"""Deprecated entry point for the legacy Gradio surface."""

from __future__ import annotations

import os
import sys

LEGACY_OPT_IN_ENV = "PAPERBANANA_ENABLE_LEGACY_GRADIO"
DEPRECATION_BANNER = f"""
[PaperBanana] `app.py` is deprecated.
Run the web app with:
  uvicorn server.main:app --reload
  pnpm --dir web dev

To launch the legacy Gradio UI for one release cycle, opt in explicitly:
  set {LEGACY_OPT_IN_ENV}=1 && python -m legacy.app_gradio
""".strip()


def build_app():
    from legacy.app_gradio import build_app as legacy_build_app

    return legacy_build_app()


def launch_app():
    from legacy.app_gradio import launch_app as legacy_launch_app

    return legacy_launch_app()


def main() -> int:
    print(DEPRECATION_BANNER, file=sys.stderr)
    if os.getenv(LEGACY_OPT_IN_ENV) != "1":
        return 0
    launch_app()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
