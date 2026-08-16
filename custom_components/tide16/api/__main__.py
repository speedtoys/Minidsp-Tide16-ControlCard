"""Talk to a Tide16 from a terminal, with no Home Assistant involved.

    cd custom_components/tide16
    python3 -m api 192.168.1.212           # dump state
    python3 -m api 192.168.1.212 --watch   # follow pushes

This exists to keep the protocol honest: if the integration and this disagree,
the bug is above the API layer.
"""

from __future__ import annotations

import asyncio
import json
import sys

from .client import Tide16Client, Tide16Error
from .const import REFRESH_ENDPOINTS, GET_RMS_DB


async def main(host: str, watch: bool) -> int:
    pushes: list[str] = []
    client = Tide16Client(
        host,
        on_notification=lambda name, payload: pushes.append(
            f"{name}: {json.dumps(payload)[:120]}"
        ),
    )
    await client.start()

    for _ in range(50):  # ~5s for the supervisor to land a connection
        if client.connected:
            break
        await asyncio.sleep(0.1)
    if not client.connected:
        print(f"no connection to {client.url}", file=sys.stderr)
        await client.stop()
        return 1

    try:
        for endpoint in (*REFRESH_ENDPOINTS, GET_RMS_DB):
            try:
                data = await client.request(endpoint)
            except Tide16Error as err:
                print(f"{endpoint:<28} !! {err}")
                continue
            rendered = json.dumps(data)
            if len(rendered) > 150:
                rendered = rendered[:147] + "..."
            print(f"{endpoint:<28} {rendered}")

        if watch:
            print("\nwatching for pushes, ctrl-c to stop\n", file=sys.stderr)
            seen = 0
            while True:
                await asyncio.sleep(0.5)
                while seen < len(pushes):
                    print("  push  " + pushes[seen])
                    seen += 1
    finally:
        await client.stop()
    return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not args:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    try:
        raise SystemExit(asyncio.run(main(args[0], "--watch" in sys.argv)))
    except KeyboardInterrupt:
        raise SystemExit(0)
