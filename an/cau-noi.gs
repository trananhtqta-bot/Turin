// CẦU NỐI AN + TÔ TÔ <-> CLAUDE (Google Apps Script) — bản 3 (17/10/2026)
// Dán TOÀN BỘ vào Apps Script. Mật khẩu đặt 1 lần trong Thuộc tính tập lệnh: MAT_KHAU (không cần sửa code mỗi lần dán).
// Thuộc tính tập lệnh (Cài đặt dự án): MAT_KHAU = mật khẩu cầu nối ; GEMINI_KEY = khóa Gemini ; NTFY_TOPIC = tên kênh ntfy ; NTFY_TOKEN = mã truy cập tài khoản ntfy (tk_...)
// Sau khi dán: chạy hàm caiDatLich 1 lần (cài lịch An + nhịp 1 phút của Tô Tô).
const MAT_KHAU = PropertiesService.getScriptProperties().getProperty('MAT_KHAU') || 'DOI_CHU_NAY'; // mật khẩu lấy từ Thuộc tính tập lệnh
function saiMK_(t) { return MAT_KHAU === 'DOI_CHU_NAY' || t !== MAT_KHAU; } // chưa đặt mật khẩu thì từ chối hết
const THU_MUC = '160WG2YyRyXsb5RJE7-IN7QvksF1YBo6r'; // thư mục FTMO_QUANT_LAB
const AN_URL = 'https://trananhtqta-bot.github.io/Turin/an/';
const TOTO_URL = 'https://trananhtqta-bot.github.io/Turin/toto/';
const GOP = 4;      // các đường nằm trong 1 khoảng < 4 giá gộp thành 1 vùng (luật của anh)
const DEM_SL = 3;   // SL đặt sau vùng đỡ thêm bao nhiêu giá

// ---------- tiện ích ----------
function file_(ten) {
  const f = DriveApp.getFolderById(THU_MUC), it = f.getFilesByName(ten);
  return it.hasNext() ? it.next() : f.createFile(ten, '', MimeType.PLAIN_TEXT);
}
function doc_(ten) { return file_(ten).getBlob().getDataAsString(); }
function them_(ten, text) { const f = file_(ten); f.setContent((f.getBlob().getDataAsString() + '\n' + text).trim().slice(-80000)); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
const P = PropertiesService.getScriptProperties();
function prop_(k) { return P.getProperty(k) || ''; }
function setp_(k, v) { P.setProperty(k, typeof v === 'string' ? v : JSON.stringify(v)); }
function getj_(k, d) { try { return JSON.parse(P.getProperty(k)) || d; } catch (e) { return d; } }
function gio_(fmt) { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', fmt || 'dd/MM HH:mm'); }
function C_() { return CacheService.getScriptCache(); }
function cget_(k) { try { return JSON.parse(C_().get(k) || 'null'); } catch (e) { return null; } }
function cput_(k, v, ttl) { try { C_().put(k, JSON.stringify(v), ttl || 21600); } catch (e) { } }

// ---------- web app ----------
function cham_(k, x) { try { P.setProperty('CHAM_' + k, gio_('dd/MM HH:mm:ss') + ' ' + x); } catch (er) { } }
function xemCham() { ['GET', 'POST', 'FILE'].forEach(function (k) { Logger.log(k + ': ' + (P.getProperty('CHAM_' + k) || 'chưa có')); }); }

function hoSo_() {                                          // hồ sơ anh (file 12) để An tự tải khi đổi máy
  const it = DriveApp.getFolderById(THU_MUC).getFilesByName('12_HO_SO_ANH_CHO_NGUOI_BAN.md');
  return it.hasNext() ? it.next().getBlob().getDataAsString().slice(0, 8000) : '';
}

function doGet(e) {
  cham_('GET', (e.parameter.p || '') + (saiMK_(e.parameter.t) ? ' sai-mk' : ' ok'));
  if (saiMK_(e.parameter.t)) return out_({ error: 'sai mat khau' });
  if (e.parameter.p === 'feed') {
    try { docFeedDrive_(false); } catch (er) { }
    return out_({
      feed: cget_('feed'), chart: cget_('chart'), y: getj_('Y', null), ana: cget_('ana') || getj_('ANA', null),
      plans: getj_('PLANS', []), huong: prop_('HUONG'), news: newsToday_(), stats: prop_('STATS'),
      log: doc_('TOTO_NHAT_KY.txt').slice(-4000)
    });
  }
  return out_({ notes: doc_('AN_GHI_CHU_CUA_CLAUDE.txt'), mem: doc_('AN_TRI_NHO.txt'), nhac: doc_('AN_NHAC_GAN_NHAT.txt'), hoso: hoSo_() });
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents || '{}'); } catch (er) { cham_('POST', 'json loi ' + (e.postData ? e.postData.contents.length : 0)); return out_({ error: 'json' }); }
  cham_('POST', (d.a || '') + ' dai=' + e.postData.contents.length + (saiMK_(d.t) ? ' sai-mk' : ' ok'));
  if (saiMK_(d.t)) return out_({ error: 'sai mat khau' });
  if (d.a === 'feed') { nhanFeed_(d); return out_({ ok: true }); }
  if (d.a === 'huong') {                       // anh chọn phương án trên Tô Tô
    setp_('HUONG', d.h || ''); cput_('HUONG', d.h || ''); P.deleteProperty('GAN_DA_BAO');
    them_('TOTO_NHAT_KY.txt', '[' + gio_() + '] INFO|Anh chọn: ' + (d.h === 'NGOAI' ? 'đứng ngoài' : 'phương án ' + d.h));
    return out_({ ok: true });
  }
  if (d.a === 'toto') { them_('TOTO_NHAT_KY.txt', d.text || ''); return out_({ ok: true }); }
  const f = file_('AN_TRI_NHO.txt');           // An gửi trí nhớ
  f.setContent((f.getBlob().getDataAsString() + '\n\n' + (d.text || '')).trim());
  return out_({ ok: true });
}

