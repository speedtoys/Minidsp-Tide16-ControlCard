#!/usr/bin/env python3
"""Read or set the Tide16's Dolby profile over its own websocket API.

The miniDSP Tide16 exposes the profile on ws://<host>:5555 - read it from
`get_settings` -> data.dolby.profile, write it with set_dolby_profile.
@GaelFrance's integration speaks neither endpoint (its surface is volume,
mute, source, scene, preset, dirac, shutdown, reboot, bt-pairing), so
this stands in until an additive patch adds a real sensor and service.

Used from configuration.yaml as a `command_line` sensor (read) and a
`shell_command` (set).  Runs INSIDE the HA container, which supplies
aiohttp - deliberately not `websockets`, which is not installed there.

    tide16_dolby.py read          -> prints e.g. "movie", or "unknown"
    tide16_dolby.py set movie     -> exit 0 on success

A second connection alongside the integration's own is fine; the device
accepts concurrent clients (verified while the integration was live).
Prints "unknown" rather than failing when the unit is off, so the sensor
degrades to a placeholder instead of going unavailable.
"""

import asyncio
import json
import sys

HOST = "192.168.1.212"
PORT = 5555
TIMEOUT = 8

# What the firmware actually accepts. game/dynamic/voice/personalize and
# custom-a..d appear in the device's own web UI but are commented out
# there, so they are not selectable on this hardware.
VALID = ("off", "movie", "music", "night")


async def _talk(request, want_req):
    import aiohttp

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect("ws://%s:%d" % (HOST, PORT), timeout=TIMEOUT) as ws:
            await ws.send_str(json.dumps(request))
            loop = asyncio.get_event_loop()
            deadline = loop.time() + TIMEOUT
            while loop.time() < deadline:
                msg = await asyncio.wait_for(ws.receive(), timeout=TIMEOUT)
                if msg.type is not aiohttp.WSMsgType.TEXT:
                    continue
                try:
                    obj = json.loads(msg.data)
                except ValueError:
                    continue
                # the device greets with {"val":"Hi from coordinator"} and
                # pushes unsolicited updates, so match the reply we asked for
                if obj.get("req") == want_req:
                    return obj
    return None


async def read():
    obj = await _talk({"endpoint": "get_settings"}, "get_settings")
    if not obj:
        return "unknown"
    profile = ((obj.get("data") or {}).get("dolby") or {}).get("profile")
    return profile if profile else "unknown"


async def write(profile):
    await _talk({"endpoint": "set_dolby_profile", "profile": profile}, "set_dolby_profile")
    # The device does not reliably echo a reply for setters, so confirm by
    # reading the value back rather than trusting the send.
    return await read() == profile


def main():
    args = sys.argv[1:]
    if not args:
        print("unknown")
        return 2

    if args[0] == "read":
        try:
            print(asyncio.run(read()))
        except Exception:
            # unit off / network gone - the sensor shows a placeholder
            print("unknown")
        return 0

    if args[0] == "set" and len(args) > 1:
        profile = args[1].strip().lower()
        if profile not in VALID:
            print("invalid profile %r; expected one of %s" % (profile, VALID), file=sys.stderr)
            return 2
        try:
            ok = asyncio.run(write(profile))
        except Exception as err:
            print("set failed: %s" % err, file=sys.stderr)
            return 1
        return 0 if ok else 1

    print("usage: tide16_dolby.py read | set <off|movie|music|night>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
