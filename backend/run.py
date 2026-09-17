"""Dev entrypoint: sets the Windows selector event loop policy BEFORE uvicorn
creates its loop, then runs the app.

Why: uvicorn's `asyncio.run()` creates a ProactorEventLoop on Windows *before*
importing the app, so a policy set inside app.main is too late. The Proactor
loop kills the whole server when a client aborts a connection (WinError 10054
in _call_connection_lost / WinError 64 in accept_coro). The selector loop
handles aborted connections without dying.

Launch with: uv run python run.py  (not `uvicorn app.main:app`)
"""

import asyncio
import sys

if sys.platform == "win32":
    from asyncio import WindowsProactorEventLoopPolicy, WindowsSelectorEventLoopPolicy

    if type(asyncio.get_event_loop_policy()) is WindowsProactorEventLoopPolicy:
        asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())

import uvicorn 
 

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
