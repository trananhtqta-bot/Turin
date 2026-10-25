function chayChanDoan() { try { damBaoWebhook_(); } catch (e) { ghiLog_('-', 'Telegram', 'LỖI: ' + e.message); } vietBaiHoaNgay(); }
/**
 * TRUNG TÂM 3 PAGE — Bè Gỗ Trên Sông · Học cùng Ci nhé · Chuyên hoa tại Thái Bình
 * Một bảng Google Sheets điều khiển: tự viết bài (Gemini), tự tạo ảnh (Ci, Hoa),
 * ghép video (GitHub Actions), tự đăng Facebook + YouTube Shorts + TikTok (qua Buffer)
 * lúc 7h và 19h. Lỗi gì cũng gửi email báo về điện thoại.
 *
 * Trang tính:
 *   Page    : cấu hình từng page (thư mục ảnh, brief, logo, mã Facebook, YouTube, Buffer)
 *   Bai     : hàng đợi bài. Trạng thái: Chờ ghép → Đang ghép → Sẵn sàng → Đã đăng (hoặc Lỗi / Dừng)
 *   NguonCi : (tùy chọn) dán chủ đề/nội dung cho page Ci, mỗi dòng 1 bài
 *   CaiDat  : các khóa & tùy chọn chung
 *   NhatKy  : nhật ký chạy
 */

var TZ = 'Asia/Ho_Chi_Minh';
var SH = { PAGE: 'Page', BAI: 'Bai', CI: 'NguonCi', CD: 'CaiDat', LOG: 'NhatKy' };
var PAGE_COLS = ['Mã', 'Tên page', 'Nguồn', 'Thư mục ảnh vào', 'Brief (ID file)', 'Logo (ID file)', 'Kiểu ghép',
  'FB Page ID', 'FB Token', 'YouTube refresh token', 'Buffer TikTok channel ID', 'Bật', 'YouTube category'];
var BAI_COLS = ['Page', 'Số', 'Tiêu đề', 'Trạng thái', 'Nội dung', 'Ảnh gốc', 'Ảnh đăng', 'Video', 'Đăng lúc',
  'Facebook', 'YouTube', 'TikTok', 'Ghi chú', 'Chữ trong ảnh', 'Job', 'Lần ghép', 'Tạo lúc', 'Lịch đăng', 'Loại', 'TG'];
var C = {}; BAI_COLS.forEach(function (n, i) { C[n] = i + 1; });
var P = {}; PAGE_COLS.forEach(function (n, i) { P[n] = i; });
var TON_KHO = 4;            // mỗi page luôn giữ sẵn 4 bài chuẩn bị trước
var HET_GIO = 5 * 60 * 1000; // mỗi lượt chạy tối đa ~5 phút

/* ============================ MENU ============================ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🪵 Trung tâm 3 page')
    .addItem('1. Cài đặt lần đầu', 'caiDatLanDau')
    .addItem('2. Kiểm tra kết nối', 'kiemTraKetNoi')
    .addItem('3a. Lấy mã Facebook cho 3 page', 'layMaFacebook')
    .addItem('3b. Hiện link kết nối YouTube', 'hienLinkYouTube')
    .addItem('4. BẬT tự động (chạy 15 phút/lần)', 'batTuDong')
    .addItem('5. TẮT tự động', 'tatTuDong')
    .addSeparator()
    .addItem('Chạy 1 lượt ngay', 'nhipChay')
    .addItem('Viết sẵn bài Hoa theo lịch (cả tuần)', 'vietBaiHoaNgay')
    .addItem('Kết nối Telegram duyệt bài', 'ketNoiTelegram')
    .addItem('Đăng ngay 1 bài sẵn sàng của mỗi page', 'dangNgay')
    .addItem('Thử đăng lại các bài Lỗi', 'thuLaiLoi')
    .addToUi();
}

/* ============================ CÀI ĐẶT ============================ */
function caiDatLanDau() {
  var ss = SpreadsheetApp.getActive();
  var pg = layHoacTao_(SH.PAGE, PAGE_COLS);
  if (pg.getLastRow() < 2) {
    pg.getRange(2, 1, 3, PAGE_COLS.length).setValues([
      ['BEGO', 'Bè Gỗ Trên Sông', 'ANH_CO_SAN', '1sMFfe9BH0ut5mF4ZrZ-SodwJ6twWN8V5', '1UBLu683CasHH1KypO--2bJBRMewCYKvs', '', 'bego', '', '', '', '', 'CO', '22'],
      ['CI', 'Học cùng Ci nhé', 'TU_TAO', '', '1I8SDUq4m-Tz6Nn1wCXCAd5X3ttKbWE0u', '', 'ci', '', '', '', '', 'CO', '27'],
      ['HOA', 'Chuyên hoa tại Thái Bình', 'TU_TAO', '', '19DKAXNwSv_d0BsCevhK53yuOz1xrf-Lp', '', 'hoa', '', '', '', '', 'CO', '26']
    ]);
  }
  layHoacTao_(SH.BAI, BAI_COLS);
  var ci = layHoacTao_(SH.CI, ['Chủ đề / nội dung bài Ci (mỗi dòng 1 bài)', 'Đã dùng']);
  var cd = layHoacTao_(SH.CD, ['Khóa', 'Giá trị', 'Giải thích']);
  if (cd.getLastRow() < 2) {
    cd.getRange(2, 1, 13, 3).setValues([
      ['GEMINI_KEY', '', 'Mã API Gemini — aistudio.google.com/apikey (phải bật thanh toán để vẽ ảnh)'],
      ['GEMINI_TEXT_MODEL', 'gemini-flash-latest', 'Mẫu viết bài'],
      ['GEMINI_IMAGE_MODEL', '', 'Để trống: máy tự tìm mẫu vẽ ảnh'],
      ['GITHUB_TOKEN', '', 'Mã GitHub (fine-grained, quyền Contents: Read & write cho repo Turin)'],
      ['GITHUB_REPO', 'trananhtqta-bot/Turin', 'Repo chứa máy ghép video'],
      ['BUFFER_KEY', '', 'Mã API Buffer — publish.buffer.com/settings/api'],
      ['BUFFER_API', 'https://api.buffer.com', 'Địa chỉ API Buffer'],
      ['YT_CLIENT_ID', '', 'OAuth Client ID (Google Cloud) cho YouTube'],
      ['YT_CLIENT_SECRET', '', 'OAuth Client secret'],
      ['EMAIL_BAO', Session.getEffectiveUser().getEmail(), 'Email nhận báo lỗi & tổng kết'],
      ['GIO_DANG', '7,19', 'Giờ đăng mỗi ngày (giờ VN), cách nhau dấu phẩy'],
      ['TAM_DUNG', 'KHONG', 'CO = tạm dừng toàn bộ'],
      ['GRAPH_VERSION', 'v21.0', 'Phiên bản Facebook Graph API']
    ]);
  }
  layHoacTao_(SH.LOG, ['Thời gian', 'Page', 'Việc', 'Kết quả']);
  [SH.PAGE, SH.BAI, SH.CI, SH.CD, SH.LOG].forEach(function (n) {
    var s = ss.getSheetByName(n); s.setFrozenRows(1);
    s.getRange(1, 1, 1, s.getLastColumn()).setFontWeight('bold').setBackground('#214D43').setFontColor('#F3EDE1');
  });
  ss.getSheetByName(SH.BAI).setColumnWidth(C['Nội dung'], 380).getRange('E:E').setWrap(true);
  thuMucXuat_();
  bao_('Xong cài đặt. Anh điền các ô trống trong trang CaiDat và Page theo hướng dẫn của em.');
}

function layHoacTao_(ten, cot) {
  var ss = SpreadsheetApp.getActive(), s = ss.getSheetByName(ten);
  if (!s && ten === SH.PAGE) { s = ss.getSheets()[0]; s.setName(ten); s.clear(); s.getRange(1, 1, 1, cot.length).setValues([cot]); }
  if (!s) { s = ss.insertSheet(ten); s.getRange(1, 1, 1, cot.length).setValues([cot]); }
  return s;
}

function cfg_(k) {
  var s = SpreadsheetApp.getActive().getSheetByName(SH.CD);
  var v = s.getRange(2, 1, Math.max(s.getLastRow() - 1, 1), 2).getValues();
  for (var i = 0; i < v.length; i++) if (v[i][0] === k) return String(v[i][1]).trim();
  return '';
}
function datCfg_(k, val) {
  var s = SpreadsheetApp.getActive().getSheetByName(SH.CD);
  var v = s.getRange(2, 1, s.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (v[i][0] === k) { s.getRange(i + 2, 2).setValue(val); return; }
  s.appendRow([k, val, '']);
}

function cacPage_() {
  var s = SpreadsheetApp.getActive().getSheetByName(SH.PAGE);
  return s.getRange(2, 1, s.getLastRow() - 1, PAGE_COLS.length).getValues().map(function (r, i) {
    return { row: i + 2, ma: r[P['Mã']], ten: r[P['Tên page']], nguon: r[P['Nguồn']], thuMuc: idTu_(r[P['Thư mục ảnh vào']]),
      brief: idTu_(r[P['Brief (ID file)']]), logo: (/^https?:/.test(String(r[P['Logo (ID file)']]).trim()) ? String(r[P['Logo (ID file)']]).trim() : idTu_(r[P['Logo (ID file)']])), kieu: r[P['Kiểu ghép']],
      fbId: String(r[P['FB Page ID']]).trim(), fbToken: String(r[P['FB Token']]).trim(), ytToken: String(r[P['YouTube refresh token']]).trim(),
      buffer: String(r[P['Buffer TikTok channel ID']]).trim(), bat: String(r[P['Bật']]).toUpperCase() === 'CO',
      ytCat: String(r[P['YouTube category']] || '22') };
  });
}
function idTu_(v) { var m = String(v || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

function thuMucXuat_() {
  var id = PropertiesService.getScriptProperties().getProperty('THU_MUC_XUAT');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var ss = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  var cha = ss.getParents().hasNext() ? ss.getParents().next() : DriveApp.getRootFolder();
  var f = cha.createFolder('XUAT_BAN (ảnh + video đã ghép)');
  PropertiesService.getScriptProperties().setProperty('THU_MUC_XUAT', f.getId());
  return f;
}

/* ============================ NHỊP CHẠY CHÍNH ============================ */
function batTuDong() {
  tatTuDong();
  ScriptApp.newTrigger('nhipChay').timeBased().everyMinutes(15).create();
  bao_('Đã BẬT tự động: máy chạy 15 phút/lần, đăng lúc ' + cfg_('GIO_DANG') + 'h.');
}
function tatTuDong() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nhipChay') ScriptApp.deleteTrigger(t);
  });
}

