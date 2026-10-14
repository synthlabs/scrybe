import pytest
from tests.support.python.inference import fixture_path, transcribe, use_gpu
pytestmark = pytest.mark.inference

CASES = [
    ("silence", True, None, []),
    ("hum_and_room_noise", True, None, []),
    ("steady_tone", True, None, []),
    ("click_bursts", True, None, []),
    ("speech_with_ambient_tail", False, "validates local captions", []),
    ("public_dima_clip", False, None, ["subtitles by dima", "субтитры сделал dimatorzok",
                                      "субтитры создавал dimatorzok", "продолжение следует"]),
]

@pytest.mark.parametrize("name,expected_empty,expected_contains,forbidden", CASES)
def test_hallucination_protection(artifacts, whisper_model, vad_model, name, expected_empty, expected_contains, forbidden):
    report = transcribe(artifacts, whisper_model, fixture_path("dima_clip" if name == "public_dima_clip" else name),
                        [*(["--gpu"] if use_gpu() else []), "--vad-model", vad_model, "--protection",
                         "--vad-sensitivity", "balanced", "--incremental-step-ms", "500"])
    normalized = report["validation"]["normalized_text"]
    if expected_empty:
        assert normalized == "", f"{name}: expected no displayed text, got {normalized}"
    if expected_contains:
        assert expected_contains in normalized, f"{name}: expected displayed text to contain {expected_contains}, got {normalized}"
    for phrase in forbidden:
        assert phrase not in normalized, f"{name}: displayed forbidden phrase {phrase}"
