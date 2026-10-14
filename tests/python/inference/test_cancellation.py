import pytest
from tests.support.python.processes import ProcessOwner
pytestmark = pytest.mark.inference

def test_native_whisper_cancellation(artifacts, whisper_model):
    with ProcessOwner(artifacts) as owner:
        result = owner.run(["cargo", "test", "--locked", "-p", "scrybe_core", "--features", "whisper-runtime", "--lib",
                           "whisper::cancellation_tests::native_inference_stops_after_cancellation",
                           "--", "--ignored", "--exact", "--nocapture"],
                          environment={**owner.environment, "SCRYBE_TEST_MODEL": whisper_model}, timeout=180)
        (artifacts / "test.log").write_text(result.stdout + result.stderr)