function nhipChay() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var t0 = Date.now();
  try {
    if (cfg_('TAM_DUNG').toUpperCase() === 'CO') return;
    var pages = cacPage_().filter(function (p) { return p.bat; });
    // 1) Đăng bài đúng giờ (ưu tiên trước)
    var gioNay = Number(Utilities.formatDate(new Date(), TZ, 'H'));
    var gios = cfg_('GIO_DANG').split(',').map(function (x) { return Number(x.trim()); });
    var khung = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd-HH');
    pages.forEach(function (p) {
      var key = 'DADANG_' + p.ma, pr = PropertiesService.getScriptProperties();
      if (pr.getProperty(key) === khung) return;
      if (coLich_(p.ma)) {   // page chạy theo lịch (Hoa): chỉ đăng bài đã DUYỆT của đúng khung giờ này
        var kl = khungLich_(new Date(), TZ, gioNay);
        var co = lichCua_(p.ma).some(function (x) { return x.thu === thuCua_(new Date()) && x.gio === gioNay; });
        if (!co) return;
        pr.setProperty(key, khung);
        var r2 = dongTheoLich_(p.ma, kl);
        if (r2 > 0) dangDong_(r2, p);
        else canhBao_(p.ten + ': đến khung ' + kl + ' nhưng bài của khung này CHƯA được duyệt nên không đăng.');
        return;
      }
      if (gios.indexOf(gioNay) < 0) return;
      var r = dongTiepTheo_(p.ma, 'Sẵn sàng');
      if (r > 0) { dangDong_(r, p); pr.setProperty(key, khung); }
      else canhBao_(p.ten + ': đến giờ đăng nhưng KHÔNG có bài sẵn sàng.');
    });
    // 2) Gửi ảnh đi ghép / thử lại job bị treo
    guiGhep_(t0);
    // 3) Chuẩn bị bài mới cho đủ tồn kho
    pages.forEach(function (p) {
      while (Date.now() - t0 < HET_GIO && (coLich_(p.ma) || demKho_(p.ma) < TON_KHO)) {
        if (!sanXuat_(p)) break;
      }
    });
    guiGhep_(t0);
    try { damBaoWebhook_(); guiTelegram_(); } catch (e) { ghiLog_('-', 'Telegram', 'LỖI: ' + e.message); }
    nhacDuyet_();
    // 4) Tổng kết 21h
    if (gioNay === 21) tongKet_();
  } catch (e) {
    ghiLog_('-', 'nhipChay', 'LỖI: ' + e.message); canhBao_('Máy gặp lỗi: ' + e.message);
  } finally { lock.releaseLock(); }
}

function demKho_(ma) {
  var v = bangBai_().getDataRange().getValues(), n = 0;
  for (var i = 1; i < v.length; i++)
    if (v[i][C['Page'] - 1] === ma && ['Chờ duyệt', 'Duyệt', 'Chờ ghép', 'Đang ghép', 'Sẵn sàng'].indexOf(v[i][C['Trạng thái'] - 1]) >= 0) n++;
  return n;
}
function bangBai_() { return SpreadsheetApp.getActive().getSheetByName(SH.BAI); }

function dongTiepTheo_(ma, tt) {
  var v = bangBai_().getDataRange().getValues(), best = -1, bestSo = 1e15;
  for (var i = 1; i < v.length; i++) {
    var t = v[i][C['Trạng thái'] - 1];
    var hop = t === tt || (tt === 'Sẵn sàng' && t === 'Duyệt' && (v[i][C['Video'] - 1] || khongVideo_(ma)));
    if (v[i][C['Page'] - 1] !== ma || !hop) continue;
    var so = Number(v[i][C['Số'] - 1]) || (i + 1e9);
    if (so < bestSo) { bestSo = so; best = i + 1; }
  }
  return best;
}

/* ============================ SẢN XUẤT BÀI ============================ */
function vietBaiHoaNgay() {
  var t0 = Date.now(), n = 0;
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'nhipChay'; }))
    ScriptApp.newTrigger('nhipChay').timeBased().everyMinutes(15).create();   // đảm bảo máy tự chạy 15 phút/lần
  cacPage_().filter(function (p) { return coLich_(p.ma); }).forEach(function (p) {
    while (Date.now() - t0 < HET_GIO && sanXuat_(p)) n++;
  });
  ghiLog_('HOA', 'viết sẵn theo lịch', n + ' bài');
  try { damBaoWebhook_(); guiTelegram_(); } catch (e) { ghiLog_('-', 'Telegram', 'LỖI: ' + e.message); }
  if (n) nhacDuyet_();
}
function sanXuat_(p) {
  try {
    if (p.nguon === 'ANH_CO_SAN') return sanXuatTuAnh_(p);
    if (p.nguon === 'ANH_HOA') return sanXuatTuAnhHoa_(p);
    return sanXuatTuTao_(p);
  } catch (e) {
    ghiLog_(p.ma, 'sản xuất', 'LỖI: ' + e.message); canhBao_(p.ten + ' — lỗi khi chuẩn bị bài: ' + e.message);
    return false;
  }
}

/** Bè Gỗ: lấy ảnh có số bài nhỏ nhất chưa xử lý trong thư mục, đọc chữ trong ảnh, viết caption. */
function sanXuatTuAnh_(p) {
  if (!p.thuMuc) return false;
  var daDung = {}, v = bangBai_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][C['Page'] - 1] === p.ma) daDung[v[i][C['Ảnh gốc'] - 1]] = 1;
  var it = DriveApp.getFolderById(p.thuMuc).getFiles(), ds = [];
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType().indexOf('image/') !== 0 || daDung[f.getId()]) continue;
    var m = f.getName().match(/(\d+)/); ds.push({ f: f, so: m ? Number(m[1]) : 1e9 });
  }
  if (!ds.length) { canhBaoMotLan_('HET_ANH_' + p.ma, p.ten + ': đã dùng hết ảnh trong thư mục, anh up thêm ảnh nhé.'); return false; }
  ds.sort(function (a, b) { return a.so - b.so; });
  var f0 = ds[0].f, blob = f0.getBlob();
  var anh = { inlineData: { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) } };
  var a = jsonGemini_(p, [anh, { text: 'Chép lại NGUYÊN VĂN toàn bộ chữ in trên ảnh, từ trên xuống, giữ đúng dấu tiếng Việt, mỗi khung/ý một dòng. Không thêm bớt. ' +
    'Trả JSON: {"so": <số bài in trên ảnh, kiểu số, không có thì 0>, "tieu_de": "<tiêu đề>", "chu_trong_anh": "<toàn bộ chữ>"}' }]);
  var so = Number(a.so) || ds[0].so;
  var bai = textGemini_(p, [{ text: 'Dưới đây là TOÀN BỘ chữ trong ảnh Bài ' + so + ':\n"""\n' + a.chu_trong_anh + '\n"""\n' +
    'Viết caption Facebook đăng kèm ảnh. Chỉ dùng ý có trong ảnh, đi đúng thứ tự các khung, giữ ví dụ/câu hỏi/câu chốt của ảnh, viết lại cho liền mạch. ' +
    'KHÔNG bịa thêm nhân vật, tình huống, lời khuyên không có trong ảnh. Dòng đầu: BÀI ' + so + ': ' + String(a.tieu_de).toUpperCase() + '. ' +
    'Có thể dùng vài emoji 🌿 🪵 ✍️ 👉. Văn bản thuần, không dùng * hay # để định dạng. Kết bằng 1 câu hỏi mời bình luận. ' +
    'Dòng cuối: #BeGoTrenSong #SoiTamSuaMinh #PhatPhapUngDung và 3–4 hashtag hợp chủ đề. Chỉ trả về caption.' }]);
  themDong_(p.ma, so, a.tieu_de, lamSach_(bai), f0.getId(), a.chu_trong_anh);
  ghiLog_(p.ma, 'viết bài ' + so, 'OK');
  return true;
}

/** Hoa: lấy ảnh hoa thật trong album (ảnh chưa dùng trước; dùng hết thì quay vòng ảnh dùng ít nhất),
 *  Gemini nhìn ảnh rồi viết bài tương tác theo một "góc viết" xoay vòng. */
