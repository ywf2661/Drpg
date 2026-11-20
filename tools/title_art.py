# 첫 화면 그림: ChatGPT로 만든 원본(.superpowers/preview/prayerback.png, prayer.png)을 진짜 도트 크기로 줄이고 어둡게 한다.
# 배경은 1/3로 줄이고, 기도하는 자는 배경 높이의 46%가 되게 줄여 같은 도트 크기로 맞춘다. render/prayer.ts가 이 둘을 겹친다
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / '.superpowers/preview'
OUT = ROOT / 'src/assets/sprites'

bg = Image.open(SRC / 'prayerback.png').convert('RGB')
bg = bg.resize((bg.width // 3, bg.height // 3), Image.BOX)
bg = ImageEnhance.Brightness(bg).enhance(0.55)
bg.save(OUT / 'title_bg.png', optimize=True)

fg = Image.open(SRC / 'prayer.png').convert('RGBA')
fh = int(bg.height * 0.46)
fg = fg.resize((round(fg.width * fh / fg.height), fh), Image.BOX)
alpha = fg.getchannel('A').point(lambda v: 255 if v > 128 else 0)  # 도트 가장자리: 반투명 없이
fg = ImageEnhance.Brightness(fg.convert('RGB')).enhance(0.68)
fg.putalpha(alpha)
fg.save(OUT / 'title_prayer.png', optimize=True)
print(bg.size, fg.size)
