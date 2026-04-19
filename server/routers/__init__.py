from server.routers.battle import router as battle_router
from server.routers.history import router as history_router
from server.routers.logs import router as logs_router
from server.routers.refine import router as refine_router
from server.routers.runs import router as runs_router
from server.routers.settings import router as settings_router

__all__ = [
    "battle_router",
    "history_router",
    "logs_router",
    "refine_router",
    "runs_router",
    "settings_router",
]