/** Dịp tặng hoa gần nhất trong ~60 ngày tới. */
function dipSapToi_() {
  var nay = new Date(), y = nay.getFullYear(), ds = [];
  [[2, 14, 'Valentine 14/2'], [3, 8, 'Quốc tế Phụ nữ 8/3'], [5, 20, 'mùa tốt nghiệp – kỷ yếu'], [10, 20, 'Phụ nữ Việt Nam 20/10'],
   [11, 20, 'Nhà giáo Việt Nam 20/11'], [12, 24, 'Giáng sinh – Noel']].forEach(function (d) {
    [y, y + 1].forEach(function (n) { ds.push({ t: new Date(n, d[0] - 1, d[1]), ten: d[2] }); });
  });
  [[2027, 2, 6], [2028, 1, 26], [2029, 2, 13], [2030, 2, 3]].forEach(function (d) { ds.push({ t: new Date(d[0], d[1] - 1, d[2]), ten: 'Tết Nguyên đán (hoa chưng Tết, hoa tiền lì xì)' }); });
  ds = ds.filter(function (d) { var k = (d.t - nay) / 864e5; return k >= -1 && k <= 60; }).sort(function (a, b) { return a.t - b.t; });
  return ds.length ? ds[0].ten + ' (ngày ' + Utilities.formatDate(ds[0].t, TZ, 'dd/MM') + ')' : 'sinh nhật, kỷ niệm, khai trương';
}
/* ---------- Lịch & chủ đề page Hoa (trang LichHoa, ChuDeHoa) ---------- */
var THU_TEN = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
var NGAY_TOI = 8;
/** Mốc tuần: 18h Chủ nhật gần nhất. Máy viết bài cho các khung tới hết Chủ nhật tuần sau; 22h CN mới gửi Telegram. */
function mocTuan_() {
  var now = new Date(), thu = thuCua_(now), lui = thu % 7;
  var ngay = Utilities.formatDate(new Date(now.getTime() - lui * 864e5), TZ, 'yyyy-MM-dd');
  var m = new Date(ngay + 'T18:00:00+07:00').getTime();
  if (m > now.getTime()) m -= 7 * 864e5;
  return m;
}
function dangGiuGui_() { var n = new Date(), h = Number(Utilities.formatDate(n, TZ, 'H')); return thuCua_(n) === 7 && h >= 18 && h < 22; }
function coLich_(ma) { return String(ma).toUpperCase() === 'HOA' && !!SpreadsheetApp.getActive().getSheetByName('LichHoa'); }
function thuCua_(d) { return Number(Utilities.formatDate(d, TZ, 'u')); }   // 1 = Thứ 2 … 7 = Chủ nhật
function lichCua_(ma) {
  var s = SpreadsheetApp.getActive().getSheetByName('LichHoa'); if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 3).getValues().map(function (r) {
    var t = String(r[0]).trim().toUpperCase().replace(/^T(HỨ)?\s*/, ''), thu = (t === 'CN' || t === '8') ? 7 : Number(t) - 1;
    return { thu: thu, gio: Number(r[1]), loai: String(r[2]).trim() };
  }).filter(function (x) { return x.thu >= 1 && x.thu <= 7 && x.gio >= 0 && x.gio <= 23 && x.loai; });
}
function khungLich_(d, tz, gio) { return THU_TEN[thuCua_(d)] + ' ' + Utilities.formatDate(d, TZ, 'dd/MM/yyyy') + ' ' + (gio < 10 ? '0' : '') + gio + 'h'; }
function chuDeCua_(loai) {
  var s = SpreadsheetApp.getActive().getSheetByName('ChuDeHoa'); if (!s || s.getLastRow() < 2) return [];
  var k = chuanHoa_(loai);
  return s.getRange(2, 1, s.getLastRow() - 1, 2).getValues().filter(function (r) { return chuanHoa_(r[0]) === k && String(r[1]).trim(); })
    .map(function (r) { return String(r[1]).trim(); });
}
function dongTheoLich_(ma, kl) {
  var v = bangBai_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++)
    if (v[i][C['Page'] - 1] === ma && String(v[i][C['Lịch đăng'] - 1]) === kl && ['Duyệt', 'Sẵn sàng'].indexOf(v[i][C['Trạng thái'] - 1]) >= 0) return i + 1;
  return -1;
}
/** Khung giờ sắp tới (trong NGAY_TOI ngày) còn thiếu bài. */
function khungThieu_(ma) {
  var v = bangBai_().getDataRange().getValues(), co = {}, bo = {};
  for (var i = 1; i < v.length; i++) if (v[i][C['Page'] - 1] === ma) {
    var k = String(v[i][C['Lịch đăng'] - 1]); if (!k) continue;
    if (v[i][C['Trạng thái'] - 1] === 'Bỏ') bo[k] = (bo[k] || 0) + 1; else co[k] = 1;   // 'Không đăng' cũng tính là đã có
  }
  var lich = lichCua_(ma), now = Date.now(), het = mocTuan_() + 7 * 864e5 + 6 * 3600e3;
  for (var d = 0; d <= NGAY_TOI; d++) {
    var ngay = new Date(now + d * 864e5), thu = thuCua_(ngay), ymd = Utilities.formatDate(ngay, TZ, 'yyyy-MM-dd');
    var ds = lich.filter(function (x) { return x.thu === thu; }).sort(function (a, b) { return a.gio - b.gio; });
    for (var j = 0; j < ds.length; j++) {
      var luc = new Date(ymd + 'T' + (ds[j].gio < 10 ? '0' : '') + ds[j].gio + ':00:00+07:00').getTime();
      if (luc < now + 10 * 60000 || luc > het) continue;
      var kl = khungLich_(ngay, TZ, ds[j].gio);
      if (co[kl] || (bo[kl] || 0) >= 3) continue;   // anh bỏ 3 lần thì thôi, không viết lại nữa
      return { kl: kl, loai: ds[j].loai, ngay: ngay, gio: ds[j].gio };
    }
  }
  return null;
}

/** Hoa: theo lịch — khung nào thiếu bài thì lấy ảnh đúng album của khung đó, chọn chủ đề xoay vòng, Gemini viết. */
function sanXuatTuAnhHoa_(p) {
  if (!p.thuMuc) return false;
  var k = khungThieu_(p.ma); if (!k) return false;
  var tamTu = chuanHoa_(k.loai) === chuanHoa_('Tâm tư');
  var dem = {}, demLoai = 0, v = bangBai_().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][C['Page'] - 1] === p.ma) {
    var g = v[i][C['Ảnh gốc'] - 1]; dem[g] = (dem[g] || 0) + 1;
    if (chuanHoa_(v[i][C['Loại'] - 1]) === chuanHoa_(k.loai)) demLoai++;
  }
  // Ảnh: album trùng tên loại; Tâm tư thì lấy ảnh bất kỳ trong mọi album
  var goc = DriveApp.getFolderById(p.thuMuc), ds = [], tq = Date.now();
  function quet(folderId, ten) {
    var it = DriveApp.searchFiles("'" + folderId + "' in parents and mimeType contains 'image/' and trashed = false");
    while (it.hasNext()) { var f = it.next(); ds.push({ f: f, album: ten, n: dem[f.getId()] || 0, r: Math.random() }); }
  }
  var sub = goc.getFolders(), timThay = false;
  while (sub.hasNext()) {
    var fd = sub.next(), ten = fd.getName().trim();
    if (tamTu || chuanHoa_(ten) === chuanHoa_(k.loai)) { quet(fd.getId(), ten); timThay = true; }
  }
  if (tamTu) quet(goc.getId(), 'Hoa');
  if (!ds.length) {
    canhBaoMotLan_('HET_ANH_' + k.loai, p.ten + ': album "' + k.loai + '" ' + (timThay ? 'đang trống' : 'không có (tên thư mục phải trùng cột Loại trong trang LichHoa)') + ', anh thả ảnh vào nhé.');
    themDong_(p.ma, '', '(thiếu ảnh ' + k.loai + ')', '', '', '');   // giữ chỗ để không viết lặp
    var r0 = bangBai_().getLastRow();
    bangBai_().getRange(r0, C['Trạng thái']).setValue('Bỏ'); bangBai_().getRange(r0, C['Lịch đăng']).setValue(k.kl); bangBai_().getRange(r0, C['Loại']).setValue(k.loai);
    return true;
  }
  ds.sort(function (x, y) { return x.n - y.n || x.r - y.r; });
  var chon = ds[0], f0 = chon.f, blob = anhNho_(f0);
  ghiLog_(p.ma, 'chọn ảnh', k.kl + ' · ' + k.loai + ': ' + ds.length + ' ảnh, quét ' + Math.round((Date.now() - tq) / 1000) + 's → ' + chon.album + '/' + f0.getName());
  var cds = chuDeCua_(k.loai), chuDe = cds.length ? cds[demLoai % cds.length] : k.loai;
  var daViet = tieuDeDaCo_(p.ma).slice(-40);
  var anh = { inlineData: { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) } };
  var boiCanh = 'Bài sẽ đăng lúc ' + k.gio + 'h ' + THU_TEN[thuCua_(k.ngay)] + ' ' + Utilities.formatDate(k.ngay, TZ, 'dd/MM/yyyy') +
    '. Dịp tặng hoa sắp tới: ' + dipSapToi_() + ' (chỉ nhắc nếu hợp tự nhiên).\n';
  var yc = tamTu ?
    ('Đây là bài "TÂM TƯ" (chuyện cảm xúc, tình cảm, gợi bình luận) cho page bán hoa. Ảnh kèm theo là một sản phẩm thật của tiệm (album "' + chon.album + '").\n' + boiCanh +
     'CHỦ ĐỀ: ' + chuDe + '\n' +
     'Viết 1 bài Facebook sâu lắng, gần gũi, chân thật như một người bán hoa đã chứng kiến nhiều câu chuyện tặng hoa; câu mở đầu thật cuốn hút; có thể khéo liên hệ tới bó hoa trong ảnh và việc tặng hoa nhưng KHÔNG quảng cáo lộ liễu. ' +
     'Kết bằng 1 câu hỏi mở để mọi người bình luận chia sẻ. Không bịa tên người thật, không nhắc giá.\n') :
    ('Ảnh này là sản phẩm THẬT của tiệm, thuộc dòng: "' + chon.album + '".\n' + boiCanh +
     'Bước 1: nhìn kỹ và liệt kê đúng những gì thấy (loại hoa/kẹo/tiền, màu, cách bó/cắm/trang trí, phụ kiện).\n' +
     'Bước 2: viết 1 bài Facebook theo CHỦ ĐỀ: ' + chuDe + '\n' +
     'Viết sáng tạo, câu mở đầu thật cuốn hút, gợi cảm xúc và khiến khách muốn nhắn tin hỏi mẫu; bài phải ĐÚNG với sản phẩm trong ảnh (không tả sai loại hoa, màu). ' +
     'Có thể nhắc tiệm nhận viết thiệp, in biển tên miễn phí, thiết kế theo yêu cầu. Kết bằng lời mời inbox/gọi đặt hoặc 1 câu hỏi gợi bình luận. KHÔNG bịa giá, khuyến mãi, chuyện khách cụ thể.\n');
  yc += 'Logo/chữ "Forentino" trên ảnh là thương hiệu CỦA TIỆM MÌNH. Băng rôn, thiệp, biển chúc mừng trên sản phẩm là của khách: KHÔNG chép tên người/công ty ghi trên đó.\n' +
    'Dài khoảng 80–180 chữ, xuống dòng thoáng, dễ đọc trên điện thoại, vài emoji vừa phải. Văn bản thuần, không dùng * hay #. ' +
    'KHÔNG viết hashtag, địa chỉ, số điện thoại (máy tự gắn đoạn cuối).\n' +
    'Tiêu đề (tieu_de): 3–7 chữ, không emoji, không trùng: ' + JSON.stringify(daViet) + '\n' +
    'Trả JSON: {"thay_trong_anh": "<liệt kê ngắn>", "tieu_de": "<tiêu đề>", "bai_viet": "<bài hoàn chỉnh>"}';
  var o = jsonGemini_(p, [anh, { text: yc }]);
  if (!o.bai_viet) throw new Error('Gemini trả thiếu bài');
  themDong_(p.ma, '', o.tieu_de, lamSach_(o.bai_viet), f0.getId(), 'Album: ' + chon.album + ' · Chủ đề: ' + chuDe);
  var rr = bangBai_().getLastRow();
  bangBai_().getRange(rr, C['Lịch đăng']).setNumberFormat('@').setValue(k.kl);
  bangBai_().getRange(rr, C['Loại']).setValue(k.loai);
  ghiLog_(p.ma, 'viết bài ' + k.kl + ' (' + k.loai + '): ' + o.tieu_de, 'OK');
  return true;
}