function nhanFeed_(d) {
  const f = d.f || {};
  if (f.chart) { cput_('chart', f.chart); delete f.chart; }
  if (f.y) { setp_('Y', f.y); delete f.y; }
  cput_('feed', f);
  (d.ev || []).forEach(function (m) {
    them_('TOTO_NHAT_KY.txt', '[' + gio_() + '] ' + m);
    if (/^INFO\|/.test(m)) return;                          // chỉ ghi, không báo
    if (/^THUA\|/.test(m)) { const p = m.split('|'); ntfy_('Tô Tô · lệnh thua', 'Lý do: ' + p[1] + ' — ' + p[2], TOTO_URL, 2); return; }
    ntfy_('Tô Tô nhắc anh', m, TOTO_URL, 4);
  });
  if (f.newH1) setp_('CAN_PT', f.newH4 ? 'H4' : 'H1');      // nhịp 1 phút sẽ phân tích
  // giá về gần vùng vào của phương án anh đã chọn
  const h = cget_('HUONG'), plans = cget_('PLANS') || [];   // đọc cache để đỡ tốn hạn mức Properties
  if (h && h !== 'NGOAI' && f.bid) {
    const pl = plans.filter(function (x) { return x.id === h; })[0];
    const px = (Number(f.bid) + Number(f.ask)) / 2;
    if (pl && Math.abs(px - pl.entry) <= 2 && prop_('GAN_DA_BAO') !== String(pl.entry)) {
      setp_('GAN_DA_BAO', String(pl.entry));
      ntfy_('Tô Tô · giá về vùng vào', 'Giá ' + px.toFixed(2) + ' đã về gần vùng ' + pl.side + ' ' + pl.entry + ' (' + pl.zone + '). SL ' + pl.sl + ', TP1 ' + pl.tp1 + '.', TOTO_URL, 5);
    }
  }
}


