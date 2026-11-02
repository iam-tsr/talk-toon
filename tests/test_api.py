import unittest
from unittest.mock import patch

import requests
from fastapi.testclient import TestClient
from sarvamai.core.api_error import ApiError

from src.main import app
from src.stt import transcribe


class AudioAPITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_unknown_persona_is_rejected(self):
        response = self.client.post(
            "/talk",
            files={"audio_file": ("sample.wav", b"audio", "audio/wav")},
            data={"persona": "../../not-a-persona"},
        )
        self.assertEqual(response.status_code, 422)

    def test_empty_transcript_does_not_generate_a_reply(self):
        with (
            patch("src.main.transcribe", return_value={"transcript": "  "}),
            patch("src.main.reasoning") as generate,
        ):
            response = self.client.post(
                "/talk", files={"audio_file": ("sample.wav", b"audio", "audio/wav")}
            )
        self.assertEqual(response.status_code, 422)
        generate.assert_not_called()

    def test_provider_failures_leave_server_healthy(self):
        for stage in ("transcribe", "reasoning", "clone_voice_tts"):
            with (
                self.subTest(stage=stage),
                patch("src.main.transcribe", wraps=transcribe) as stt,
                patch("src.main.reasoning", return_value="नमस्ते दोस्त") as generate,
                patch("requests.post", side_effect=requests.ConnectionError("secret provider response")),
            ):
                if stage != "transcribe":
                    stt.return_value = {"transcript": "नमस्ते"}
                if stage == "reasoning":
                    generate.side_effect = ApiError(status_code=503, body="secret provider response")
                response = self.client.post(
                    "/talk", files={"audio_file": ("sample.wav", b"audio", "audio/wav")}
                )
                self.assertEqual(response.status_code, 502)
                self.assertNotIn("secret provider response", response.text)
                self.assertEqual(self.client.get("/health").status_code, 200)

    def test_failed_transcription_removes_temporary_audio(self):
        paths = []

        def fail_transcription(path, **kwargs):
            self.assertEqual(path.read_bytes(), b"private audio")
            paths.append(path)
            raise RuntimeError("provider unavailable")

        with patch("src.main.transcribe", side_effect=fail_transcription):
            response = self.client.post(
                "/talk", files={"audio_file": ("sample.wav", b"private audio", "audio/wav")}
            )
        self.assertEqual(response.status_code, 502)
        self.assertFalse(paths[0].exists())


if __name__ == "__main__":
    unittest.main()
