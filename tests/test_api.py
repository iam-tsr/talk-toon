import unittest
from uuid import uuid4
from unittest.mock import patch

import requests
from fastapi.testclient import TestClient
from openai import OpenAIError
from pymongo.errors import PyMongoError

from src.main import app
from src.stt import transcribe


class AudioAPITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.session_data = {"session_id": str(uuid4())}

    def test_unknown_persona_is_rejected(self):
        response = self.client.post(
            "/talk",
            files={"audio_file": ("sample.wav", b"audio", "audio/wav")},
            data={**self.session_data, "persona": "../../not-a-persona"},
        )
        self.assertEqual(response.status_code, 422)

    def test_missing_or_invalid_session_id_is_rejected_before_transcription(self):
        with patch("src.main.transcribe") as stt:
            for data in ({}, {"session_id": "not-a-uuid"}):
                with self.subTest(data=data):
                    response = self.client.post(
                        "/talk",
                        files={"audio_file": ("sample.wav", b"audio", "audio/wav")},
                        data=data,
                    )
                    self.assertEqual(response.status_code, 422)
            stt.assert_not_called()

    def test_empty_transcript_does_not_generate_a_reply(self):
        with (
            patch("src.main.transcribe", return_value={"transcript": "  "}),
            patch("src.main.chat") as generate,
        ):
            response = self.client.post(
                "/talk", files={"audio_file": ("sample.wav", b"audio", "audio/wav")},
                data=self.session_data,
            )
        self.assertEqual(response.status_code, 422)
        generate.assert_not_called()

    def test_provider_failures_leave_server_healthy(self):
        for stage in ("transcribe", "chat", "memory", "clone_voice_tts"):
            with (
                self.subTest(stage=stage),
                patch("src.main.transcribe", wraps=transcribe) as stt,
                patch("src.main.chat", return_value="नमस्ते दोस्त") as generate,
                patch("requests.post", side_effect=requests.ConnectionError("secret provider response")),
            ):
                if stage != "transcribe":
                    stt.return_value = {"transcript": "नमस्ते"}
                if stage == "chat":
                    generate.side_effect = OpenAIError("secret provider response")
                if stage == "memory":
                    generate.side_effect = PyMongoError("secret database response")
                response = self.client.post(
                    "/talk", files={"audio_file": ("sample.wav", b"audio", "audio/wav")},
                    data=self.session_data,
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
                "/talk", files={"audio_file": ("sample.wav", b"private audio", "audio/wav")},
                data=self.session_data,
            )
        self.assertEqual(response.status_code, 502)
        self.assertFalse(paths[0].exists())


if __name__ == "__main__":
    unittest.main()