/** Ci & Hoa: Gemini tự chọn chủ đề, viết bài, tạo ảnh. */
function sanXuatTuTao_(p) {
  var daViet = tieuDeDaCo_(p.ma).slice(-80);
  var homNay = Utilities.formatDate(new Date(), TZ, "EEEE dd/MM/yyyy");
  var yeuCau, nguon = null;
  if (p.ma === 'CI') nguon = layNguonCi_();
  yeuCau = 'Hôm nay là ' + homNay + '. Viết 1 bài mới cho page "' + p.ten + '" đúng theo brief.\n' +
    (nguon ? 'Dùng nội dung/chủ đề anh chủ page cung cấp:\n"""\n' + nguon.text + '\n"""\n' :
      'Tự chọn chủ đề mới, KHÔNG trùng các tiêu đề đã đăng: ' + JSON.stringify(daViet) + '\n') +
    'Trả JSON: {"tieu_de": "<tiêu đề ngắn, hấp dẫn>", "bai_viet": "<caption hoàn chỉnh theo brief>", ' +
    '"prompt_anh": "<mô tả ảnh bằng tiếng Anh, dọc 2:3, theo phần ẢNH trong brief, tuyệt đối không có chữ/logo trong ảnh>"}';
  var o = jsonGemini_(p, [{ text: yeuCau }]);
  if (!o.bai_viet || !o.prompt_anh) throw new Error('Gemini trả thiếu bài hoặc mô tả ảnh');
  var anh = veAnh_(o.prompt_anh + '. Vertical 2:3 composition. Absolutely no text, letters, watermark or logo.');
  var thu = thuMucCon_(p.ma + '_anh_goc');
  var f = thu.createFile(anh.setName(p.ma + '_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss') + '.png'));
  themDong_(p.ma, '', o.tieu_de, lamSach_(o.bai_viet), f.getId(), '');
  if (nguon) danhDauNguonCi_(nguon.row);
  ghiLog_(p.ma, 'viết + vẽ: ' + o.tieu_de, 'OK');
  return true;
}