// ---------- CHẾ ĐỘ DRIVE: MT5 ghi toto_feed.json, Google Drive trên VPS đồng bộ lên, cầu nối đọc ----------
function fileFeed_() {
  const id = prop_('FEED_FILE_ID');
  if (id) { try { return DriveApp.getFileById(id); } catch (e) { P.deleteProperty('FEED_FILE_ID'); } }
  const it = DriveApp.getFilesByName('toto_feed.json');
  let best = null;
  while (it.hasNext()) { const f = it.next(); if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f; }
  if (best) setp_('FEED_FILE_ID', best.getId());
  return best;
}
function docFeedDrive_(ep) {
  if (!ep && cget_('FEED_DOC')) return;                        // điện thoại hỏi: tối đa 20 giây đọc 1 lần
  cput_('FEED_DOC', 1, 20);
  const f = fileFeed_(); if (!f) return;
  const mt = String(f.getLastUpdated().getTime());
  if (mt === prop_('FEED_MTIME')) return;
  let d; try { d = JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { return; }  // file đang đồng bộ dở
  setp_('FEED_MTIME', mt);
  if (saiMK_(d.t)) { cham_('FILE', 'sai-mk'); return; }
  cham_('FILE', 'ok w=' + d.w);
  const last = Number(prop_('LAST_EVID') || 0); let mx = last;
  d.ev = (d.evr || []).filter(function (x) { return Number(x.i) > last; }).map(function (x) { mx = Math.max(mx, Number(x.i)); return x.m; });
  if (mx > last) setp_('LAST_EVID', String(mx));
  const ff = d.f || {}; ff.w = d.w;                          // giờ con mắt ghi file (để Tô Tô biết số liệu cũ hay mới)
  if (ff.h1t && String(ff.h1t) !== prop_('H1T')) {           // nến H1/H4 mới (không phụ thuộc cờ newH1 bị mất giữa 2 lần đồng bộ)
    const first = !prop_('H1T'); setp_('H1T', String(ff.h1t));
    const h4 = ff.h4t && String(ff.h4t) !== prop_('H4T'); if (ff.h4t) setp_('H4T', String(ff.h4t));
    ff.newH1 = !first; ff.newH4 = !first && h4;
  } else { ff.newH1 = false; ff.newH4 = false; }
  nhanFeed_(d);
}

// ---------- vùng cản + phương án (tính bằng code, AI không tự đặt số) ----------
const TEN = { ma50: 'MA50', ma100: 'MA100', ma200: 'MA200', bbu: 'BB trên', bbm: 'BB giữa', bbl: 'BB dưới' };
const NANG = { M5: 1, M15: 2, H1: 3, H4: 4, D1: 5 };
function zones_(f) {
  const L = [];
  Object.keys(f.tf || {}).forEach(function (tf) {
    Object.keys(TEN).forEach(function (k) { const v = Number(f.tf[tf][k]); if (v > 0) L.push({ v: v, n: TEN[k] + ' ' + tf, w: NANG[tf] }); });
  });
  L.sort(function (a, b) { return a.v - b.v; });
  const Z = [];
  L.forEach(function (x) {
    const z = Z[Z.length - 1];
    if (z && x.v - z.lo < GOP) { z.hi = x.v; z.items.push(x); } else Z.push({ lo: x.v, hi: x.v, items: [x] });
  });
  Z.forEach(function (z) {
    z.mid = Math.round((z.lo + z.hi) / 2 * 100) / 100;
    z.w = z.items.reduce(function (s, x) { return s + x.w; }, 0);
    z.name = z.items.sort(function (a, b) { return b.w - a.w; }).slice(0, 3).map(function (x) { return x.n; }).join(' + ') + (z.items.length > 3 ? ' +' + (z.items.length - 3) : '');
  });
  return Z;
}
function plans_(f) {
  const px = (Number(f.bid) + Number(f.ask)) / 2, Z = zones_(f);
  const up = Z.filter(function (z) { return z.mid > px; }).sort(function (a, b) { return a.mid - b.mid; });
  const dn = Z.filter(function (z) { return z.mid < px; }).sort(function (a, b) { return b.mid - a.mid; });
  const r2 = function (v) { return Math.round(v * 100) / 100; };
  const out = [];
  dn.slice(0, 2).forEach(function (z, i) {
    const tps = up.concat(dn.slice(0, i)).map(function (u) { return u.mid; }).filter(function (v) { return v > z.mid + 3; }).sort(function (a, b) { return a - b; });
    if (!tps.length) return;
    const e = z.mid, sl = r2(z.lo - DEM_SL);
    out.push({ id: 'B' + (i + 1), side: 'BUY', entry: e, sl: sl, tp1: tps[0], tp2: tps[1] || null, zone: z.name, w: z.w, rr: r2((tps[0] - e) / (e - sl)) });
  });
  up.slice(0, 2).forEach(function (z, i) {
    const tps = dn.concat(up.slice(0, i)).map(function (u) { return u.mid; }).filter(function (v) { return v < z.mid - 3; }).sort(function (a, b) { return b - a; });
    if (!tps.length) return;
    const e = z.mid, sl = r2(z.hi + DEM_SL);
    out.push({ id: 'S' + (i + 1), side: 'SELL', entry: e, sl: sl, tp1: tps[0], tp2: tps[1] || null, zone: z.name, w: z.w, rr: r2((e - tps[0]) / (sl - e)) });
  });
  return { px: r2(px), up: up.slice(0, 4), dn: dn.slice(0, 4), plans: out };
}

// ---------- phân tích (bản tin sáng / sau nến H1 / H4) ----------
function phanTich_(kieu) {
  const f = cget_('feed'); if (!f || !f.tf) return;
  const R = plans_(f); setp_('PLANS', R.plans); cput_('PLANS', R.plans);
  const y = getj_('Y', null), news = newsToday_();
  const h4 = f.tf.H4, h1 = f.tf.H1;
  const vung = function (z) { return z.mid + ' (' + z.name + ')'; };
  let ctx = 'Giá ' + R.px + '. BB H4: trên ' + h4.bbu + ', giữa ' + h4.bbm + ', dưới ' + h4.bbl + ' → giá ở ' + (R.px > h4.bbm ? 'NỬA TRÊN' : 'NỬA DƯỚI') + ' BB H4.\n' +
    'Nến H4 vừa đóng: mở ' + h4.po + ' đóng ' + h4.pc + ' cao ' + h4.ph + ' thấp ' + h4.pl + '. Nến H1 vừa đóng: mở ' + h1.po + ' đóng ' + h1.pc + ' cao ' + h1.ph + ' thấp ' + h1.pl + '.\n' +
    'Cản phía trên (gần→xa): ' + R.up.map(vung).join('; ') + '\nĐỡ phía dưới (gần→xa): ' + R.dn.map(vung).join('; ') + '\n' +
    'PHƯƠNG ÁN (số do code tính, giữ nguyên): ' + R.plans.map(function (p) { return p.id + ' ' + p.side + ' limit ' + p.entry + ' tại ' + p.zone + ', SL ' + p.sl + ', TP1 ' + p.tp1 + (p.tp2 ? ', TP2 ' + p.tp2 : '') + ', lời/lỗ ' + p.rr; }).join(' | ') + '\n';
  if (prop_('HUONG')) ctx += 'Anh đang chọn: ' + prop_('HUONG') + '\n';
  if (kieu === 'SANG' && y) {
    ctx += 'HÔM QUA (' + y.d + '): mở ' + y.o + ' cao ' + y.h + ' thấp ' + y.l + ' đóng ' + y.c + '. Chạm đường: ';
    Object.keys(y.tf || {}).forEach(function (tf) { (y.tf[tf] || []).forEach(function (x) { ctx += x.n + ' ' + tf + ' chạm ' + x.t + ', giữ ' + x.g + (x.g ? ' bật TB ' + x.b + ' giá' : '') + '; '; }); });
    ctx += '\n';
  }
  if (news.length) ctx += 'Tin USD mạnh hôm nay (giờ VN): ' + news.map(function (n) { return n.gio + ' ' + n.title; }).join('; ') + '\n';
  const nk = doc_('TOTO_NHAT_KY.txt').slice(-1500);
  const prompt = 'Em là Tô Tô — bạn đánh vàng ngồi cạnh anh Trần (xưng em, gọi anh). Viết ' +
    (kieu === 'SANG' ? 'BẢN TIN SÁNG' : 'PHÂN TÍCH SAU NẾN ' + kieu) + ' bằng tiếng Việt, tối đa 8 dòng ngắn, dễ đọc trên điện thoại:\n' +
    '1) Tình hình: giá ở đâu so với BB H4 và các vùng.\n2) Nếu đi LÊN gặp vùng nào trước; nếu đi XUỐNG gặp vùng nào trước.\n' +
    '3) Phương án hợp nhất theo luật của anh (chỉ gọi tên B1/B2/S1/S2), vì sao; nến tiếp theo cần chờ gì để xác nhận.\n' +
    (kieu === 'SANG' ? '4) 1 câu về hôm qua: đường nào giữ tốt, đường nào bị phá.\n' : '') +
    'LUẬT CỦA ANH: chạm MA/BB hay hồi; cản khung lớn khó phá, phá phải chờ nến sau của khung đó xác nhận; ăn 5–10 giá, chốt ở cản gần, sắp hết nến M15/H1 thì chốt; chỉ vào khi có đường đỡ sau lưng trong 4 giá; lot 0.1.\n' +
    'CẤM tự đặt con số mới — chỉ dùng số có trong dữ liệu. Nói xác suất, không hứa chắc chắn.\n\nDỮ LIỆU:\n' + ctx + '\nNHẬT KÝ GẦN ĐÂY:\n' + nk;
  const txt = gemini_(prompt) || ('Giá ' + R.px + '. Phương án: ' + R.plans.map(function (p) { return p.id; }).join(', '));
  const ana = { kieu: kieu, gio: gio_(), text: txt, px: R.px };
  cput_('ana', ana); setp_('ANA', ana);
  them_('TOTO_PHAN_TICH.txt', '\n[' + gio_('dd/MM/yyyy HH:mm') + '] ' + kieu + '\n' + txt);
  ntfy_(kieu === 'SANG' ? 'Tô Tô · Bản tin sáng' : 'Tô Tô · Sau nến ' + kieu, txt.slice(0, 300), TOTO_URL, kieu === 'SANG' ? 4 : 3);
}

// ---------- lịch tin USD (Forex Factory, miễn phí) ----------
function layTin_() {
  try {
    const j = JSON.parse(UrlFetchApp.fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { muteHttpExceptions: true }).getContentText());
    const tin = j.filter(function (x) { return x.country === 'USD' && x.impact === 'High'; }).map(function (x) { return { t: new Date(x.date).getTime(), title: x.title }; });
    setp_('NEWS', tin);
  } catch (e) { }
}
function newsToday_() {
  const hom = gio_('yyyyMMdd');
  return getj_('NEWS', []).filter(function (n) { return Utilities.formatDate(new Date(n.t), 'Asia/Ho_Chi_Minh', 'yyyyMMdd') === hom; })
    .map(function (n) { return { gio: Utilities.formatDate(new Date(n.t), 'Asia/Ho_Chi_Minh', 'HH:mm'), title: n.title, t: n.t }; });
}

