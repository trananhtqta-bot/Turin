"""Máy ghép ảnh/video cho TRUNG_TAM_3_PAGE.
Nhận job từ repository_dispatch, tải ảnh từ Drive, ghép logo/tiêu đề, làm video dọc 9:16,
rồi gửi kết quả về Apps Script (callback)."""
import base64, json, os, subprocess, sys, textwrap, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

P = json.loads(os.environ["PAYLOAD"])
FONT_B = "fonts/BeVietnamPro-Bold.ttf"
FONT_R = "fonts/BeVietnamPro-SemiBold.ttf"
W, H = 1080, 1920


def tai(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def chu_xuong_dong(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def dan_logo(img, logo_path, size):
    lg = Image.open(logo_path).convert("RGBA")
    lg.thumbnail((size, size))
    mask = Image.new("L", lg.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, lg.size[0], lg.size[1]), fill=255)
    vien = Image.new("RGBA", (lg.size[0] + 12, lg.size[1] + 12), (0, 0, 0, 0))
    ImageDraw.Draw(vien).ellipse((0, 0, vien.size[0] - 1, vien.size[1] - 1), fill=(255, 255, 255, 235))
    vien.paste(lg, (6, 6), mask)
    img.alpha_composite(vien, (36, 36))


def lam_anh(src, style, title, logo):
    im = Image.open(src).convert("RGBA")
    if style == "bego":                      # ảnh đã thiết kế sẵn: giữ nguyên
        return im.convert("RGB")
    im = im.resize((1080, int(1080 * im.height / im.width)))
    if style == "hoa":                       # ảnh thật của tiệm: giữ nguyên khung, chỉ gắn nhãn nhỏ
        d = ImageDraw.Draw(im)
        f = ImageFont.truetype(FONT_R, 34)
        t = "Chuyên hoa tại Thái Bình"
        tw = d.textlength(t, font=f)
        d.rounded_rectangle((im.width - tw - 64, im.height - 86, im.width - 24, im.height - 30), 26, fill=(255, 255, 255, 215))
        d.text((im.width - tw - 44, im.height - 81), t, font=f, fill=(150, 40, 80))
        return im.convert("RGB")
    if im.height < 1350:
        im = im.resize((int(1350 * im.width / im.height), 1350))
    left = (im.width - 1080) // 2
    im = im.crop((left, 0, left + 1080, min(im.height, 1620)))
    d = ImageDraw.Draw(im)
    if style == "ci" and title:
        grad = Image.new("RGBA", im.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(grad)
        for y in range(im.height // 2, im.height):
            a = int(215 * (y - im.height / 2) / (im.height / 2))
            gd.line([(0, y), (im.width, y)], fill=(10, 20, 30, a))
        im.alpha_composite(grad)
        d = ImageDraw.Draw(im)
        f = ImageFont.truetype(FONT_B, 78)
        lines = chu_xuong_dong(d, title.upper(), f, 960)[:4]
        y = im.height - 80 - len(lines) * 96
        for ln in lines:
            d.text((60, y), ln, font=f, fill=(255, 214, 92), stroke_width=3, stroke_fill=(0, 0, 0))
            y += 96
    if style == "hoa":
        f = ImageFont.truetype(FONT_R, 38)
        t = "🌸 Chuyên hoa tại Thái Bình"
        t = "Chuyên hoa tại Thái Bình"
        tw = d.textlength(t, font=f)
        d.rounded_rectangle((im.width - tw - 70, im.height - 96, im.width - 30, im.height - 36), 28, fill=(255, 255, 255, 210))
        d.text((im.width - tw - 50, im.height - 90), t, font=f, fill=(150, 40, 80))
    if logo:
        dan_logo(im, logo, 170)
    return im.convert("RGB")


def lam_video(img_path, out, style):
    im = Image.open(img_path)
    cao = im.height / im.width * W
    bg = "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:2,eq=brightness=-0.12[bg];"
    if style == "bego" and cao > 1500:       # infographic dài: phóng to rồi lướt xuống
        fh = min(int(cao), 1700)
        fg = (f"[0:v]scale=2160:-2,zoompan=z='if(lt(on,60),1,if(lt(on,120),1+0.3*(on-60)/60,if(lt(on,480),1.3,1.3-0.3*(on-480)/60)))'"
              f":x='iw/2-(iw/zoom/2)':y='if(lt(on,120),0,if(lt(on,480),(ih-ih/zoom)*(on-120)/360,(ih-ih/zoom)))'"
              f":d=1:s=1080x{fh}:fps=30[fg];")
        dur, oy = 18, (H - fh) // 2
    else:                                    # ảnh thường: phóng chậm (Ken Burns)
        fh = min(int(cao), 1920)
        fg = f"[0:v]scale=2160:-2,zoompan=z='1+0.0004*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x{fh}:fps=30[fg];"
        dur, oy = 12, (H - fh) // 2
    music = None
    md = "render/music"
    if os.path.isdir(md):
        ms = sorted(x for x in os.listdir(md) if x.endswith(".mp3"))
        if ms:
            music = os.path.join(md, ms[hash(P["job"]) % len(ms)])
    audio = ["-i", music] if music else ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
    fc = bg + fg + f"[bg][fg]overlay=0:{oy},format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st={dur-0.6}:d=0.6[v]"
    afade = ["-af", f"afade=t=out:st={dur-1.5}:d=1.5"] if music else []
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", img_path, *audio,
                    "-filter_complex", fc, "-map", "[v]", "-map", "1:a", *afade, "-t", str(dur), "-r", "30",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-c:a", "aac", "-b:a", "128k",
                    "-shortest", "-movflags", "+faststart", out], check=True)


def bo_emoji(t):
    return "".join(ch for ch in t if ord(ch) < 0x2190 or 0x1E00 <= ord(ch) <= 0x1EFF).strip()


def lop_chu(title):
    """Lớp chữ trong suốt 1080x1920: tiêu đề lớn phía trên + nhãn tiệm phía dưới."""
    top = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(top)
    title = bo_emoji(title)
    if title:
        f = ImageFont.truetype(FONT_B, 76)
        lines = chu_xuong_dong(d, title, f, 900)[:3]
        lh = 96
        y0 = 260
        box_h = len(lines) * lh + 60
        d.rounded_rectangle((60, y0 - 30, W - 60, y0 - 30 + box_h), 36, fill=(255, 255, 255, 228))
        for i, ln in enumerate(lines):
            tw = d.textlength(ln, font=f)
            d.text(((W - tw) / 2, y0 + i * lh), ln, font=f, fill=(170, 30, 80))
    top.save("lop_tieude.png")
    wm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(wm)
    f = ImageFont.truetype(FONT_B, 44)
    t = "Chuyên hoa tại Thái Bình"
    tw = d.textlength(t, font=f)
    x0, y0 = (W - tw) / 2 - 36, 1560
    d.rounded_rectangle((x0, y0, x0 + tw + 72, y0 + 84), 42, fill=(170, 30, 80, 225))
    d.text((x0 + 36, y0 + 14), t, font=f, fill=(255, 255, 255))
    wm.save("lop_nhan.png")


def lam_video_hoa(paths, title, out, music):
    """Video lướt nhiều ảnh: mỗi ảnh lấp kín khung dọc, lia chậm, chuyển mờ; tiêu đề 3 giây đầu."""
    lop_chu(title)
    per, tr = 3.0, 0.5
    n = len(paths)
    dur = per * n - tr * (n - 1)
    ins, fc = [], ""
    for i, pth in enumerate(paths):
        ins += ["-loop", "1", "-t", str(per), "-i", pth]
        im = Image.open(pth)
        doc = im.height / im.width >= H / W         # ảnh dọc hơn khung → lia dọc, ngang hơn → lia ngang
        sc = f"scale={int(W*1.08)}:-2" if doc else f"scale=-2:{int(H*1.08)}"
        if doc:
            cx, cy = "(iw-1080)/2", f"(ih-1920)*t/{per}"
        else:
            cx, cy = (f"(iw-1080)*t/{per}" if i % 2 == 0 else f"(iw-1080)*(1-t/{per})"), "(ih-1920)/2"
        fc += f"[{i}:v]{sc},crop=1080:1920:x='{cx}':y='{cy}',setsar=1,fps=30,format=yuv420p[c{i}];"
    last = "c0"
    for i in range(1, n):
        off = per * i - tr * i
        fc += f"[{last}][c{i}]xfade=transition=fade:duration={tr}:offset={off}[x{i}];"
        last = f"x{i}"
    k = n  # chỉ số input tiếp theo
    ins += ["-i", "lop_tieude.png", "-i", "lop_nhan.png"]
    fc += (f"[{last}][{k}:v]overlay=0:0:enable='between(t,0,3.2)'[t1];"
           f"[t1][{k+1}:v]overlay=0:0,fade=t=in:st=0:d=0.4,fade=t=out:st={dur-0.6}:d=0.6,format=yuv420p[v]")
    a = k + 2
    if music:
        ins += ["-i", music]
        amap = ["-map", f"{a}:a", "-af", f"afade=t=in:st=0:d=1,afade=t=out:st={dur-1.5}:d=1.5"]
    else:
        ins += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        amap = ["-map", f"{a}:a"]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *ins, "-filter_complex", fc, "-map", "[v]", *amap,
                    "-t", f"{dur:.2f}", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "24",
                    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out], check=True)


