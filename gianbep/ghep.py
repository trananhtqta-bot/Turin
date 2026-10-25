"""MÁY GHÉP VIDEO — kênh Gian Bếp Của Mẹ.

Nhận job từ Apps Script (repository_dispatch "gianbep"). Mỗi job là 1 video gồm nhiều cảnh:
  { "text": "chữ trên màn hình (có thể 'Tiêu đề / dòng phụ')", "voice": "lời đọc",
    "clip_url": "link clip anh quay hoặc Veo trên Drive (có thể rỗng)",
    "keyword": "từ khóa tiếng Anh tìm cảnh Pexels (có thể rỗng)", "kind": "hook|body|end" }
Thứ tự lấy hình cho mỗi cảnh: clip trên Drive → cảnh Pexels → nền màu thương hiệu.
Giọng đọc: edge-tts (vi-VN-HoaiMyNeural) → gTTS → im lặng.
Xong thì gửi video về Apps Script (callback) và lưu bản sao làm artifact của Actions.
"""
import base64, hashlib, json, os, random, re, shutil, subprocess, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_B = os.environ.get("FONT_B", "fonts/BeVietnamPro-Bold.ttf")
FONT_S = os.environ.get("FONT_S", "fonts/BeVietnamPro-SemiBold.ttf")
WORK = os.environ.get("WORK", "work")
VOICE = os.environ.get("VOICE", "vi-VN-HoaiMyNeural")

# Màu thương hiệu (logo: chữ xanh lá + nâu)
XANH = (46, 125, 50)
NAU = (93, 64, 55)
KEM = (255, 248, 235)
TRANG = (255, 255, 255)


def log(*a):
    print(*a, flush=True)


def chay(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log("LỆNH LỖI:", " ".join(cmd)[:500])
        log(r.stderr[-2000:])
        raise RuntimeError("ffmpeg lỗi")
    return r.stdout


def tai(url, path, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
        shutil.copyfileobj(r, f)
    return path


def do_dai(path):
    out = chay(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path])
    try:
        return float(out.strip())
    except ValueError:
        return 0.0


def la_video(path):
    try:
        out = chay(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type",
                    "-of", "default=nw=1:nk=1", path])
        return "video" in out
    except RuntimeError:
        return False


# ---------------------------------------------------------------- giọng đọc
def doc(text, out_mp3):
    text = re.sub(r"\s+", " ", (text or "")).strip()
    if not text:
        return None
    try:
        chay(["edge-tts", "--voice", VOICE, "--rate", "+6%", "--text", text, "--write-media", out_mp3])
        if os.path.getsize(out_mp3) > 1000:
            return out_mp3
    except Exception as e:  # noqa
        log("edge-tts không được:", e)
    try:
        from gtts import gTTS
        gTTS(text, lang="vi").save(out_mp3)
        if os.path.getsize(out_mp3) > 1000:
            return out_mp3
    except Exception as e:  # noqa
        log("gTTS không được:", e)
    if os.environ.get("DUMMY_TTS"):  # chạy thử trên máy không có mạng: giả giọng bằng tiếng bíp đúng độ dài ước tính
        d = max(1.0, len(text) / 15)
        chay(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency=220:duration={d:.2f}",
              "-af", "volume=0.05", out_mp3])
        return out_mp3
    return None


# ---------------------------------------------------------------- chữ
def xuong_dong(draw, text, font, max_w):
    out = []
    for doan in text.split("\n"):
        cur = ""
        for w in doan.split():
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=font) <= max_w:
                cur = t
            else:
                if cur:
                    out.append(cur)
                cur = w
        if cur:
            out.append(cur)
    return out


EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D]")


def tach_chu(text):
    text = EMOJI.sub("", text or "")
    parts = [p.strip() for p in re.split(r"\s+/\s+", text or "") if p.strip()]
    return (parts[0], parts[1:]) if parts else ("", [])


