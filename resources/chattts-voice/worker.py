import json
import sys
import traceback
from pathlib import Path

import ChatTTS
import numpy as np
import torch
from scipy.io import wavfile

BASE_DIR = Path(__file__).resolve().parent
VOICE_FILE = BASE_DIR / "voice_candidate_3.json"
SAMPLE_RATE = 24000

voice = json.loads(VOICE_FILE.read_text(encoding="utf-8-sig"))
chat = ChatTTS.Chat()
if not chat.load(source="huggingface", compile=False):
    print(json.dumps({"type": "ready", "ok": False, "error": "ChatTTS model failed to load"}), flush=True)
    raise SystemExit(3)

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
seed = int(voice.get("seed", 31415))
print(json.dumps({"type": "ready", "ok": True, "voice": "candidate-3"}), flush=True)

for raw in sys.stdin:
    raw = raw.strip()
    if not raw:
        continue
    request_id = ""
    try:
        request = json.loads(raw)
        request_id = str(request.get("id", ""))
        text = str(request.get("text", "")).strip()
        output = Path(str(request.get("output", ""))).resolve()
        if not text or not str(output):
            raise ValueError("missing text/output")
        torch.manual_seed(seed)
        wavs = chat.infer([text], params_infer_code=params, params_refine_text=refine)
        wav = np.asarray(wavs[0], dtype=np.float32)
        wav = np.clip(wav, -1.0, 1.0)
        output.parent.mkdir(parents=True, exist_ok=True)
        wavfile.write(str(output), SAMPLE_RATE, (wav * 32767).astype(np.int16))
        print(json.dumps({"id": request_id, "ok": True, "output": str(output)}), flush=True)
    except Exception as exc:
        print(json.dumps({"id": request_id, "ok": False, "error": str(exc), "trace": traceback.format_exc(limit=2)}), flush=True)