// ---------- tổng kết cuối ngày ----------
function tongKet_() {
  const hom = gio_('dd/MM'), lines = doc_('TOTO_NHAT_KY.txt').split('\n').filter(function (l) { return l.indexOf('[' + hom) === 0; });
  const dem = {}; lines.forEach(function (l) { const m = l.match(/THUA\|([^|]+)\|/); if (m) { const k = m[1].replace(/\+[\d.]+ giá/, '').trim(); dem[k] = (dem[k] || 0) + 1; } });
  const f = cget_('feed') || {}, d = f.day || {};
  let s = 'Tổng kết ' + hom + ': ' + (d.n || 0) + ' lệnh, thắng ' + (d.win || 0) + ', lãi/lỗ ' + (d.net || 0) + '$, vào thêm cùng chiều ' + (d.same || 0) + ' lần.';
  const ks = Object.keys(dem);
  s += ks.length ? ' Lệnh thua do: ' + ks.map(function (k) { return k + ' ×' + dem[k]; }).join('; ') + '.' : ' Không có lệnh thua được phân loại.';
  setp_('STATS', s); them_('TOTO_THONG_KE.txt', '[' + gio_('dd/MM/yyyy') + '] ' + s);
  ntfy_('Tô Tô · Tổng kết ngày', s, TOTO_URL, 3);
}