def anh_chu(text, kind, path, logo=None):
    """Vẽ lớp chữ trong suốt 1080x1920 (đặt ở 1/3 trên, tránh nút TikTok ở dưới & bên phải)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tieu_de, phu = tach_chu(text)
    if logo:
        dan_logo(im, logo, 120, (40, 70))
        f = ImageFont.truetype(FONT_S, 34)
        d.text((176, 112), "Gian Bếp Của Mẹ", font=f, fill=TRANG, stroke_width=3, stroke_fill=(0, 0, 0, 160))
    if not tieu_de:
        im.save(path)
        return path
    max_w = 900
    size_t = 92 if kind == "hook" else 74
    while True:
        ft = ImageFont.truetype(FONT_B, size_t)
        lt = xuong_dong(d, tieu_de.upper() if kind == "hook" else tieu_de, ft, max_w)
        if len(lt) <= (4 if kind == "hook" else 3) or size_t <= 52:
            break
        size_t -= 6
    fp = ImageFont.truetype(FONT_S, 54)
    lp = []
    for p in phu:
        lp += ["• " + x if i == 0 and len(phu) > 1 else ("  " + x if len(phu) > 1 else x)
               for i, x in enumerate(xuong_dong(d, p, fp, max_w - 40))]
    lp = lp[:7]
    gap_t, gap_p = int(size_t * 1.22), 70
    box_h = len(lt) * gap_t + (len(lp) * gap_p + 30 if lp else 0) + 70
    y0 = 330
    if kind == "hook":
        d.rounded_rectangle((60, y0, W - 60, y0 + box_h), 40, fill=XANH + (235,))
        mau_t, mau_p = TRANG, KEM
    else:
        d.rounded_rectangle((60, y0, W - 60, y0 + box_h), 40, fill=KEM + (238,))
        d.rounded_rectangle((60, y0, 78, y0 + box_h), 9, fill=XANH + (255,))
        mau_t, mau_p = XANH, NAU
    y = y0 + 35
    for ln in lt:
        tw = d.textlength(ln, font=ft)
        d.text(((W - tw) / 2, y), ln, font=ft, fill=mau_t)
        y += gap_t
    if lp:
        y += 30
        for ln in lp:
            d.text((110, y), ln, font=fp, fill=mau_p)
            y += gap_p
    im.save(path)
    return path


def dan_logo(img, logo_path, size, pos):
    lg = Image.open(logo_path).convert("RGBA")
    lg = lg.resize((size, int(size * lg.height / lg.width)))
    s = min(lg.size)
    lg = lg.crop(((lg.width - s) // 2, (lg.height - s) // 2, (lg.width - s) // 2 + s, (lg.height - s) // 2 + s))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    vien = Image.new("RGBA", (s + 10, s + 10), (0, 0, 0, 0))
    ImageDraw.Draw(vien).ellipse((0, 0, s + 9, s + 9), fill=(255, 255, 255, 240))
    vien.paste(lg, (5, 5), mask)
    img.alpha_composite(vien, pos)


def the_ket(path, logo, text):
    """Thẻ cuối: nền kem, logo to, tên kênh, câu kêu gọi."""
    im = Image.new("RGBA", (W, H), KEM + (255,))
    d = ImageDraw.Draw(im)
    for y in range(H):  # chuyển màu nhẹ
        a = int(60 * y / H)
        d.line([(0, y), (W, y)], fill=(255 - a // 3, 240 - a // 2, 215 - a, 255))
    if logo:
        dan_logo(im, logo, 460, ((W - 470) // 2, 470))
    else:
        d.ellipse((W // 2 - 230, 470, W // 2 + 230, 930), fill=XANH + (255,))
    f1 = ImageFont.truetype(FONT_B, 96)
    t = "Gian Bếp Của Mẹ"
    d.text(((W - d.textlength(t, font=f1)) / 2, 1010), t, font=f1, fill=XANH)
    f2 = ImageFont.truetype(FONT_S, 54)
    tieu_de, phu = tach_chu(text)
    dong = [x for x in [tieu_de] + phu if x and x.upper() != "GIAN BẾP CỦA MẸ"] or ["Mỗi ngày 1 mẹo nhỏ ❤", "Theo dõi để không lỡ"]
    y = 1150
    for x in dong[:3]:
        for ln in xuong_dong(d, x, f2, 900):
            d.text(((W - d.textlength(ln, font=f2)) / 2, y), ln, font=f2, fill=NAU)
            y += 72
    im.convert("RGB").save(path, quality=93)
    return path


def nen_mau(path, seed):
    """Nền dự phòng khi không có clip: màu ấm + hoa văn chấm nhẹ."""
    rnd = random.Random(seed)
    bang = [((255, 243, 224), (232, 245, 233)), ((252, 228, 236), (255, 248, 225)), ((232, 245, 233), (255, 236, 179))]
    c1, c2 = bang[rnd.randrange(len(bang))]
    im = Image.new("RGB", (W + 200, H + 300))
    d = ImageDraw.Draw(im)
    for y in range(im.height):
        t = y / im.height
        d.line([(0, y), (im.width, y)], fill=tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)))
    for _ in range(70):
        x, y, r = rnd.randrange(im.width), rnd.randrange(im.height), rnd.randrange(20, 90)
        d.ellipse((x - r, y - r, x + r, y + r), fill=tuple(min(255, v + 8) for v in c2))
    im.filter(ImageFilter.GaussianBlur(18)).save(path, quality=92)
    return path


# ---------------------------------------------------------------- tìm cảnh Pexels
_pexels_cache = {}


def pexels(keyword, key, idx):
    if not keyword or not key:
        return None
    if keyword not in _pexels_cache:
        q = urllib.parse.urlencode({"query": keyword, "orientation": "portrait", "per_page": 15, "size": "medium"})
        try:
            req = urllib.request.Request("https://api.pexels.com/videos/search?" + q,
                                         headers={"Authorization": key, "User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                _pexels_cache[keyword] = json.loads(r.read()).get("videos", [])
        except Exception as e:  # noqa
            log("Pexels lỗi:", e)
            _pexels_cache[keyword] = []
    vids = [v for v in _pexels_cache[keyword] if v.get("duration", 0) >= 4]
    if not vids:
        return None
    v = vids[idx % len(vids)]
    files = [f for f in v.get("video_files", []) if f.get("height") and f.get("width") and f["height"] > f["width"]]
    files = sorted(files, key=lambda f: abs(f["height"] - 1920))
    if not files:
        return None
    path = os.path.join(WORK, "px_" + hashlib.md5(files[0]["link"].encode()).hexdigest()[:10] + ".mp4")
    if not os.path.exists(path):
        try:
            tai(files[0]["link"], path)
        except Exception as e:  # noqa
            log("tải Pexels lỗi:", e)
            return None
    return path


# ---------------------------------------------------------------- ghép từng cảnh
def lam_canh(i, sc, logo, pexels_key, so):
    kind = sc.get("kind", "body")
    voice = doc(sc.get("voice", ""), os.path.join(WORK, f"v{i}.mp3"))
    vdur = do_dai(voice) if voice else 0
    dur = max(vdur + 0.45, {"hook": 2.6, "end": 3.2}.get(kind, 2.8), float(sc.get("min", 0) or 0))
    out = os.path.join(WORK, f"c{i:02d}.mp4")
    audio_in = ["-i", voice] if voice else ["-f", "lavfi", "-t", f"{dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo"]
    # nhịp cắt: âm thanh dài đúng bằng cảnh
    af = f"[1:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur={dur:.2f},atrim=0:{dur:.2f}[a]"

    if kind == "end":
        img = the_ket(os.path.join(WORK, f"end{i}.jpg"), logo, sc.get("text", ""))
        vf = (f"[0:v]scale=1080:1920,zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps={FPS},"
              f"format=yuv420p[v]")
        chay(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", f"{dur:.2f}", "-i", img, *audio_in,
              "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", "-r", str(FPS),
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "160k", out])
        return out, dur

    # hình nền của cảnh
    src, nguon = None, "nền màu"
    if sc.get("clip_url"):
        try:
            p = tai(sc["clip_url"], os.path.join(WORK, f"clip{i}.bin"))
            if la_video(p):
                src, nguon = p, "clip Drive"
            else:
                im = Image.open(p)
                im.convert("RGB").save(os.path.join(WORK, f"clip{i}.jpg"))
                src, nguon = os.path.join(WORK, f"clip{i}.jpg"), "ảnh Drive"
        except Exception as e:  # noqa
            log(f"cảnh {i}: không tải được clip Drive:", e)
    if not src:
        p = pexels(sc.get("keyword", ""), pexels_key, i + so)
        if p:
            src, nguon = p, "Pexels"
    if not src:
        src = nen_mau(os.path.join(WORK, f"bg{i}.jpg"), f"{so}-{i}")
    log(f"cảnh {i} [{kind}] {dur:.1f}s — hình: {nguon}")

    chu = anh_chu(sc.get("text", ""), kind, os.path.join(WORK, f"t{i}.png"), logo if i == 0 else None)
    if src.endswith(".jpg"):
        vin = ["-loop", "1", "-t", f"{dur:.2f}", "-i", src]
        base = (f"[0:v]scale=1280:2276:force_original_aspect_ratio=increase,crop=1280:2276,"
                f"zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps={FPS}")
    else:
        vin = ["-stream_loop", "-1", "-t", f"{dur:.2f}", "-i", src]
        base = f"[0:v]fps={FPS},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
    vf = (f"{base},eq=brightness=-0.04:saturation=1.08[bg];[2:v]format=rgba[tx];"
          f"[bg][tx]overlay=0:0,format=yuv420p,fade=t=in:st=0:d=0.18[v]")
    chay(["ffmpeg", "-y", "-loglevel", "error", *vin, *audio_in, "-loop", "1", "-t", f"{dur:.2f}", "-i", chu,
          "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", "-r", str(FPS),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "160k", out])
    return out, dur


def chon_nhac(so):
    for md in [os.path.join(HERE, "music"), os.path.join(HERE, "..", "render", "music")]:
        if os.path.isdir(md):
            ms = sorted(x for x in os.listdir(md) if x.lower().endswith(".mp3"))
            if ms:
                return os.path.join(md, ms[so % len(ms)])
    return None


def ghep(job):
    os.makedirs(WORK, exist_ok=True)
    v = job["video"]
    so = int(v.get("so", 0) or 0)
    logo = None
    if v.get("logo_url"):
        try:
            logo = tai(v["logo_url"], os.path.join(WORK, "logo.img"))
            Image.open(logo).verify()
        except Exception as e:  # noqa
            log("không dùng được logo:", e)
            logo = None
    elif os.path.exists(os.path.join(HERE, "logo.png")):
        logo = os.path.join(HERE, "logo.png")
    canh, tong = [], 0.0
    for i, sc in enumerate(v["scenes"]):
        p, d = lam_canh(i, sc, logo, job.get("pexels_key", ""), so)
        canh.append(p)
        tong += d
    lst = os.path.join(WORK, "list.txt")
    with open(lst, "w") as f:
        for p in canh:
            f.write(f"file '{os.path.abspath(p)}'\n")
    noi = os.path.join(WORK, "noi.mp4")
    chay(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", noi])
    out = job.get("out", "out.mp4")
    nhac = chon_nhac(so)
    if nhac:
        fc = (f"[1:a]volume=0.13,afade=t=in:d=1,afade=t=out:st={max(tong - 2, 0):.2f}:d=2[m];"
              f"[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-15:TP=-1.5[a]")
        chay(["ffmpeg", "-y", "-loglevel", "error", "-i", noi, "-stream_loop", "-1", "-i", nhac,
              "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
              "-t", f"{tong:.2f}", "-movflags", "+faststart", out])
    else:
        chay(["ffmpeg", "-y", "-loglevel", "error", "-i", noi, "-af", "loudnorm=I=-15:TP=-1.5",
              "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out])
    log(f"XONG video {so}: {tong:.1f} giây, {os.path.getsize(out) / 1e6:.1f} MB, nhạc: {nhac or 'không'}")
    return out


def main():
    job = json.loads(os.environ["PAYLOAD"]) if "PAYLOAD" in os.environ else json.load(open(sys.argv[1]))
    out = ghep(job)
    if job.get("callback"):
        body = json.dumps({"job": job["job"], "token": job["token"],
                           "video_b64": base64.b64encode(open(out, "rb").read()).decode()}).encode()
        req = urllib.request.Request(job["callback"], data=body, method="POST",
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            log("gửi về Apps Script:", r.status, r.read()[:300])


if __name__ == "__main__":
    main()
