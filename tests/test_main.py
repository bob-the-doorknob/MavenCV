"""Placeholder tests — replace with real tests."""

import sheepathon
from sheepathon.main import main


def test_version_is_defined() -> None:
    assert sheepathon.__version__ == "0.1.0"


def test_main_runs_without_args(capsys) -> None:
    exit_code = main([])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Sheepathon" in captured.out