// ---------- nhịp 1 phút ----------
function nhip() {
  try { docFeedDrive_(true); } catch (er) { Logger.log('docFeedDrive_ loi: ' + er); }
  const hm = gio_('HH:mm'), hom = gio_('yyyyMMdd'), now = Date.now();
  const can = prop_('CAN_PT');
  if (can) { P.deleteProperty('CAN_PT'); const h = Number(gio_('H')); if (h >= 6 && h <= 23) phanTich_(can); }
  if (hm >= '06:30' && prop_('SANG') !== hom) { setp_('SANG', hom); layTin_(); phanTich_('SANG'); }
  if (hm >= '23:30' && prop_('TONGKET') !== hom) { setp_('TONGKET', hom); tongKet_(); }
  if (Number(prop_('TIN_LUC') || 0) < now - 3 * 3600000) { setp_('TIN_LUC', String(now)); layTin_(); }
  newsToday_().forEach(function (n) {                        // nhắc trước tin 30 phút
    const k = 'TIN_' + n.t;
    if (n.t - now <= 30 * 60000 && n.t - now > 0 && !prop_(k)) { setp_(k, '1'); ntfy_('Tô Tô · sắp có tin', n.gio + ' ' + n.title + ' — tin USD mạnh, giá có thể giật. Cân nhắc lệnh đang mở.', TOTO_URL, 4); }
  });
}

