"""Placeholder entry point for the Sheepathon project."""

from __future__ import annotations

import argparse
import sys

from sheepathon import __version__


def main(argv: list[str] | None = None) -> int:
    """Placeholder CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="sheepathon",
        description="TODO: replace with a real description.",
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )
    parser.parse_args(argv)

    # TODO: replace with real application logic.
    print(f"Sheepathon v{__version__} — placeholder entry point.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
