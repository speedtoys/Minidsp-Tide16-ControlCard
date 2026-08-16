"""Standalone WebSocket client for the miniDSP Tide16.

Importable without Home Assistant - see client.py.
"""

from .client import Tide16Client, Tide16Error

__all__ = ["Tide16Client", "Tide16Error"]