def main():
    src = tai(P["image_url"], "in.img")
    logo = tai(P["logo_url"], "logo.img") if P.get("logo_url") else None
    anh = lam_anh(src, P.get("style", "bego"), P.get("title", ""), logo)
    anh.save("out.jpg", quality=92)
    if P.get("style") == "hoa":
        paths = [src]
        for i, u in enumerate(P.get("extra_urls") or []):
            try:
                pth = tai(u, f"x{i}.img"); Image.open(pth).verify(); paths.append(pth)
            except Exception as e:
                print("bỏ ảnh phụ:", e)
        music = None
        if P.get("music_url"):
            try:
                music = tai(P["music_url"], "nhac.mp3")
            except Exception as e:
                print("bỏ nhạc:", e)
        lam_video_hoa(paths, P.get("title", ""), "out.mp4", music)
    else:
        lam_video("out.jpg", "out.mp4", P.get("style", "bego"))
    body = json.dumps({
        "job": P["job"], "token": P["token"],
        "image_b64": base64.b64encode(open("out.jpg", "rb").read()).decode(),
        "video_b64": base64.b64encode(open("out.mp4", "rb").read()).decode(),
    }).encode()
    req = urllib.request.Request(P["callback"], data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        print("callback:", r.status, r.read()[:300])


if __name__ == "__main__":
    main()