function themDong_(ma, so, tieuDe, noiDung, anhGoc, chu) {
  var r = new Array(BAI_COLS.length).fill('');
  r[C['Page'] - 1] = ma; r[C['Số'] - 1] = so; r[C['Tiêu đề'] - 1] = tieuDe; r[C['Trạng thái'] - 1] = canDuyet_(ma) ? 'Chờ duyệt' : 'Chờ ghép';
  r[C['Nội dung'] - 1] = ganChan_(ma, noiDung); r[C['Ảnh gốc'] - 1] = anhGoc; r[C['Chữ trong ảnh'] - 1] = chu;
  r[C['Lần ghép'] - 1] = 0; r[C['Tạo lúc'] - 1] = new Date();
  bangBai_().appendRow(r);
}
/** Ảnh thu nhỏ ~1280px để gửi Gemini cho nhanh (ảnh gốc vẫn giữ nguyên để đăng). */
function anhNho_(f) {
  try {
    var r = UrlFetchApp.fetch('https://drive.google.com/thumbnail?sz=w1280&id=' + f.getId(), {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200 && /image/.test(r.getHeaders()['Content-Type'] || '')) return r.getBlob();
  } catch (e) {}
  var b = f.getBlob(); if (b.getBytes().length > 15e6) throw new Error('Ảnh quá nặng: ' + f.getName());
  return b;
}
/** Page chỉ đăng ẢNH, không làm video (CaiDat KHONG_VIDEO, mặc định HOA). */
function khongVideo_(ma) {
  var s = cfg_('KHONG_VIDEO') || 'HOA';
  return s.split(',').map(function (x) { return x.trim().toUpperCase(); }).indexOf(String(ma).toUpperCase()) >= 0;
}
/** Gắn đoạn cuối cố định (CaiDat CHAN_BAI_<MÃ>): hashtag + địa chỉ + SĐT. Bỏ hashtag Gemini tự thêm để khỏi trùng. */
function ganChan_(ma, t) {
  var chan = cfg_('CHAN_BAI_' + String(ma).toUpperCase());
  if (!chan) return t;
  var dong = String(t).split('\n');
  while (dong.length && /^\s*(#\S+\s*)*$/.test(dong[dong.length - 1])) dong.pop();
  return dong.join('\n').trim() + '\n\n' + chan.replace(/\\n/g, '\n');
}
function canDuyet_(ma) {
  return cfg_('DUYET_TRUOC').split(',').map(function (x) { return x.trim().toUpperCase(); }).indexOf(String(ma).toUpperCase()) >= 0;
}
function nhacDuyet_() {
  if (cfg_('TG_TOKEN') && cfg_('TG_CHAT_ID')) return;   // đã duyệt qua Telegram
  var v = bangBai_().getDataRange().getValues(), n = 0;
  for (var i = 1; i < v.length; i++) if (v[i][C['Trạng thái'] - 1] === 'Chờ duyệt') n++;
  if (!n) return;
  var hom = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), pr = PropertiesService.getScriptProperties();
  if (pr.getProperty('NHAC_DUYET') === hom) return;
  pr.setProperty('NHAC_DUYET', hom);
  canhBao_('Có ' + n + ' bài đang CHỜ DUYỆT. Anh mở trang Bai, đọc cột Nội dung (sửa trực tiếp nếu muốn), rồi đổi cột Trạng thái thành "Duyệt" (hoặc "Bỏ"). ' +
    SpreadsheetApp.getActive().getUrl() + '#gid=' + bangBai_().getSheetId());
}
function tieuDeDaCo_(ma) {
  var v = bangBai_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) if (v[i][C['Page'] - 1] === ma) out.push(String(v[i][C['Tiêu đề'] - 1]));
  return out;
}
function layNguonCi_() {
  var s = SpreadsheetApp.getActive().getSheetByName(SH.CI); if (!s || s.getLastRow() < 2) return null;
  var v = s.getRange(2, 1, s.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() && !v[i][1]) return { row: i + 2, text: String(v[i][0]) };
  return null;
}
function danhDauNguonCi_(row) { SpreadsheetApp.getActive().getSheetByName(SH.CI).getRange(row, 2).setValue(new Date()); }
function thuMucCon_(ten) {
  var cha = thuMucXuat_(), it = cha.getFoldersByName(ten);
  return it.hasNext() ? it.next() : cha.createFolder(ten);
}
function lamSach_(t) {
  return String(t).replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '')
    .replace(/(^|\s)(BeGoTrenSong|HocCungCiNhe|ChuyenHoaThaiBinh|HoaTuoiThaiBinh)/g, function (m0, a, b) { return a + '#' + b; }).replace(/##/g, '#').trim();
}

/* ============================ GEMINI ============================ */
function goiGemini_(model, body) {
  var key = cfg_('GEMINI_KEY'); if (!key) throw new Error('Chưa điền GEMINI_KEY');
  var loi = '';
  for (var t = 0; t < 4; t++) {
    var t0 = Date.now();
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body) });
    var code = res.getResponseCode(), giay = Math.round((Date.now() - t0) / 1000);
    if (code !== 200 || giay > 40) ghiLog_('-', 'Gemini ' + model, 'mã ' + code + ' sau ' + giay + 's' + (code !== 200 ? ': ' + res.getContentText().substring(0, 300) : ''));
    if (code === 400 && body.generationConfig && body.generationConfig.thinkingConfig) {   // mẫu không hỗ trợ chỉnh mức "suy nghĩ"
      delete body.generationConfig.thinkingConfig; continue;
    }
    if (code === 429) throw new Error('HET_LUOT ' + model);   // hết lượt miễn phí của mẫu này → đổi mẫu khác
    if (code >= 500) { loi = 'mã ' + code; Utilities.sleep(8000 * (t + 1)); continue; }
    var j = JSON.parse(res.getContentText());
    if (code !== 200) throw new Error('Gemini ' + code + ': ' + (j.error ? j.error.message : '').substring(0, 250));
    return j;
  }
  throw new Error('Gemini quá tải (' + loi + '), sẽ thử lại lượt sau');
}
function briefCua_(p) {
  var c = CacheService.getScriptCache(), k = 'brief_' + p.brief, b = c.get(k);
  if (b) return b;
  b = p.brief ? DriveApp.getFileById(p.brief).getBlob().getDataAsString('UTF-8') : '';
  c.put(k, b.substring(0, 90000), 21600); return b;
}
function textGemini_(p, parts, json) {
  var gc = { temperature: 0.85, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'low' } };
  if (json) gc.responseMimeType = 'application/json';
  var body = { systemInstruction: { parts: [{ text: 'Bạn viết nội dung cho page "' + p.ten + '". Tuân thủ tuyệt đối brief sau:\n\n' + briefCua_(p) }] },
    contents: [{ role: 'user', parts: parts }], generationConfig: gc };
  // Mẫu chính + mẫu dự phòng (CaiDat GEMINI_DU_PHONG). Mẫu nào hết lượt hôm nay thì nhớ lại, bỏ qua tới hết ngày.
  var ds = [cfg_('GEMINI_TEXT_MODEL') || 'gemini-3.5-flash'].concat((cfg_('GEMINI_DU_PHONG') || 'gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-3.1-flash-lite').split(','))
    .map(function (x) { return x.trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  var c = CacheService.getScriptCache(), hom = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd'), j = null, loiCuoi = '';
  for (var m = 0; m < ds.length && !j; m++) {
    if (c.get('HETLUOT_' + hom + '_' + ds[m])) continue;
    try { j = goiGemini_(ds[m], JSON.parse(JSON.stringify(body))); }
    catch (e) {
      loiCuoi = e.message;
      if (/HET_LUOT/.test(e.message)) { c.put('HETLUOT_' + hom + '_' + ds[m], '1', 3600); continue; }   // khóa 1 tiếng rồi thử lại
      if (/quá tải|404|not found/i.test(e.message)) continue;
      throw e;
    }
  }
  if (!j) throw new Error('Các mẫu Gemini đều hết lượt/quá tải (' + loiCuoi + '), lượt sau máy thử lại');
  var ps = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  var t = ps.map(function (x) { return x.text || ''; }).join('').trim();
  if (!t) throw new Error('Gemini không trả nội dung');
  return t;
}
function jsonGemini_(p, parts) {
  var t = textGemini_(p, parts, true);
  return JSON.parse(t.replace(/^```(json)?/i, '').replace(/```$/, '').trim());
}
function mauVeAnh_() {
  var m = cfg_('GEMINI_IMAGE_MODEL'); if (m) return m;
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': cfg_('GEMINI_KEY') }, muteHttpExceptions: true });
  var ds = (JSON.parse(res.getContentText()).models || []).filter(function (x) {
    return /image/i.test(x.name) && /gemini/i.test(x.name) && (x.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
  }).map(function (x) { return x.name.replace('models/', ''); });
  if (!ds.length) throw new Error('Không tìm thấy mẫu Gemini vẽ ảnh cho mã API này');
  ds.sort(function (a, b) { return (/preview|exp/.test(a) ? 1 : 0) - (/preview|exp/.test(b) ? 1 : 0) || b.localeCompare(a); });
  datCfg_('GEMINI_IMAGE_MODEL', ds[0]);
  return ds[0];
}
function veAnh_(prompt) {
  var body = { contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '2:3' } } };
  var j;
  try { j = goiGemini_(mauVeAnh_(), body); }
  catch (e) { if (!/imageConfig|aspect/i.test(e.message)) throw e; delete body.generationConfig.imageConfig; j = goiGemini_(mauVeAnh_(), body); }
  var ps = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  for (var i = 0; i < ps.length; i++) {
    var d = ps[i].inlineData || ps[i].inline_data;
    if (d && d.data) return Utilities.newBlob(Utilities.base64Decode(d.data), d.mimeType || d.mime_type || 'image/png');
  }
  throw new Error('Gemini không trả ảnh (kiểm tra đã bật thanh toán cho mã Gemini chưa)');
}

/* ============================ GHÉP ẢNH/VIDEO (GitHub Actions) ============================ */
function guiGhep_(t0) {
  var s = bangBai_(), v = s.getDataRange().getValues(), pages = {};
  cacPage_().forEach(function (p) { pages[p.ma] = p; });
  for (var i = 1; i < v.length && Date.now() - t0 < HET_GIO; i++) {
    var tt = v[i][C['Trạng thái'] - 1], row = i + 1;
    if (khongVideo_(v[i][C['Page'] - 1])) continue;   // page chỉ đăng ảnh (Hoa): không ghép video
    var coVideo = !!v[i][C['Video'] - 1], coJob = !!v[i][C['Job'] - 1];
    var guiLuc = new Date(v[i][C['Đăng lúc'] - 1] || 0).getTime(), lau = Date.now() - guiLuc > 30 * 60 * 1000;
    var tre = (tt === 'Đang ghép' || ((tt === 'Chờ duyệt' || tt === 'Duyệt') && coJob && !coVideo)) && lau;
    var moi = tt === 'Chờ ghép' || ((tt === 'Chờ duyệt' || tt === 'Duyệt') && !coJob && !coVideo);
    if (!moi && !tre) continue;
    var lan = Number(v[i][C['Lần ghép'] - 1]) || 0;
    if (lan >= 3) { s.getRange(row, C['Trạng thái']).setValue('Lỗi'); s.getRange(row, C['Ghi chú']).setValue('Ghép video thất bại 3 lần');
      canhBao_('Bài "' + v[i][C['Tiêu đề'] - 1] + '": ghép video thất bại 3 lần.'); continue; }
    var p = pages[v[i][C['Page'] - 1]]; if (!p) continue;
    try {
      var job = Utilities.getUuid(), token = Utilities.getUuid();
      var anh = DriveApp.getFileById(v[i][C['Ảnh gốc'] - 1]); congKhai_(anh);
      var logoUrl = '';
      if (/^https?:/.test(p.logo)) logoUrl = p.logo;
      else if (p.logo) { congKhai_(DriveApp.getFileById(p.logo)); logoUrl = linkTai_(p.logo); }
      var res = UrlFetchApp.fetch('https://api.github.com/repos/' + cfg_('GITHUB_REPO') + '/dispatches', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + cfg_('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' },
        payload: JSON.stringify({ event_type: 'render', client_payload: {
          job: job, token: token, image_url: linkTai_(anh.getId()), logo_url: logoUrl,
          title: String(v[i][C['Tiêu đề'] - 1]), style: p.kieu, extra_urls: p.kieu === 'hoa' ? anhCungAlbum_(anh, 4) : [], music_url: nhacNen_(), callback: cfg_('WEBAPP_URL') || ScriptApp.getService().getUrl() } }) });
      if (res.getResponseCode() !== 204) throw new Error('GitHub ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200));
      PropertiesService.getScriptProperties().setProperty('JOB_' + job, token);
      s.getRange(row, C['Job']).setValue(job);
      s.getRange(row, C['Lần ghép']).setValue(lan + 1);
      if (tt === 'Chờ ghép' || tt === 'Đang ghép') s.getRange(row, C['Trạng thái']).setValue('Đang ghép');   // bài chờ duyệt giữ nguyên trạng thái
      s.getRange(row, C['Đăng lúc']).setValue(new Date());
    } catch (e) {
      s.getRange(row, C['Ghi chú']).setValue(e.message); ghiLog_(p.ma, 'gửi ghép', 'LỖI: ' + e.message);
      canhBaoMotLan_('GHEP_' + e.message.substring(0, 40), 'Không gửi được ảnh đi ghép video: ' + e.message);
      return;
    }
  }
}
/** Lấy thêm tối đa n ảnh khác trong cùng album để làm video lướt nhiều ảnh. */
function anhCungAlbum_(anh, n) {
  var out = [];
  try {
    var it = anh.getParents(); if (!it.hasNext()) return out;
    var fs = it.next().getFiles(), ds = [];
    while (fs.hasNext()) { var f = fs.next(); if (f.getId() !== anh.getId() && f.getMimeType().indexOf('image/') === 0) ds.push(f); }
    for (var i = ds.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = ds[i]; ds[i] = ds[j]; ds[j] = t; }
    ds.slice(0, n).forEach(function (f) { congKhai_(f); out.push(linkTai_(f.getId())); });
  } catch (e) { ghiLog_('-', 'ảnh cùng album', 'LỖI: ' + e.message); }
  return out;
}
function nhacNen_() {
  var id = idTu_(cfg_('NHAC_NEN')); if (!id) return '';
  try {
    var fs = DriveApp.getFolderById(id).getFiles(), ds = [];
    while (fs.hasNext()) { var f = fs.next(); if (/audio|mpeg/.test(f.getMimeType()) || /\.mp3$/i.test(f.getName())) ds.push(f); }
    if (!ds.length) return '';
    var f0 = ds[Math.floor(Math.random() * ds.length)]; congKhai_(f0); return linkTai_(f0.getId());
  } catch (e) { return ''; }
}
function congKhai_(f) {
  if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}
