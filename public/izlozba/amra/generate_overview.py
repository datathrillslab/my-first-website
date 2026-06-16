import csv, math
from PIL import Image, ImageDraw

RIJEKA = (14.4422, 45.3271)
BG      = (52, 62, 239)
ACCENT  = (227, 51, 255)
WHITE   = (255, 255, 255)
AXIS_A  = 115   # alpha ~0.45 * 255
FIT_PAD = 0.10
W, H    = 3840, 2160

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

# --- projection fit: fit to faculty averages + Rijeka (same as overview goTo) ---
fit_pts = [(f["lon"], f["lat"]) for f in faculties] + [RIJEKA]
fit_proj = [merc(lon, lat) for lon, lat in fit_pts]
xs = [p[0] for p in fit_proj]
ys = [p[1] for p in fit_proj]
x0, x1 = min(xs), max(xs)
y0, y1 = min(ys), max(ys)
cx, cy = (x0+x1)/2, (y0+y1)/2
dx, dy = x1-x0, y1-y0
k = min(W*(1-2*FIT_PAD)/dx, H*(1-2*FIT_PAD)/dy)

def to_px(lon, lat):
    mx, my = merc(lon, lat)
    return (W/2 + k*(mx - cx),
            H/2 - k*(my - cy))

# --- radius scale (sqrt, same as app.js) ---
max_mob = max(f["mob"] for f in faculties)
def fac_r(n):
    return max(10, math.sqrt(n / max_mob) * 24) * 3  # ×3 for 4K pixel density

# --- draw ---
img  = Image.new("RGBA", (W, H), BG + (255,))
over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(over)

# axes through Rijeka
ax, ay = to_px(*RIJEKA)
draw.line([(0, ay), (W, ay)], fill=WHITE + (AXIS_A,), width=3)
draw.line([(ax, 0), (ax, H)], fill=WHITE + (AXIS_A,), width=3)

# faculty circles
for f in faculties:
    sx, sy = to_px(f["lon"], f["lat"])
    r = fac_r(f["mob"])
    draw.ellipse([sx-r, sy-r, sx+r, sy+r],
                 fill=ACCENT + (255,),
                 outline=WHITE + (230,),
                 width=3)

# Rijeka origin dot
r0 = 12
draw.ellipse([ax-r0, ay-r0, ax+r0, ay+r0],
             fill=WHITE + (255,),
             outline=WHITE + (100,),
             width=8)

img = Image.alpha_composite(img, over).convert("RGB")
img.save("erasmus_overview.jpg", "JPEG", quality=95)
print("Saved erasmus_overview.jpg")
