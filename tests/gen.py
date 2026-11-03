from uuid import uuid4

from src.memory import chat, clear_chat_history

if __name__ == "__main__":
    session_id = uuid4()
    persona = "jack-sparrow"
    try:
        print(chat(session_id, persona, "jack aaj kal koi khajana dhund raha ho kya?"))
        print(chat(session_id, persona, "Maine abhi kya poocha tha?"))
    finally:
        clear_chat_history(session_id, persona)