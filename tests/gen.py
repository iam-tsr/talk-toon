from src.gen import reasoning
from src.persona import doremon_prompt

if __name__ == "__main__":
    prompt = doremon_prompt
    question = "doremon, kya tum mujhe time travel ke liye koi gadget de sakte ho?"
    answer = reasoning(prompt, question)
    print(answer)