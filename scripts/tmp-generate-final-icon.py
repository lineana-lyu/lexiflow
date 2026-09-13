from pathlib import Path
from PIL import Image
import hashlib

root=Path(__file__).resolve().parents[1]
png=root/'public/icon.png'
ico=root/'build/icon.ico'
expected='b817542e670af2a86de7a95f94f993a262b8650c175b0a0ca136e93ee18af155'
raw=png.read_bytes()
actual=hashlib.sha256(raw).hexdigest()
if actual!=expected:
    raise SystemExit(f'public/icon.png hash mismatch: {actual}')
im=Image.open(png).convert('RGBA')
if im.size!=(256,256):
    raise SystemExit(f'unexpected icon size: {im.size}')
alpha=im.getchannel('A')
if alpha.getextrema()!=(0,255):
    raise SystemExit(f'icon alpha channel is not preserved: {alpha.getextrema()}')
ico.parent.mkdir(parents=True,exist_ok=True)
im.save(ico,format='ICO',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
check=Image.open(ico)
if check.size!=(256,256):
    raise SystemExit(f'ICO largest frame mismatch: {check.size}')
print('final icon generated from exact approved PNG')
print('png sha256',actual)
print('ico bytes',ico.stat().st_size)
