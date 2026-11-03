import unittest
from contextlib import nullcontext
from uuid import uuid4
from unittest.mock import patch

from langgraph.checkpoint.memory import InMemorySaver

from src.memory import chat, clear_chat_history, get_chat_history


class ConversationMemoryTests(unittest.TestCase):
    def test_history_survives_turns_and_is_isolated_by_session_and_persona(self):
        first, second = uuid4(), uuid4()
        saver = InMemorySaver()
        with (
            patch("src.memory.MongoDBSaver.from_conn_string", side_effect=lambda *args: nullcontext(saver)),
            patch("src.memory.reasoning", side_effect=["पहला जवाब", "दूसरा जवाब", "दूसरे दोस्त का जवाब", "दूसरे किरदार का जवाब"]),
        ):
            chat(first, "nobita", "मेरा नाम आरव है।")
            chat(first, "nobita", "मेरा नाम याद है?")
            chat(second, "nobita", "मेरा नाम मीरा है।")
            chat(first, "shinchan", "मैं खेलने आया हूँ।")

            first_history = [
                {"HumanMessage": "मेरा नाम आरव है।"},
                {"AIMessage": "पहला जवाब"},
                {"HumanMessage": "मेरा नाम याद है?"},
                {"AIMessage": "दूसरा जवाब"},
            ]
            self.assertEqual(get_chat_history(first, "nobita"), first_history)
            self.assertEqual(get_chat_history(second, "nobita"), [
                {"HumanMessage": "मेरा नाम मीरा है।"},
                {"AIMessage": "दूसरे दोस्त का जवाब"},
            ])
            self.assertEqual(get_chat_history(first, "shinchan"), [
                {"HumanMessage": "मैं खेलने आया हूँ।"},
                {"AIMessage": "दूसरे किरदार का जवाब"},
            ])

            clear_chat_history(first, "nobita")
            self.assertEqual(get_chat_history(first, "nobita"), [])
            self.assertEqual(get_chat_history(second, "nobita")[0], {"HumanMessage": "मेरा नाम मीरा है।"})
            self.assertEqual(get_chat_history(first, "shinchan")[0], {"HumanMessage": "मैं खेलने आया हूँ।"})

    def test_empty_model_reply_is_not_saved_as_an_assistant_message(self):
        session_id = uuid4()
        saver = InMemorySaver()
        with (
            patch("src.memory.MongoDBSaver.from_conn_string", side_effect=lambda *args: nullcontext(saver)),
            patch("src.memory.reasoning", return_value="  "),
        ):
            with self.assertRaises(RuntimeError):
                chat(session_id, "nobita", "नमस्ते")
            self.assertEqual(get_chat_history(session_id, "nobita"), [{"HumanMessage": "नमस्ते"}])


if __name__ == "__main__":
    unittest.main()
