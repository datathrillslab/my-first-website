import csv, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

RIJEKA  = (14.4422, 45.3271)
BG      = (52, 62, 239)
ACCENT  = (227, 51, 255)
WHITE   = (255, 255, 255)
AXIS_A  = 115
FIT_PAD = 0.12
SIZE    = 2160   # 1:1

def merc(lon, lat):
    return (math.radians(lon),
            math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))

# --- load & group ---
rows = []
with open("erasmus_staff_mobility_new.csv", newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        rows.append(r)

by_fac = {}
for r in rows:
    fac = r["faculty"].strip()
    by_fac.setdefault(fac, []).append(r)

faculties = []
for name, rs in by_fac.items():
    lats = [float(r["lat"]) for r in rs]
    lons = [float(r["lon"]) for r in rs]
    faculties.append(dict(
        name=name,
        lat=sum(lats)/len(lats),
        lon=sum(lons)/len(lons),
        mob=len(rs),
    ))

# --- center projection on Rijeka ---
rx, ry = merc(*RIJEKA)

fac_proj = [merc(f["lon"], f["lat"]) for f in faculties]
# fit to median distance so outer circles crop off and inner area fills the frame
dists = sorted(max(abs(p[0] - rx), abs(p[1] - ry)) for p in fac_proj)
fit_d = dists[int(len(dists) * 0.50)]   # 50th percentile = tight crop
k     = (SIZE / 2 * (1 - 2 * FIT_PAD)) / fit_d

def to_px(lon, lat):
    mx, my = merc(lon, lat)
    return (SIZE/2 + k*(mx - rx),
            SIZE/2 - k*(my - ry))

# --- radius scale — steeper power (0.38) → clearer size differences ---
max_mob = max(f["mob"] for f in faculties)
MAX_R   = SIZE * 0.10    # ~216px at 2160
MIN_R   = SIZE * 0.010   # ~22px  at 2160
def fac_r(n):
    return max(MIN_R, (n / max_mob) ** 0.38 * MAX_R)

# --- draw ---
ax, ay = to_px(*RIJEKA)

CIRCLE_ALPHA = 128   # 50% opacity; overlaps compound → overlap areas visibly deeper

# Background
canvas = Image.new("RGBA", (SIZE, SIZE), BG + (255,))

# Draw each circle individually so alpha compounds at overlaps (multiply-like effect)
for f in sorted(faculties, key=lambda f: f["mob"]):   # small first → big stays on top
    sx, sy = to_px(f["lon"], f["lat"])
    r = fac_r(f["mob"])
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([sx-r, sy-r, sx+r, sy+r], fill=ACCENT + (CIRCLE_ALPHA,))
    canvas = Image.alpha_composite(canvas, layer)

# Outlines + axes on top
over = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(over)

draw.line([(0, ay), (SIZE, ay)], fill=WHITE + (AXIS_A,), width=4)
draw.line([(ax, 0), (ax, SIZE)], fill=WHITE + (AXIS_A,), width=4)

for f in faculties:
    sx, sy = to_px(f["lon"], f["lat"])
    r = fac_r(f["mob"])
    draw.ellipse([sx-r, sy-r, sx+r, sy+r],
                 fill=None, outline=WHITE + (200,), width=4)

# Rijeka origin dot
r0 = int(SIZE * 0.006)
draw.ellipse([ax-r0, ay-r0, ax+r0, ay+r0],
             fill=WHITE + (255,),
             outline=WHITE + (80,),
             width=int(SIZE * 0.004))

img = Image.alpha_composite(canvas, over).convert("RGB")

# --- "Rijeka" label ---
font_path = "Degular Semibold.ttf"
font_size = int(SIZE * 0.032)  # ~69px at 2160
try:
    font = ImageFont.truetype(font_path, font_size)
except:
    font = ImageFont.load_default()

draw2 = ImageDraw.Draw(img)
lx, ly = ax + r0 + int(SIZE * 0.008), ay - font_size - int(SIZE * 0.004)

# stroke (outline)
for dx, dy in [(-2,0),(2,0),(0,-2),(0,2),(-2,-2),(2,-2),(-2,2),(2,2)]:
    draw2.text((lx+dx, ly+dy), "Rijeka", font=font, fill=BG)
draw2.text((lx, ly), "Rijeka", font=font, fill=WHITE)

img.save("erasmus_square.jpg", "JPEG", quality=95)
print("Saved erasmus_square.jpg")