function linkTai_(id) { return 'https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t'; }

/** Nhận kết quả từ GitHub Actions. */
function doPost(e) {
  if (e && e.parameter && e.parameter.tg) return nhanTelegram_(e);
  try {
    var d = JSON.parse(e.postData.contents), props = PropertiesService.getScriptProperties();
    var tk = props.getProperty('JOB_' + d.job);
    if (!tk || tk !== d.token) return ContentService.createTextOutput('sai job');
    var s = bangBai_(), v = s.getRange(1, C['Job'], s.getLastRow(), 1).getValues(), row = -1;
    for (var i = 1; i < v.length; i++) if (v[i][0] === d.job) { row = i + 1; break; }
    if (row < 0) return ContentService.createTextOutput('không thấy dòng');
    var ma = s.getRange(row, C['Page']).getValue(), thu = thuMucCon_(ma + '_xuat_ban');
    var ten = ma + '_' + (s.getRange(row, C['Số']).getValue() || row);
    var fa = thu.createFile(Utilities.newBlob(Utilities.base64Decode(d.image_b64), 'image/jpeg', ten + '.jpg'));
    var fv = thu.createFile(Utilities.newBlob(Utilities.base64Decode(d.video_b64), 'video/mp4', ten + '.mp4'));
    congKhai_(fv);
    s.getRange(row, C['Ảnh đăng']).setValue(fa.getId());
    s.getRange(row, C['Video']).setValue(fv.getId());
    if (s.getRange(row, C['Trạng thái']).getValue() !== 'Chờ duyệt') s.getRange(row, C['Trạng thái']).setValue('Sẵn sàng');
    s.getRange(row, C['Đăng lúc']).setValue('');
    props.deleteProperty('JOB_' + d.job);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    ghiLog_('-', 'nhận video', 'LỖI: ' + err.message);
    return ContentService.createTextOutput('lỗi: ' + err.message);
  }
}

/* ============================ ĐĂNG BÀI ============================ */
function dangDong_(row, p) {
  var s = bangBai_(), g = function (k) { return s.getRange(row, C[k]).getValue(); };
  var noiDung = String(g('Nội dung')), tieuDe = String(g('Tiêu đề')), loi = [];
  // Facebook
  if (!g('Facebook') && p.fbId) {
    try { s.getRange(row, C['Facebook']).setValue(dangFB_(p, noiDung, DriveApp.getFileById(g('Ảnh đăng') || g('Ảnh gốc')).getBlob())); }
    catch (e) { loi.push('Facebook: ' + e.message); }
  }
  // YouTube Shorts
  if (!g('YouTube') && p.ytToken && g('Video')) {
    try { s.getRange(row, C['YouTube']).setValue(dangYT_(p, tieuDe, noiDung, DriveApp.getFileById(g('Video')).getBlob())); }
    catch (e) { loi.push('YouTube: ' + e.message); }
  }
  // TikTok qua Buffer
  if (!g('TikTok') && p.buffer && (g('Video') || khongVideo_(p.ma))) {
    try { s.getRange(row, C['TikTok']).setValue(dangTikTok_(p, tieuDe, noiDung, g('Video'), g('Ảnh gốc'))); }
    catch (e) { loi.push('TikTok: ' + e.message); }
  }
  s.getRange(row, C['Đăng lúc']).setValue(new Date());
  if (loi.length) {
    s.getRange(row, C['Trạng thái']).setValue('Lỗi'); s.getRange(row, C['Ghi chú']).setValue(loi.join(' | '));
    canhBao_(p.ten + ' — bài "' + tieuDe + '" đăng lỗi:\n' + loi.join('\n') + '\n\nMở bảng, menu "Thử đăng lại các bài Lỗi" sau khi sửa.');
  } else {
    s.getRange(row, C['Trạng thái']).setValue('Đã đăng'); s.getRange(row, C['Ghi chú']).setValue('');
  }
  ghiLog_(p.ma, 'đăng: ' + tieuDe, loi.length ? 'LỖI: ' + loi.join(' | ') : 'OK');
}

function dangFB_(p, msg, blob) {
  var res = UrlFetchApp.fetch('https://graph.facebook.com/' + (cfg_('GRAPH_VERSION') || 'v21.0') + '/' + p.fbId + '/photos', {
    method: 'post', muteHttpExceptions: true, payload: { source: blob, message: msg, access_token: p.fbToken } });
  var j = JSON.parse(res.getContentText());
  if (j.error) throw new Error(j.error.message);
  return 'https://www.facebook.com/' + (j.post_id || j.id);
}

function tokenYT_(p) {
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true, payload: {
    client_id: cfg_('YT_CLIENT_ID'), client_secret: cfg_('YT_CLIENT_SECRET'), refresh_token: p.ytToken, grant_type: 'refresh_token' } });
  var j = JSON.parse(res.getContentText());
  if (!j.access_token) throw new Error('mất kết nối YouTube (' + (j.error_description || j.error) + ') — bấm lại link kết nối YouTube');
  return j.access_token;
}
function dangYT_(p, tieuDe, moTa, blob) {
  var at = tokenYT_(p);
  var meta = { snippet: { title: (tieuDe.substring(0, 90) + ' #shorts'), description: moTa.substring(0, 4900), categoryId: p.ytCat },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } };
  var r1 = UrlFetchApp.fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + at, 'X-Upload-Content-Type': 'video/mp4' }, payload: JSON.stringify(meta) });
  var loc = r1.getHeaders()['Location'] || r1.getHeaders()['location'];
  if (!loc) throw new Error('không tạo được phiên tải lên: ' + r1.getContentText().substring(0, 200));
  var r2 = UrlFetchApp.fetch(loc, { method: 'put', contentType: 'video/mp4', payload: blob.getBytes(), muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + at } });
  var j = JSON.parse(r2.getContentText());
  if (!j.id) throw new Error(r2.getContentText().substring(0, 200));
  return 'https://youtube.com/shorts/' + j.id;
}

function dangTikTok_(p, tieuDe, noiDung, videoId, anhId) {
  var q = 'mutation($i: CreatePostInput!){ createPost(input:$i){ __typename ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }';
  var bien = { i: { channelId: p.buffer, text: noiDung.substring(0, 2100), mode: 'shareNow', schedulingType: 'automatic',
    assets: videoId ? [{ video: { url: linkTai_(videoId) } }] : [{ image: { url: (function () { congKhai_(DriveApp.getFileById(anhId)); return linkTai_(anhId); })() } }],
    metadata: { tiktok: { title: tieuDe.substring(0, 90), isAiGenerated: p.nguon === 'TU_TAO' } } } };   // không có video (page Hoa) → đăng TikTok chế độ ảnh
  var res = UrlFetchApp.fetch(cfg_('BUFFER_API') || 'https://api.buffer.com', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + cfg_('BUFFER_KEY') }, payload: JSON.stringify({ query: q, variables: bien }) });
  var j = JSON.parse(res.getContentText());
  if (j.errors) throw new Error(j.errors[0].message);
  var kq = j.data && j.data.createPost;
  if (!kq || kq.__typename !== 'PostActionSuccess') throw new Error((kq && kq.message) || res.getContentText().substring(0, 200));
  return 'buffer:' + kq.post.id;
}

function dangNgay() {
  cacPage_().filter(function (p) { return p.bat; }).forEach(function (p) {
    var r = dongTiepTheo_(p.ma, 'Sẵn sàng');
    if (r > 0) dangDong_(r, p);
  });
  bao_('Đã chạy đăng ngay. Xem cột Facebook/YouTube/TikTok trong trang Bai.');
}
function thuLaiLoi() {
  var pages = {}; cacPage_().forEach(function (p) { pages[p.ma] = p; });
  var s = bangBai_(), v = s.getDataRange().getValues(), n = 0;
  for (var i = 1; i < v.length; i++) {
    if (v[i][C['Trạng thái'] - 1] !== 'Lỗi') continue;
    var p = pages[v[i][C['Page'] - 1]]; if (!p) continue;
    if (!v[i][C['Video'] - 1]) { s.getRange(i + 1, C['Trạng thái']).setValue('Chờ ghép'); s.getRange(i + 1, C['Lần ghép']).setValue(0); }
    else dangDong_(i + 1, p);
    n++;
  }
  bao_('Đã thử lại ' + n + ' bài.');
}

