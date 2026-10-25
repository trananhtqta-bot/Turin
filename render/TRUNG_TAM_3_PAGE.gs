function chayChanDoan() { guiGhep_(Date.now()); }
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
  'Facebook', 'YouTube', 'TikTok', 'Ghi chú', 'Chữ trong ảnh', 'Job', 'Lần ghép', 'Tạo lúc'];
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
    if (gios.indexOf(gioNay) >= 0) {
      var khung = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd-HH');
      pages.forEach(function (p) {
        var key = 'DADANG_' + p.ma;
        if (PropertiesService.getScriptProperties().getProperty(key) === khung) return;
        var r = dongTiepTheo_(p.ma, 'Sẵn sàng');
        if (r > 0) { dangDong_(r, p); PropertiesService.getScriptProperties().setProperty(key, khung); }
        else canhBao_(p.ten + ': đến giờ đăng nhưng KHÔNG có bài sẵn sàng.');
      });
    }
    // 2) Gửi ảnh đi ghép / thử lại job bị treo
    guiGhep_(t0);
    // 3) Chuẩn bị bài mới cho đủ tồn kho
    pages.forEach(function (p) {
      while (Date.now() - t0 < HET_GIO && demKho_(p.ma) < TON_KHO) {
        if (!sanXuat_(p)) break;
      }
    });
    guiGhep_(t0);
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
var CHU_DE_HOA = [
  'GIỚI THIỆU MẪU (kiểu A): hoa gì, màu gì, cách gói/cắm, hợp dịp nào — đúng như trong ảnh',
  'BÌNH CHỌN / ĐỐ VUI: hỏi "bó này bạn tặng ai? A/B/C" hoặc đố đoán số bông / tên loài hoa, mời bình luận đáp án',
  'Ý NGHĨA LOÀI HOA chính trong ảnh: 3–4 ý ngắn, dễ nhớ, ít người biết',
  'Ý NGHĨA MÀU SẮC của bó hoa trong ảnh: màu này nói lên điều gì, hợp tặng ai',
  'HOA THEO DỊP SẮP TỚI: {DIP}. Gợi ý vì sao mẫu trong ảnh hợp dịp này, nhắc khéo đặt sớm',
  'GỢI Ý LỜI NHẮN GHI THIỆP: 3–4 câu ngắn để ghi thiệp kèm bó hoa này (cho mẹ, người yêu, thầy cô, bạn bè...), mời mọi người góp thêm câu',
  'GỢI Ý TẶNG AI: bó này hợp tặng mẹ / vợ / người yêu / cô giáo / đối tác thế nào, hỏi người đọc định tặng ai',
  'MẸO GIỮ HOA: nếu là hoa tươi thì 3–5 mẹo giữ tươi lâu; nếu là hoa sáp/hoa tiền/hoa bánh kẹo thì mẹo bảo quản cho bền đẹp'
];
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
function sanXuatTuAnhHoa_(p) {
  if (!p.thuMuc) return false;
  var dem = {}, demAlbum = {}, v = bangBai_().getDataRange().getValues(), soBai = 0;
  for (var i = 1; i < v.length; i++) if (v[i][C['Page'] - 1] === p.ma) {
    soBai++; var g = v[i][C['Ảnh gốc'] - 1]; dem[g] = (dem[g] || 0) + 1;
    var al = String(v[i][C['Chữ trong ảnh'] - 1]).replace(/^Album:\s*/, ''); demAlbum[al] = (demAlbum[al] || 0) + 1;
  }
  // Mỗi thư mục con = 1 album (Hoa tươi, Hoa sáp, Hoa bánh kẹo...). Ảnh để ngoài cùng tính là album "Hoa".
  var tq = Date.now(), goc = DriveApp.getFolderById(p.thuMuc), ds = [];
  function quet(folderId, ten) {
    var it = DriveApp.searchFiles("'" + folderId + "' in parents and mimeType contains 'image/' and trashed = false");
    while (it.hasNext()) { var f = it.next(), id = f.getId(); ds.push({ f: f, album: ten, n: dem[id] || 0, a: demAlbum[ten] || 0, r: Math.random() }); }
  }
  quet(goc.getId(), 'Hoa');
  var sub = goc.getFolders(); while (sub.hasNext()) { var fd = sub.next(); quet(fd.getId(), fd.getName().trim()); }
  if (!ds.length) { canhBaoMotLan_('HET_ANH_' + p.ma, p.ten + ': album ảnh hoa đang trống, anh thả ảnh vào nhé.'); return false; }
  // Ưu tiên ảnh chưa dùng; giữa các album thì xoay vòng album ít bài nhất để page đa dạng
  ds.sort(function (x, y) { return x.n - y.n || x.a - y.a || x.r - y.r; });
  if (ds[0].n > 0) canhBaoMotLan_('QUAYVONG_' + p.ma, p.ten + ': đã dùng hết ảnh mới, máy đang dùng lại ảnh cũ với góc viết khác. Anh thả thêm ảnh hoa nhé.');
  var chon = ds[0], f0 = chon.f;
  var blob = anhNho_(f0);
  ghiLog_(p.ma, 'chọn ảnh', ds.length + ' ảnh, quét ' + Math.round((Date.now() - tq) / 1000) + 's → ' + chon.album + '/' + f0.getName());
  var chuDe = CHU_DE_HOA[soBai % CHU_DE_HOA.length].replace('{DIP}', dipSapToi_());
  var kieuA = soBai % CHU_DE_HOA.length === 0;
  var daViet = tieuDeDaCo_(p.ma).slice(-40);
  var anh = { inlineData: { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) } };
  var o = jsonGemini_(p, [anh, { text:
    'Ảnh này là sản phẩm THẬT của tiệm, thuộc album: "' + chon.album + '".\n' +
    'Bước 1: nhìn kỹ và liệt kê đúng những gì thấy trong ảnh (loại hoa, màu, cách bó/cắm/trang trí, phụ kiện, chữ in trên sản phẩm nếu có).\n' +
    'Bước 2: viết 1 bài Facebook theo CHỦ ĐỀ: ' + chuDe + '.\n' +
    'Giọng văn và bố cục bắt chước mẫu ' + (kieuA ? 'A' : 'B') + ' đã duyệt trong brief. Mở đầu bằng 1 câu thật cuốn hút, viết sáng tạo, gần gũi, dễ đọc trên điện thoại, vài emoji 🌸💐✨ vừa phải. Kết bằng 1 câu hỏi/lời mời bình luận.\n' +
    'Chỉ nói về sản phẩm trong ảnh. KHÔNG bịa chuyện, nhân vật, lời thoại, giá, khuyến mãi.\n' +
    'KHÔNG viết hashtag, địa chỉ, số điện thoại (máy tự gắn đoạn cuối). Văn bản thuần, không dùng * hay #.\n' +
    'Nếu trên sản phẩm/ảnh có logo, chữ hoặc watermark tên TIỆM KHÁC thì đặt logo_tiem_khac = true.\n' +
    'Tiêu đề (tieu_de): câu ngắn 3–7 chữ, KHÔNG emoji. Không trùng: ' + JSON.stringify(daViet) + '\n' +
    'Trả JSON: {"thay_trong_anh": "<liệt kê ngắn>", "logo_tiem_khac": false, "tieu_de": "<tiêu đề>", "bai_viet": "<bài hoàn chỉnh>"}' }]);
  if (o.logo_tiem_khac === true || o.logo_tiem_khac === 'true') {
    themDong_(p.ma, '', '(ảnh có logo tiệm khác)', '', f0.getId(), 'Album: ' + chon.album);
    bangBai_().getRange(bangBai_().getLastRow(), C['Trạng thái']).setValue('Bỏ');
    ghiLog_(p.ma, 'bỏ ảnh ' + f0.getName(), 'có logo tiệm khác');
    return true;
  }
  if (!o.bai_viet) throw new Error('Gemini trả thiếu bài');
  themDong_(p.ma, '', o.tieu_de, lamSach_(o.bai_viet), f0.getId(), 'Album: ' + chon.album);
  ghiLog_(p.ma, 'viết bài (' + chon.album + ', chủ đề ' + (soBai % CHU_DE_HOA.length + 1) + '): ' + o.tieu_de, 'OK');
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
    if (code === 429 || code >= 500) { loi = 'mã ' + code; Utilities.sleep(10000 * (t + 1)); continue; }
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
  var j = goiGemini_(cfg_('GEMINI_TEXT_MODEL') || 'gemini-flash-latest', {
    systemInstruction: { parts: [{ text: 'Bạn viết nội dung cho page "' + p.ten + '". Tuân thủ tuyệt đối brief sau:\n\n' + briefCua_(p) }] },
    contents: [{ role: 'user', parts: parts }], generationConfig: gc });
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
  if (!g('TikTok') && p.buffer && g('Video')) {
    try { s.getRange(row, C['TikTok']).setValue(dangTikTok_(p, tieuDe, noiDung, g('Video'))); }
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

function dangTikTok_(p, tieuDe, noiDung, videoId) {
  var q = 'mutation($i: CreatePostInput!){ createPost(input:$i){ __typename ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }';
  var bien = { i: { channelId: p.buffer, text: noiDung.substring(0, 2100), mode: 'shareNow', schedulingType: 'automatic',
    assets: [{ video: { url: linkTai_(videoId) } }], metadata: { tiktok: { title: tieuDe.substring(0, 90), isAiGenerated: p.nguon === 'TU_TAO' } } } };
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