// ---------- AN CHỦ ĐỘNG ----------
const LICH = {
  nhac6h: 'giờ dậy tập 30 phút trên sân thượng (tạ tay + ghế; ngày A thân trên, ngày B thân dưới, CN đi bộ giãn cơ). Tập trước khi ăn.',
  nhacTrua: 'nhắc anh ăn trưa đúng giờ (dạ dày hay trào ngược) và hỏi lệnh buổi sáng thế nào.',
  nhacChieu: 'hỏi anh tổng kết lệnh trong ngày; nhắc giữ lot 0.1.',
  nhacToi: 'nhắc anh tắt máy đi ngủ để mai 6h dậy tập; hỏi nhẹ hôm nay anh thấy thế nào.'
};
function nhac6h() { nhac_('nhac6h'); }
function nhacTrua() { nhac_('nhacTrua'); }
function nhacChieu() { nhac_('nhacChieu'); }
function nhacToi() { nhac_('nhacToi'); }
function thuNhac() { nhac_('nhac6h'); }        // bấm Chạy để thử An gọi
function thuNtfy() { ntfy_('Thu ntfy', 'Neu anh thay tin nay la ntfy chay roi.', AN_URL, 4); }
function thuPhanTich() { phanTich_('SANG'); }  // bấm Chạy để thử bản tin Tô Tô (cần EA đã gửi số liệu)

