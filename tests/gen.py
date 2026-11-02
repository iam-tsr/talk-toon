from src.gen import reasoning
from src.persona import jack_sparrow_prompt

if __name__ == "__main__":
    prompt = jack_sparrow_prompt
    question = "jack aaj kal koi khajana dhund raha ho kya?"
    answer = reasoning(prompt, question)
    print(answer)