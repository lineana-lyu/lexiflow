import json
import sys
from pathlib import Path

import ChatTTS
import numpy as np
import torch
from scipy.io import wavfile

BASE_DIR = Path(__file__).resolve().parent
VOICE_FILE = BASE_DIR / "voice_candidate_3.json"
SAMPLE_RATE = 24000


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: synthesize.py <output.wav> <text>", file=sys.stderr)
        return 2
    output = Path(sys.argv[1]).resolve()
    text = " ".join(sys.argv[2:]).strip()
    if not text:
        print("empty text", file=sys.stderr)
        return 2
    voice = json.loads(VOICE_FILE.read_text(encoding="utf-8-sig"))
    chat = ChatTTS.Chat()
    if not chat.load(source="huggingface", compile=False):
        print("ChatTTS model failed to load", file=sys.stderr)
        return 3
    params = ChatTTS.Chat.InferCodeParams(
        spk_emb=voice["speaker_embedding"],
        temperature=0.3,
        top_P=0.7,
        top_K=20,
        prompt="[speed_5]",
        show_tqdm=False,
    )
    refine = ChatTTS.Chat.RefineTextParams(
        prompt="[oral_1][laugh_0][break_3]",
        show_tqdm=False,
    )
    torch.manual_seed(int(voice.get("seed", 31415)))
    wavs = chat.infer([text], params_infer_code=params, params_refine_text=refine)
    wav = np.asarray(wavs[0], dtype=np.float32)
    wav = np.clip(wav, -1.0, 1.0)
    output.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(output), SAMPLE_RATE, (wav * 32767).astype(np.int16))
    print(str(output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