/* ============================ YOUTUBE: KẾT NỐI TỪNG KÊNH ============================ */
function doGet(e) {
  var q = e.parameter || {}, url = ScriptApp.getService().getUrl();
  if (q.code && q.state) {
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true, payload: {
      code: q.code, client_id: cfg_('YT_CLIENT_ID'), client_secret: cfg_('YT_CLIENT_SECRET'), redirect_uri: url, grant_type: 'authorization_code' } });
    var j = JSON.parse(res.getContentText());
    if (!j.refresh_token) return HtmlService.createHtmlOutput('<h2>Chưa được</h2><p>' + res.getContentText() + '</p>');
    var pg = SpreadsheetApp.getActive().getSheetByName(SH.PAGE);
    cacPage_().forEach(function (p) { if (p.ma === q.state) pg.getRange(p.row, P['YouTube refresh token'] + 1).setValue(j.refresh_token); });
    return HtmlService.createHtmlOutput('<h2 style="font-family:sans-serif">✅ Đã kết nối YouTube cho ' + q.state + '</h2><p style="font-family:sans-serif">Anh đóng trang này được rồi.</p>');
  }
  if (q.ketnoi) {
    var auth = 'https://accounts.google.com/o/oauth2/v2/auth?' + [
      'client_id=' + encodeURIComponent(cfg_('YT_CLIENT_ID')), 'redirect_uri=' + encodeURIComponent(url),
      'response_type=code', 'access_type=offline', 'prompt=consent select_account'.replace(' ', '%20'),
      'scope=' + encodeURIComponent('https://www.googleapis.com/auth/youtube.upload'), 'state=' + encodeURIComponent(q.ketnoi)].join('&');
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;font-size:20px">Kết nối kênh YouTube của <b>' + q.ketnoi +
      '</b>.<br>Đăng nhập đúng Gmail của kênh đó.</p><p><a style="font-size:22px" target="_top" href="' + auth + '">👉 Bấm vào đây</a></p>');
  }
  return HtmlService.createHtmlOutput('Trung tâm 3 page đang chạy.');
}
function hienLinkYouTube() {
  var url = ScriptApp.getService().getUrl();
  if (!url) { bao_('Chưa triển khai Ứng dụng web. Làm bước "Triển khai" trước.'); return; }
  var html = '<div style="font-family:sans-serif">Mở từng link, đăng nhập đúng Gmail của kênh:<br><br>' +
    cacPage_().map(function (p) { return '• <a target="_blank" href="' + url + '?ketnoi=' + p.ma + '">' + p.ten + '</a>'; }).join('<br><br>') +
    '<br><br><small>Redirect URI để dán vào Google Cloud:<br><code>' + url + '</code></small></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(320), 'Kết nối YouTube');
}

/* ============================ KIỂM TRA & BÁO ============================ */
function kiemTraKetNoi() {
  var kq = [];
  try { textGemini_({ ten: 'test', brief: '' }, [{ text: 'Trả lời đúng 1 chữ: OK' }]); kq.push('✅ Gemini viết bài'); } catch (e) { kq.push('❌ Gemini: ' + e.message); }
  try { kq.push('✅ Mẫu vẽ ảnh: ' + mauVeAnh_()); } catch (e) { kq.push('❌ Vẽ ảnh: ' + e.message); }
  try {
    var g = UrlFetchApp.fetch('https://api.github.com/repos/' + cfg_('GITHUB_REPO'), { muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + cfg_('GITHUB_TOKEN') } });
    kq.push(g.getResponseCode() === 200 ? '✅ GitHub' : '❌ GitHub ' + g.getResponseCode());
  } catch (e) { kq.push('❌ GitHub: ' + e.message); }
  kq.push(ScriptApp.getService().getUrl() ? '✅ Ứng dụng web đã triển khai' : '❌ Chưa triển khai Ứng dụng web');
  cacPage_().forEach(function (p) {
    if (!p.bat) return;
    var t = [];
    if (p.fbId) { try { var r = JSON.parse(UrlFetchApp.fetch('https://graph.facebook.com/' + (cfg_('GRAPH_VERSION') || 'v21.0') + '/' + p.fbId + '?fields=name&access_token=' + encodeURIComponent(p.fbToken), { muteHttpExceptions: true }).getContentText());
      t.push(r.name ? 'FB ✅' : 'FB ❌ ' + (r.error ? r.error.message : '')); } catch (e) { t.push('FB ❌'); } } else t.push('FB (chưa nối)');
    if (p.ytToken) { try { tokenYT_(p); t.push('YouTube ✅'); } catch (e) { t.push('YouTube ❌'); } } else t.push('YouTube (chưa nối)');
    t.push(p.buffer ? 'TikTok/Buffer: có ID' : 'TikTok (chưa nối)');
    if (p.kieu === 'ci' && !p.logo) t.push('⚠️ thiếu logo Ci');
    kq.push(p.ten + ': ' + t.join(' · '));
  });
  bao_(kq.join('\n'));
}
function tongKet_() {
  var hom = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty('TONGKET') === hom) return;
  var v = bangBai_().getDataRange().getValues(), dem = {};
  for (var i = 1; i < v.length; i++) {
    var ma = v[i][C['Page'] - 1]; dem[ma] = dem[ma] || { dang: 0, kho: 0, loi: 0 };
    var tt = v[i][C['Trạng thái'] - 1], d = v[i][C['Đăng lúc'] - 1];
    if (tt === 'Đã đăng' && d && Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd') === hom) dem[ma].dang++;
    if (tt === 'Sẵn sàng' || tt === 'Chờ ghép' || tt === 'Đang ghép') dem[ma].kho++;
    if (tt === 'Lỗi') dem[ma].loi++;
  }
  var txt = Object.keys(dem).map(function (k) { return k + ': đăng ' + dem[k].dang + ' · kho ' + dem[k].kho + ' · lỗi ' + dem[k].loi; }).join('\n');
  MailApp.sendEmail(cfg_('EMAIL_BAO'), '🪵 Tổng kết đăng bài ' + hom, txt + '\n\nBảng: ' + SpreadsheetApp.getActive().getUrl());
  pr.setProperty('TONGKET', hom);
}
function canhBao_(msg) {
  try { MailApp.sendEmail(cfg_('EMAIL_BAO'), '⚠️ Trung tâm 3 page: cần anh xem', msg + '\n\nBảng: ' + SpreadsheetApp.getActive().getUrl()); } catch (e) {}
  try { if (cfg_('TG_TOKEN') && cfg_('TG_CHAT_ID')) tg_('sendMessage', { chat_id: cfg_('TG_CHAT_ID'), text: '⚠️ ' + msg }); } catch (e) {}
}
function canhBaoMotLan_(khoa, msg) {
  var c = CacheService.getScriptCache(); if (c.get(khoa)) return; c.put(khoa, '1', 6 * 3600); canhBao_(msg);
}
function ghiLog_(page, viec, kq) {
  var s = SpreadsheetApp.getActive().getSheetByName(SH.LOG); if (!s) return;
  s.appendRow([new Date(), page, viec, kq]);
  if (s.getLastRow() > 2000) s.deleteRows(2, 500);
}
function bao_(msg) {
  try { ghiLog_('-', 'thông báo', msg); } catch (e) {}
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}


