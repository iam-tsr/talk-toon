from .amrish_puri import SYSTEM_PROMPT as amrish_puri_prompt
from .deadpool import SYSTEM_PROMPT as deadpool_prompt
from .doraemon import SYSTEM_PROMPT as doraemon_prompt
from .jack import SYSTEM_PROMPT as jack_prompt
from .jack_sparrow import SYSTEM_PROMPT as jack_sparrow_prompt
from .little_krishna import SYSTEM_PROMPT as little_krishna_prompt
from .nobita import SYSTEM_PROMPT as nobita_prompt
from .optimus_prime import SYSTEM_PROMPT as optimus_prime_prompt
from .patlu import SYSTEM_PROMPT as patlu_prompt
from .shinchan import SYSTEM_PROMPT as shinchan_prompt


__all__ = [
    "amrish_puri_prompt",
    "deadpool_prompt",
    "doraemon_prompt",
    "jack_prompt",
    "jack_sparrow_prompt",
    "little_krishna_prompt",
    "nobita_prompt",
    "optimus_prime_prompt",
    "patlu_prompt",
    "shinchan_prompt"
]


PERSONAS = {
    name.removesuffix("_prompt").replace("_", "-"): globals()[name]
    for name in __all__
}