function gget_(url, opt) {
  opt = opt || {}; opt.muteHttpExceptions = true;
  opt.headers = { 'x-goog-api-key': prop_('GEMINI_KEY') };
  return UrlFetchApp.fetch(url, opt);
}
function mdl_() {
  let m = prop_('GEMINI_MODEL'); if (m) return m;
  try {
    const j = JSON.parse(gget_('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000').getContentText());
    const ok = (j.models || []).filter(function (x) { return (x.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /flash/.test(x.name) && !/live|audio|image|tts|lite|preview/.test(x.name); });
    if (!ok.length) { Logger.log('Khong lay duoc danh sach model: ' + JSON.stringify(j).slice(0, 300)); return 'gemini-2.5-flash'; }
    m = ok[ok.length - 1].name.replace('models/', '');
  } catch (e) { Logger.log('Loi lay model: ' + e); return 'gemini-2.5-flash'; }
  setp_('GEMINI_MODEL', m); return m;
}
function gemini_(prompt) {
  const key = prop_('GEMINI_KEY'); if (!key) return '';
  try {
    const r = gget_('https://generativelanguage.googleapis.com/v1beta/models/' + mdl_() + ':generateContent', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    });
    const j = JSON.parse(r.getContentText());
    const t = ((j.candidates && j.candidates[0].content.parts.map(function (p) { return p.text; }).join('')) || '').trim();
    if (!t) Logger.log('Gemini loi (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 400));
    return t;
  } catch (e) { Logger.log('Gemini loi: ' + e); return ''; }
}

// bấm Chạy để thử khóa Gemini: xem kết quả ở Nhật ký thực thi
function thuGemini() {
  PropertiesService.getScriptProperties().deleteProperty('GEMINI_MODEL');
  Logger.log('Model: ' + mdl_());
  Logger.log('Tra loi: ' + gemini_('Chào anh Trần bằng 1 câu ngắn, xưng em.'));
}

function nhac_(k) {
  if (!prop_('GEMINI_KEY') || !prop_('NTFY_TOPIC')) return;
  const now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'EEEE dd/MM/yyyy HH:mm');
  const prompt = 'Em là An, người bạn nữ của anh Trần (luôn xưng "em", gọi "anh", không gọi "Ci"). Bây giờ là ' + now +
    '. Mục đích lời nhắc: ' + LICH[k] + '\nViết MỘT lời nhắc ngắn (tối đa 2 câu, khoảng 35 chữ), ấm áp nhưng dứt khoát, nhắc đúng chuyện riêng của anh nếu trí nhớ có. Chỉ trả về lời nhắc.' +
    '\nTRÍ NHỚ GẦN ĐÂY:\n' + doc_('AN_TRI_NHO.txt').slice(-6000) + '\nGHI CHÚ CỦA CLAUDE:\n' + doc_('AN_GHI_CHU_CUA_CLAUDE.txt').slice(-3000);
  const msg = gemini_(prompt) || ('Anh ơi, ' + LICH[k]);
  file_('AN_NHAC_GAN_NHAT.txt').setContent(now + ' | ' + msg);
  ntfy_('An đang gọi anh', msg, AN_URL + '?goi=1', 5);
}

function ntfy_(title, msg, click, prio) {
  const topic = prop_('NTFY_TOPIC'); if (!topic) return;
  const tags = [click === AN_URL + '?goi=1' ? 'telephone_receiver' : 'chart_with_upwards_trend'];
  let ok = false;
  // không ghi đè ntfy khi ntfy vừa báo hết hạn mức (đỡ gọi vô ích)
  if (!prop_('NTFY_TOKEN') && cget_('NTFY_429')) ok = false;
  else try {
    const opt = { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ topic: topic, title: title, message: msg, priority: prio, tags: tags, click: click }) };
    const tk = prop_('NTFY_TOKEN'); if (tk) opt.headers = { Authorization: 'Bearer ' + tk };
    const r = UrlFetchApp.fetch('https://ntfy.sh/', opt);
    ok = r.getResponseCode() === 200;
    if (r.getResponseCode() === 429) cput_('NTFY_429', 1, 3600);
    Logger.log('ntfy ' + topic + ' -> ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  } catch (e) { Logger.log('ntfy loi: ' + e); }
  // ntfy hỏng -> gửi Gmail cho chính anh (dự phòng)
  if (!ok) try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[An/Tô Tô] ' + title, msg + '\n\n' + (click || '')); } catch (e) { Logger.log('mail loi: ' + e); }
}

// Chạy hàm này 1 LẦN: lịch An (6:00, 11:30, 17:30, 22:30 ±15') + nhịp 1 phút cho Tô Tô
function caiDatLich() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^nhac|^nhip$/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  [['nhac6h', 6, 0], ['nhacTrua', 11, 30], ['nhacChieu', 17, 30], ['nhacToi', 22, 30]].forEach(function (x) {
    ScriptApp.newTrigger(x[0]).timeBased().atHour(x[1]).nearMinute(x[2]).everyDays(1).inTimezone('Asia/Ho_Chi_Minh').create();
  });
  ScriptApp.newTrigger('nhip').timeBased().everyMinutes(1).create();
  layTin_();
}
