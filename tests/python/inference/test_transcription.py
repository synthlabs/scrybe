import pytest
from tests.support.python.inference import transcribe
from tests.support.python.processes import ROOT
pytestmark = pytest.mark.inference

@pytest.mark.parametrize("name", ["basic_en_short"])
def test_transcription_matches_authored_golden(artifacts, whisper_model, name):
    report = transcribe(artifacts, whisper_model, ROOT / f"fixtures/transcription/{name}.wav",
                        ["--expected", ROOT / f"fixtures/transcription/{name}.expected.json"])
    assert report["comparison"]["passed"], report["comparison"]