/* ============================ FACEBOOK: LẤY MÃ 3 PAGE ============================ */
function chuanHoa_(t) {
  return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
/** Anh dán 1 mã người dùng (đã Extend) vào CaiDat ô FB_USER_TOKEN, chạy hàm này: máy tự điền ID + mã cho 3 page. */
function layMaFacebook() {
  var ut = cfg_('FB_USER_TOKEN');
  if (!ut) { datCfg_('FB_USER_TOKEN', ''); bao_('Anh dán mã người dùng Facebook vào ô FB_USER_TOKEN (trang CaiDat) rồi chạy lại.'); return; }
  var ver = cfg_('GRAPH_VERSION') || 'v21.0';
  var res = UrlFetchApp.fetch('https://graph.facebook.com/' + ver + '/me/accounts?fields=id,name,access_token&limit=100&access_token=' + encodeURIComponent(ut), { muteHttpExceptions: true });
  var j = JSON.parse(res.getContentText());
  if (j.error) { bao_('Facebook báo lỗi: ' + j.error.message); return; }
  var ds = j.data || [], pg = SpreadsheetApp.getActive().getSheetByName(SH.PAGE), kq = [];
  cacPage_().forEach(function (p) {
    var ten = chuanHoa_(p.ten), hit = null;
    ds.forEach(function (x) { if (!hit && p.fbId && String(x.id) === p.fbId) hit = x; });
    ds.forEach(function (x) { var n = chuanHoa_(x.name); if (!hit && (n === ten || n.indexOf(ten) >= 0 || ten.indexOf(n) >= 0)) hit = x; });
    if (!hit && p.fbId) {   // page thuộc Business: hỏi thẳng theo ID
      var r2 = JSON.parse(UrlFetchApp.fetch('https://graph.facebook.com/' + ver + '/' + p.fbId + '?fields=id,name,access_token&access_token=' + encodeURIComponent(ut), { muteHttpExceptions: true }).getContentText());
      if (r2.access_token) hit = r2; else if (r2.error) kq.push('⚠️ ' + p.ten + ': ' + r2.error.message);
    }
    if (hit) {
      pg.getRange(p.row, P['FB Page ID'] + 1).setValue(hit.id);
      pg.getRange(p.row, P['FB Token'] + 1).setValue(hit.access_token);
      kq.push('✅ ' + p.ten + ' ← ' + hit.name);
    } else kq.push('❌ ' + p.ten + ': không thấy page trùng tên');
  });
  datCfg_('FB_USER_TOKEN', '');
  bao_(kq.join('\n') + '\n\nCác page Facebook tìm thấy: ' + ds.map(function (x) { return x.name; }).join(', '));
}

/** Chẩn đoán nhanh mã Gemini: ghi kết quả vào trang NhatKy. */
function chanDoanGemini() {
  var key = cfg_('GEMINI_KEY'), out = [];
  var r1 = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  var ms = []; try { ms = (JSON.parse(r1.getContentText()).models || []).map(function (x) { return x.name.replace('models/', ''); }); } catch (e) {}
  out.push('models ' + r1.getResponseCode() + ': ' + (ms.length ? ms.filter(function (n) { return /flash|image/.test(n); }).join(', ') : r1.getContentText().substring(0, 300)));
  var r2 = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (cfg_('GEMINI_TEXT_MODEL') || 'gemini-flash-latest') + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Trả lời: OK' }] }] }) });
  out.push('text ' + r2.getResponseCode() + ': ' + r2.getContentText().substring(0, 400));
  ghiLog_('-', 'chẩn đoán Gemini', out.join(' || '));
}


/* ============================ TELEGRAM: DUYỆT BÀI TRÊN ĐIỆN THOẠI ============================ */
function tg_(method, payload, multipart) {
  var o = { method: 'post', muteHttpExceptions: true, payload: multipart ? payload : JSON.stringify(payload) };
  if (!multipart) o.contentType = 'application/json';
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg_('TG_TOKEN') + '/' + method, o);
  var j = JSON.parse(r.getContentText());
  if (!j.ok) throw new Error('Telegram ' + method + ': ' + j.description);
  return j.result;
}
function ketNoiTelegram() {
  if (!cfg_('TG_TOKEN')) { datCfg_('TG_TOKEN', ''); bao_('Anh dán mã bot (từ @BotFather) vào ô TG_TOKEN trang CaiDat rồi bấm lại.'); return; }
  PropertiesService.getScriptProperties().deleteProperty('TG_HOOK');
  damBaoWebhook_();
  bao_('Đã nối Telegram. Anh mở bot trên Telegram, bấm Bắt đầu (/start) là xong.');
}
function damBaoWebhook_() {
  var tk = cfg_('TG_TOKEN'); if (!tk) return;
  if (!cfg_('TG_SECRET')) datCfg_('TG_SECRET', Utilities.getUuid().replace(/-/g, ''));
  var url = (cfg_('WEBAPP_URL') || ScriptApp.getService().getUrl()) + '?tg=' + cfg_('TG_SECRET');
  var pr = PropertiesService.getScriptProperties(), dau = tk.substring(0, 12) + '|' + url;
  if (pr.getProperty('TG_HOOK') === dau) return;
  tg_('setWebhook', { url: url, allowed_updates: ['message', 'callback_query'] });
  pr.setProperty('TG_HOOK', dau);
  ghiLog_('-', 'Telegram', 'đã đặt webhook');
}
function nutDuyet_() {
  return { inline_keyboard: [[{ text: '✅ Duyệt', callback_data: 'D' }, { text: '🔄 Viết lại', callback_data: 'L' }],
    [{ text: '⛔ Không đăng khung này', callback_data: 'K' }]] };
}
/** Gửi các bài Hoa đang Chờ duyệt (chưa gửi) về Telegram. Tối CN 18h–22h thì giữ lại, 22h gửi cả tuần. */
function guiTelegram_() {
  var chat = cfg_('TG_CHAT_ID'); if (!cfg_('TG_TOKEN') || !chat || dangGiuGui_()) return;
  var s = bangBai_(), v = s.getDataRange().getValues(), n = 0, t0 = Date.now();
  var ds = [];
  for (var i = 1; i < v.length; i++)
    if (v[i][C['Trạng thái'] - 1] === 'Chờ duyệt' && !v[i][C['TG'] - 1] && v[i][C['Lịch đăng'] - 1] && v[i][C['Ảnh gốc'] - 1]) ds.push(i);
  ds.forEach(function (i) {
    if (Date.now() - t0 > 4 * 60 * 1000) return;
    var row = i + 1, kl = String(v[i][C['Lịch đăng'] - 1]), loai = String(v[i][C['Loại'] - 1]);
    var cd = String(v[i][C['Chữ trong ảnh'] - 1]).replace(/^.*Chủ đề:\s*/, '');
    try {
      tg_('sendPhoto', { chat_id: chat, photo: anhNho_(DriveApp.getFileById(v[i][C['Ảnh gốc'] - 1])), caption: '📅 ' + kl + ' · ' + loai }, true);
    } catch (e) { ghiLog_('HOA', 'TG gửi ảnh', 'LỖI: ' + e.message); }
    var m = tg_('sendMessage', { chat_id: chat, text: ('📅 ' + kl + ' · ' + loai + '\n💡 ' + cd + '\n━━━━━━━━━━\n' + v[i][C['Nội dung'] - 1]).substring(0, 4000),
      reply_markup: nutDuyet_() });
    s.getRange(row, C['TG']).setValue(m.message_id); n++;
  });
  if (n >= 3) tg_('sendMessage', { chat_id: chat, text: '📬 Em vừa gửi ' + n + ' bài. Anh duyệt từng bài ở trên, hoặc bấm nút dưới để duyệt hết các bài đang chờ.',
    reply_markup: { inline_keyboard: [[{ text: '✅ Duyệt tất cả bài đang chờ', callback_data: 'ALL' }]] } });
  if (n) ghiLog_('HOA', 'Telegram', 'đã gửi ' + n + ' bài');
}
function nhanTelegram_(e) {
  var ok = ContentService.createTextOutput('ok');
  try {
    if (e.parameter.tg !== cfg_('TG_SECRET')) return ok;
    var u = JSON.parse(e.postData.contents), c = CacheService.getScriptCache();
    if (c.get('tgu_' + u.update_id)) return ok; c.put('tgu_' + u.update_id, '1', 21600);
    var chat = cfg_('TG_CHAT_ID');
    if (u.message) {
      var id = String(u.message.chat.id);
      if (!chat) { datCfg_('TG_CHAT_ID', id); chat = id;
        tg_('sendMessage', { chat_id: id, text: '🌸 Đã kết nối! Từ giờ bài page Hoa sẽ gửi về đây để anh duyệt. Bài cả tuần gửi lúc 22h tối Chủ nhật; bài viết lại thì gửi ngay.' });
        guiTelegram_(); return ok; }
      if (id === chat) tg_('sendMessage', { chat_id: id, text: 'Em là bot duyệt bài page Hoa. Anh bấm nút dưới mỗi bài để Duyệt / Viết lại / Không đăng.' });
      return ok;
    }
    var q = u.callback_query; if (!q || String(q.message.chat.id) !== chat) return ok;
    var s = bangBai_(), v = s.getDataRange().getValues(), bao = '';
    if (q.data === 'ALL') {
      var n = 0;
      for (var i = 1; i < v.length; i++) if (v[i][C['Trạng thái'] - 1] === 'Chờ duyệt' && v[i][C['TG'] - 1]) {
        s.getRange(i + 1, C['Trạng thái']).setValue('Duyệt'); n++;
        try { tg_('editMessageReplyMarkup', { chat_id: chat, message_id: Number(v[i][C['TG'] - 1]), reply_markup: { inline_keyboard: [[{ text: '✅ Đã duyệt', callback_data: 'X' }]] } }); } catch (x) {}
      }
      bao = 'Đã duyệt ' + n + ' bài ✅';
    } else if (q.data !== 'X') {
      var row = -1;
      for (var j = 1; j < v.length; j++) if (String(v[j][C['TG'] - 1]) === String(q.message.message_id)) { row = j + 1; break; }
      if (row < 0) bao = 'Không thấy bài này trong bảng';
      else {
        var tt = s.getRange(row, C['Trạng thái']).getValue();
        if (tt === 'Đã đăng') bao = 'Bài này đã đăng rồi';
        else {
          var moi = { D: ['Duyệt', '✅ Đã duyệt', 'Đã duyệt ✅'], L: ['Bỏ', '🔄 Đang viết lại bài khác…', 'Máy sẽ viết bài khác cho khung này (~15 phút) 🔄'],
            K: ['Không đăng', '⛔ Không đăng khung này', 'Khung này sẽ không đăng ⛔'] }[q.data];
          s.getRange(row, C['Trạng thái']).setValue(moi[0]);
          tg_('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: moi[1], callback_data: 'X' }]] } });
          bao = moi[2];
        }
      }
    }
    tg_('answerCallbackQuery', { callback_query_id: q.id, text: bao || '' });
  } catch (err) { ghiLog_('-', 'Telegram nhận', 'LỖI: ' + err.message); }
  return ok;
}
