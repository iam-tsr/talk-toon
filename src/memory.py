from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, convert_to_openai_messages
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.mongodb import MongoDBSaver
from langgraph.graph import END, START, MessagesState, StateGraph

from .config import mongodb_settings
from .gen import reasoning
from .persona import PERSONAS


def call_model(state: MessagesState, config: RunnableConfig) -> dict:
    persona = config["configurable"]["persona"]
    messages = convert_to_openai_messages([
        SystemMessage(content=PERSONAS[persona]),
        *state["messages"],
    ])
    reply = reasoning(messages)
    if not reply or not reply.strip():
        raise RuntimeError("Text generation returned no reply.")
    return {"messages": [AIMessage(content=reply)]}


builder = StateGraph(MessagesState)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)


def _thread_config(thread_id: UUID, persona: str) -> RunnableConfig:
    if persona not in PERSONAS:
        raise ValueError(f"Unknown persona: {persona}")
    return {"configurable": {"thread_id": f"{thread_id}:{persona}", "persona": persona}}


def chat(thread_id: UUID, persona: str, message: str) -> str:
    """Reply using the browser session's persistent, persona-specific history."""
    if not message or not message.strip():
        raise ValueError("chat message must be non-empty")

    config = _thread_config(thread_id, persona)
    with MongoDBSaver.from_conn_string(mongodb_settings.uri, mongodb_settings.database) as checkpointer:
        graph = builder.compile(checkpointer=checkpointer)
        result = graph.invoke({"messages": [HumanMessage(content=message)]}, config)

    return result["messages"][-1].content


def get_chat_history(thread_id: UUID, persona: str) -> list[dict[str, str]]:
    """Return one session/persona thread's messages, oldest first."""
    config = _thread_config(thread_id, persona)
    with MongoDBSaver.from_conn_string(mongodb_settings.uri, mongodb_settings.database) as checkpointer:
        graph = builder.compile(checkpointer=checkpointer)
        snapshot = graph.get_state(config)

    messages = snapshot.values.get("messages", [])
    return [{type(m).__name__: m.content} for m in messages]


def clear_chat_history(thread_id: UUID, persona: str) -> None:
    """Delete one session/persona thread's stored checkpoints."""
    config = _thread_config(thread_id, persona)
    with MongoDBSaver.from_conn_string(mongodb_settings.uri, mongodb_settings.database) as checkpointer:
        checkpointer.delete_thread(config["configurable"]["thread_id"])