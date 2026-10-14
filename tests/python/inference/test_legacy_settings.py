import pytest
from tests.support.python.inference import transcribe
from tests.support.python.processes import ROOT, save
pytestmark = pytest.mark.inference

def test_obsolete_settings_and_detected_language(artifacts, whisper_model):
    params = save(artifacts / "legacy-params.json", {"language": "ru\u0000", "toggles": {"translate": True}})
    result = transcribe(artifacts, whisper_model, ROOT / "fixtures/transcription/basic_en_short.wav",
                        ["--params", params, "--expected", ROOT / "fixtures/transcription/basic_en_short.expected.json"])
    assert result["comparison"]["passed"], result["comparison"]
    assert result["items"] and all(item["detected_language"] == "en" for item in result["items"]), result["items"]
    assert "language" not in result["params"]
    assert "translate" not in result["params"]["toggles"]
