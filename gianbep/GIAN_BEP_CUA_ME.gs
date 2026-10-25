/**
 * GIAN BẾP CỦA MẸ — máy tự làm video TikTok từ bảng "Lịch 30 video".
 *
 * Mỗi giờ máy tự chạy (nhipChay):
 *   1. Video nào sắp tới giờ đăng (trong 36 tiếng tới) → lấy clip trong thư mục CLIP trên Drive
 *      (đặt tên theo số video và số cảnh: 02_1.mp4, 02_2.mp4 ...) → gửi GitHub Actions ghép
 *      (chữ + giọng đọc + nhạc + logo). Thiếu clip thì máy tự lấy cảnh Pexels hoặc nền màu.
 *      Video ANH QUAY mà chưa có clip 1 → email nhắc anh, chưa ghép.
 *   2. Ghép xong → video về thư mục VIDEO_THANH_PHAM → tự hẹn giờ đăng TikTok qua Buffer
 *      đúng ngày giờ trong lịch → email cho anh link video + mô tả để đăng Shopee Video.
 *
 * Cột trạng thái: (trống) → Chờ clip → Đang ghép → Sẵn sàng → Đã hẹn TikTok   (hoặc Lỗi / Dừng)
 * Sửa chữ hay lời đọc trong bảng TRƯỚC khi ghép là video ra theo chữ mới.
 * Muốn làm lại 1 video: xóa ô Trạng thái của dòng đó (và xóa bài trong Buffer nếu đã hẹn).
 */

var TZ = 'Asia/Ho_Chi_Minh';
var SH_LICH = 'Lịch 30 video', SH_KB = 'Kịch bản 3 video mở kênh', SH_CD = 'CaiDat', SH_LOG = 'NhatKy';
// Cột của trang Lịch (A..L do em soạn, M..R máy dùng)
var L = { STT: 1, NGAY: 2, GIO: 3, LOAI: 4, CHUDE: 5, MOC: 6, CANH: 7, CHU: 8, LOI: 9, MOTA: 10, SP: 11, GHICHU: 12,
  TUKHOA: 13, TT: 14, VIDEO: 15, TIKTOK: 16, JOB: 17, MAY: 18 };
var COT_MAY = ['Từ khóa cảnh (tiếng Anh, cách nhau " / ")', 'Trạng thái', 'Video (Drive)', 'TikTok (Buffer)', 'Job', 'Ghi chú máy'];
var SAP_TOI_GIO = 36;        // ghép trước giờ đăng tối đa 36 tiếng
var GHEP_MOI_LUOT = 3;       // mỗi lượt gửi tối đa 3 video đi ghép
var HET_HAN_GHEP_PHUT = 45;  // quá 45 phút chưa thấy video về thì gửi ghép lại
var KET_THUC = { text: 'GIAN BẾP CỦA MẸ / Mỗi ngày 1 mẹo nhỏ / Theo dõi để không lỡ',
  voice: 'Theo dõi Gian Bếp Của Mẹ để mỗi ngày có thêm một mẹo nhỏ nhé.' };

/* ============================ MENU ============================ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🍳 Gian Bếp Của Mẹ')
    .addItem('1. Cài đặt lần đầu', 'caiDatLanDau')
    .addItem('2. Bật tự động (mỗi giờ)', 'batTuDong')
    .addSeparator()
    .addItem('Ghép ngay video ở dòng đang chọn', 'ghepDongDangChon')
    .addItem('Chạy 1 lượt ngay', 'nhipChay')
    .addItem('Xem cảnh máy sẽ ghép (dòng đang chọn)', 'xemCanh')
    .addSeparator()
    .addItem('Tắt tự động', 'tatTuDong')
    .addToUi();
}

function caiDatLanDau() {
  var ss = SpreadsheetApp.getActive(), lich = ss.getSheetByName(SH_LICH);
  if (!lich) throw new Error('Không thấy trang "' + SH_LICH + '"');
  lich.getRange(1, L.TUKHOA, 1, COT_MAY.length).setValues([COT_MAY]).setFontWeight('bold').setBackground('#FFE0B2');
  var cd = ss.getSheetByName(SH_CD);
  if (!cd) {
    cd = ss.insertSheet(SH_CD);
    cd.getRange(1, 1, 1, 3).setValues([['Khóa', 'Giá trị', 'Giải thích']]).setFontWeight('bold');
    cd.getRange(2, 1, 9, 3).setValues([
      ['GITHUB_TOKEN', '', 'Để trống = dùng chung mã ở bảng Trung tâm 3 page (TRUNG_TAM_SHEET_ID)'],
      ['GITHUB_REPO', 'trananhtqta-bot/Turin', 'Repo chứa máy ghép video'],
      ['BUFFER_KEY', '', 'Để trống = dùng chung mã ở bảng Trung tâm 3 page'],
      ['BUFFER_API', 'https://api.buffer.com', ''],
      ['BUFFER_CHANNEL', '6add9e262f1f5ed648c50230', 'Kênh TikTok @gianbepcuameem trong Buffer'],
      ['PEXELS_KEY', '', 'Không bắt buộc. Mã miễn phí ở pexels.com/api/new — có thì máy tự lấy cảnh đẹp cho video MÁY'],
      ['TRUNG_TAM_SHEET_ID', '', 'ID (hoặc link) bảng Trung tâm 3 page để mượn GITHUB_TOKEN, BUFFER_KEY'],
      ['EMAIL_BAO', Session.getEffectiveUser().getEmail(), 'Email nhận nhắc việc'],
      ['TAM_DUNG', 'KHONG', 'CO = tạm dừng toàn bộ']
    ]);
    cd.setColumnWidth(2, 320); cd.setColumnWidth(3, 420);
  }
  if (!ss.getSheetByName(SH_LOG)) ss.insertSheet(SH_LOG).appendRow(['Thời gian', 'Video', 'Việc', 'Kết quả']);
  thuMuc_('CLIP'); thuMuc_('VIDEO_THANH_PHAM');
  bao_('Xong. Còn 2 việc:\n1) Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).\n' +
    '2) Menu 🍳 → "Bật tự động".\nClip anh quay thả vào thư mục CLIP, tên kiểu 02_1.mp4 (video 2, cảnh 1).');
}

function batTuDong() {
  tatTuDong();
  ScriptApp.newTrigger('nhipChay').timeBased().everyHours(1).create();
  bao_('Đã bật: mỗi giờ máy tự ghép video sắp đăng và hẹn giờ TikTok.');
}
function tatTuDong() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nhipChay') ScriptApp.deleteTrigger(t);
  });
}

/* ============================ CẤU HÌNH ============================ */
function cfg_(k) {
  var s = SpreadsheetApp.getActive().getSheetByName(SH_CD), v = docCfg_(s)[k] || '';
  if (!v && (k === 'GITHUB_TOKEN' || k === 'BUFFER_KEY')) {
    var id = idTu_(docCfg_(s)['TRUNG_TAM_SHEET_ID']);
    if (id) { try { v = docCfg_(SpreadsheetApp.openById(id).getSheetByName('CaiDat'))[k] || ''; } catch (e) {} }
  }
  return v;
}
function docCfg_(s) {
  var o = {}; if (!s || s.getLastRow() < 2) return o;
  s.getRange(2, 1, s.getLastRow() - 1, 2).getValues().forEach(function (r) { o[String(r[0]).trim()] = String(r[1]).trim(); });
  return o;
}
function idTu_(v) { var m = String(v || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

function thuMuc_(ten) {
  var ss = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  var cha = ss.getParents().hasNext() ? ss.getParents().next() : DriveApp.getRootFolder();
  var it = cha.getFoldersByName(ten);
  return it.hasNext() ? it.next() : cha.createFolder(ten);
}
function thuMucCha_() {
  var ss = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  return ss.getParents().hasNext() ? ss.getParents().next() : DriveApp.getRootFolder();
}

/* ============================ ĐỌC LỊCH ============================ */
function dongLich_(s, row) {
  var v = s.getRange(row, 1, 1, L.MAY).getValues()[0], o = { row: row };
  Object.keys(L).forEach(function (k) { o[k] = v[L[k] - 1]; });
  o.so = parseInt(o.STT, 10);
  o.luc = gioDang_(o.NGAY, o.GIO);
  o.anhQuay = /ANH/i.test(String(o.LOAI));
  return o;
}

/** "T2 26/10" + "19:30" → Date (giờ VN). */
function gioDang_(ngay, gio) {
  if (ngay instanceof Date) ngay = Utilities.formatDate(ngay, TZ, 'dd/MM');
  var m = String(ngay).match(/(\d{1,2})\/(\d{1,2})/); if (!m) return null;
  var g = gio instanceof Date ? Utilities.formatDate(gio, TZ, 'HH:mm') : String(gio || '19:30');
  var h = g.match(/(\d{1,2})[:h](\d{2})?/) || [0, 19, 30];
  var now = new Date(), nam = Number(Utilities.formatDate(now, TZ, 'yyyy'));
  var thangNay = Number(Utilities.formatDate(now, TZ, 'M'));
  if (Number(m[2]) < thangNay - 6) nam++;
  var iso = nam + '-' + pad_(m[2]) + '-' + pad_(m[1]) + 'T' + pad_(h[1]) + ':' + pad_(h[2] || 0) + ':00+07:00';
  return new Date(iso);
}
function pad_(n) { n = String(Number(n)); return n.length < 2 ? '0' + n : n; }

/* ============================ DỰNG CẢNH (hàm thuần, test được) ============================ */
/**
 * Từ 1 dòng lịch (+ bảng kịch bản chi tiết) → danh sách cảnh.
 * dong: {so, MOC, CHU, LOI, TUKHOA}; kb: mảng các hàng của trang Kịch bản (5 cột).
 */
function dungCanh_(dong, kb) {
  var tk = tachGach_(dong.TUKHOA), canh;
  var m = String(dong.LOI).match(/Kịch bản\s*[–-]\s*Video\s*(\d+)/i);
  if (m && kb) canh = canhKichBan_(Number(m[1]), kb);
  if (!canh || !canh.length) canh = canhTuDong_(dong);
  canh.forEach(function (c, i) { c.keyword = tk[i] || tk[tk.length - 1] || ''; c.so_canh = i + 1; });
  return canh;
}

function canhKichBan_(so, kb) {
  var out = [], dang = false;
  for (var i = 0; i < kb.length; i++) {
    var a = String(kb[i][0]).trim();
    if (/^VIDEO\s+\d+/i.test(a)) { dang = new RegExp('^VIDEO\\s+' + so + '\\b', 'i').test(a); continue; }
    if (!dang) continue;
    if (/^Mô tả/i.test(a)) break;
    if (!/^\d+\s*[–-]\s*\d+\s*s/i.test(a)) continue;           // chỉ lấy hàng "0–3s", "3–11s"...
    var hinh = String(kb[i][1]), chu = String(kb[i][2]), loi = String(kb[i][3]);
    var kind = out.length === 0 ? 'hook' : (/^Logo/i.test(hinh) && /GIAN BẾP/i.test(chu) ? 'end' : 'body');
    out.push({ kind: kind, text: chu, voice: loi });
  }
  return out;
}

function canhTuDong_(d) {
  var phan = tachGach_(d.CHU), out = [];
  out.push({ kind: 'hook', text: phan[0] || String(d.CHUDE || ''), voice: String(d.MOC || '') });
  var con = phan.slice(1), loi = String(d.LOI || '').replace(/'/g, '').trim();
  if (con.length) {
    var cau = tachCau_(loi, /[.!?]+\s+/);
    if (cau.length < con.length) cau = tachCau_(loi, /[.!?;,]+\s+/);
    if (cau.length >= con.length) {
      var nhom = chiaDeu_(cau, con.length);
      con.forEach(function (t, i) { out.push({ kind: 'body', text: t, voice: nhom[i].join('. ') }); });
    } else {                                                   // lời ít hơn số ý: gộp thành 1 cảnh danh sách
      out.push({ kind: 'body', text: phan.join(' / '), voice: loi });
    }
  } else if (loi) {
    out.push({ kind: 'body', text: phan[0] || '', voice: loi });
  }
  out.push({ kind: 'end', text: KET_THUC.text, voice: KET_THUC.voice });
  return out;
}

function tachGach_(s) { return String(s || '').split(/\s+\/\s+/).map(function (x) { return x.trim(); }).filter(String); }
function tachCau_(s, re) { return String(s || '').split(re).map(function (x) { return x.trim().replace(/[.!?;,]+$/, ''); }).filter(String); }
function chiaDeu_(arr, n) {
  var out = [], i, k = 0;
  for (i = 0; i < n; i++) {
    var lay = Math.round((arr.length - k) / (n - i));
    out.push(arr.slice(k, k + lay)); k += lay;
  }
  return out;
}

/* ============================ CLIP TRÊN DRIVE ============================ */
function clipCuaVideo_(so) {
  var it = thuMuc_('CLIP').getFiles(), o = {};
  while (it.hasNext()) {
    var f = it.next(), m = f.getName().match(/^0*(\d+)[_\-\s]+0*(\d+)/);
    if (m && Number(m[1]) === so && /^(video|image)\//.test(f.getMimeType())) o[Number(m[2])] = f;
  }
  return o;
}
function logo_() {
  var it = thuMucCha_().getFiles();
  while (it.hasNext()) { var f = it.next(); if (/logo/i.test(f.getName()) && /^image\//.test(f.getMimeType())) return f; }
  return null;
}
function congKhai_(f) {
  if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}
function linkTai_(id) { return 'https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t'; }

/* ============================ GỬI GHÉP ============================ */
function guiGhep_(s, d) {
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Chưa deploy Web app (Deploy → New deployment → Web app)');
  var kb = s.getParent().getSheetByName(SH_KB);
  var canh = dungCanh_(d, kb ? kb.getDataRange().getValues() : null), clip = clipCuaVideo_(d.so);
  canh.forEach(function (c) {
    var f = clip[c.so_canh];
    if (f) { congKhai_(f); c.clip_url = linkTai_(f.getId()); }
  });
  var lg = logo_(); if (lg) congKhai_(lg);
  var job = Utilities.getUuid(), token = Utilities.getUuid();
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + cfg_('GITHUB_REPO') + '/dispatches', {
    method: 'post', muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg_('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ event_type: 'gianbep', client_payload: {
      job: job, token: token, callback: url, pexels_key: cfg_('PEXELS_KEY'),
      video: { so: d.so, ten: String(d.CHUDE), logo_url: lg ? linkTai_(lg.getId()) : '', scenes: canh } } }) });
  if (res.getResponseCode() >= 300) throw new Error('GitHub từ chối: ' + res.getResponseCode() + ' ' + res.getContentText().substring(0, 200));
  var props = PropertiesService.getScriptProperties();
  props.setProperty('JOB_' + job, JSON.stringify({ token: token, row: d.row, luc: Date.now() }));
  s.getRange(d.row, L.TT).setValue('Đang ghép');
  s.getRange(d.row, L.JOB).setValue(job);
  s.getRange(d.row, L.MAY).setValue('Gửi ghép ' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') +
    ' — ' + canh.length + ' cảnh, ' + Object.keys(clip).length + ' clip anh');
  ghiLog_(d.so, 'gửi ghép', canh.length + ' cảnh');
}

/** Nhận video từ GitHub Actions. */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents), props = PropertiesService.getScriptProperties();
    var info = JSON.parse(props.getProperty('JOB_' + d.job) || 'null');
    if (!info || info.token !== d.token) return ContentService.createTextOutput('sai job');
    var s = SpreadsheetApp.getActive().getSheetByName(SH_LICH), dong = dongLich_(s, info.row);
    if (String(dong.JOB) !== d.job) return ContentService.createTextOutput('job cũ');
    var ten = pad_(dong.so) + '_' + String(dong.CHUDE).substring(0, 40) + '.mp4';
    var f = thuMuc_('VIDEO_THANH_PHAM').createFile(Utilities.newBlob(Utilities.base64Decode(d.video_b64), 'video/mp4', ten));
    congKhai_(f);
    s.getRange(info.row, L.VIDEO).setValue(f.getUrl());
    s.getRange(info.row, L.TT).setValue('Sẵn sàng');
    props.deleteProperty('JOB_' + d.job);
    ghiLog_(dong.so, 'nhận video', 'OK');
    return ContentService.createTextOutput('ok');
  } catch (err) {
    ghiLog_('-', 'nhận video', 'LỖI: ' + err.message);
    return ContentService.createTextOutput('lỗi: ' + err.message);
  }
}

/* ============================ HẸN TIKTOK (BUFFER) ============================ */
function henTikTok_(s, d) {
  var fileId = idTu_(d.VIDEO); if (!fileId) throw new Error('chưa có video');
  var luc = d.luc && d.luc.getTime() > Date.now() + 15 * 60000 ? d.luc : new Date(Date.now() + 15 * 60000);
  var q = 'mutation($i: CreatePostInput!){ createPost(input:$i){ __typename ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }';
  var bien = { i: { channelId: cfg_('BUFFER_CHANNEL'), text: String(d.MOTA).substring(0, 2100),
    mode: 'customScheduled', dueAt: Utilities.formatDate(luc, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    schedulingType: 'automatic', needsApproval: false, aiAssisted: true,
    assets: [{ video: { url: linkTai_(fileId) } }],
    metadata: { tiktok: { title: String(d.CHUDE).substring(0, 90), isAiGenerated: true } } } };
  var res = UrlFetchApp.fetch(cfg_('BUFFER_API') || 'https://api.buffer.com', { method: 'post', contentType: 'application/json',
    muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + cfg_('BUFFER_KEY') }, payload: JSON.stringify({ query: q, variables: bien }) });
  var j = JSON.parse(res.getContentText());
  if (j.errors) throw new Error(j.errors[0].message);
  var kq = j.data && j.data.createPost;
  if (!kq || kq.__typename !== 'PostActionSuccess') throw new Error((kq && kq.message) || res.getContentText().substring(0, 200));
  s.getRange(d.row, L.TIKTOK).setValue('buffer:' + kq.post.id + ' — ' + Utilities.formatDate(luc, TZ, 'dd/MM HH:mm'));
  s.getRange(d.row, L.TT).setValue('Đã hẹn TikTok');
  ghiLog_(d.so, 'hẹn TikTok', Utilities.formatDate(luc, TZ, 'dd/MM HH:mm'));
  nhacShopee_(d, luc);
}

function nhacShopee_(d, luc) {
  var msg = 'Video ' + d.so + ' "' + d.CHUDE + '" đã hẹn đăng TikTok lúc ' + Utilities.formatDate(luc, TZ, 'HH:mm dd/MM') + '.\n\n' +
    'Anh đăng cùng video lên Shopee Video (gắn link sản phẩm):\n' +
    '• Video: ' + d.VIDEO + '\n' +
    '• Sản phẩm gắn: ' + (d.SP || '—') + '\n' +
    '• Mô tả (chép nguyên):\n' + d.MOTA + '\n';
  thu_('🍳 Video ' + d.so + ' sẵn sàng — đăng Shopee Video', msg);
}

/* ============================ NHỊP CHẠY MỖI GIỜ ============================ */
function nhipChay() {
  if (cfg_('TAM_DUNG').toUpperCase() === 'CO') return;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try {
    var s = SpreadsheetApp.getActive().getSheetByName(SH_LICH), n = s.getLastRow(), gui = 0, now = Date.now();
    for (var r = 2; r <= n; r++) {
      var d = dongLich_(s, r); if (!d.so || !d.luc) continue;
      var tt = String(d.TT).trim();
      try {
        if (tt === 'Sẵn sàng') { henTikTok_(s, d); continue; }
        if (tt === 'Đang ghép') { quaHan_(s, d); continue; }
        if (tt && tt !== 'Chờ clip') continue;
        var conGio = (d.luc.getTime() - now) / 3600000;
        if (conGio > SAP_TOI_GIO || conGio < -12 || gui >= GHEP_MOI_LUOT) continue;
        if (d.anhQuay && !clipCuaVideo_(d.so)[1]) {
          s.getRange(r, L.TT).setValue('Chờ clip');
          nhacMotLan_('clip' + d.so, '📹 Cần clip cho video ' + d.so, 'Video ' + d.so + ' "' + d.CHUDE + '" đăng lúc ' +
            Utilities.formatDate(d.luc, TZ, 'HH:mm dd/MM') + ' mà chưa có clip.\n\nCảnh cần quay: ' + d.CANH +
            '\n\nThả clip vào thư mục CLIP, đặt tên ' + pad_(d.so) + '_1.mp4, ' + pad_(d.so) + '_2.mp4 ... (theo thứ tự cảnh).\n' +
            'Thư mục: ' + thuMuc_('CLIP').getUrl());
          continue;
        }
        guiGhep_(s, d); gui++;
      } catch (e) {
        s.getRange(r, L.TT).setValue('Lỗi'); s.getRange(r, L.MAY).setValue(e.message);
        ghiLog_(d.so, 'lỗi', e.message);
        nhacMotLan_('loi' + d.so, '⚠️ Gian Bếp: video ' + d.so + ' bị lỗi', e.message + '\n\nSửa xong thì xóa ô Trạng thái để máy làm lại.');
      }
    }
  } finally { lock.releaseLock(); }
}

function quaHan_(s, d) {
  var info = JSON.parse(PropertiesService.getScriptProperties().getProperty('JOB_' + d.JOB) || 'null');
  if (!info || Date.now() - info.luc > HET_HAN_GHEP_PHUT * 60000) {
    var lan = (String(d.MAY).match(/lần (\d)/) || [0, 0])[1];
    if (Number(lan) >= 2) { s.getRange(d.row, L.TT).setValue('Lỗi'); s.getRange(d.row, L.MAY).setValue('Ghép 3 lần không về — xem tab Actions của repo Turin'); return; }
    s.getRange(d.row, L.TT).setValue('');
    s.getRange(d.row, L.MAY).setValue('Ghép lại lần ' + (Number(lan) + 1));
  }
}

/* ============================ BẤM TAY ============================ */
function ghepDongDangChon() {
  var s = SpreadsheetApp.getActive().getActiveSheet();
  if (s.getName() !== SH_LICH) return bao_('Anh chọn 1 dòng trong trang "' + SH_LICH + '" trước.');
  var d = dongLich_(s, s.getActiveRange().getRow());
  if (!d.so) return bao_('Dòng này không có số video.');
  guiGhep_(s, d);
  bao_('Đã gửi ghép video ' + d.so + '. Khoảng 3–5 phút video về thư mục VIDEO_THANH_PHAM, lượt chạy kế tiếp sẽ hẹn TikTok.');
}
function xemCanh() {
  var s = SpreadsheetApp.getActive().getActiveSheet(), d = dongLich_(s, s.getActiveRange().getRow());
  var kb = s.getParent().getSheetByName(SH_KB), clip = clipCuaVideo_(d.so);
  var t = dungCanh_(d, kb ? kb.getDataRange().getValues() : null).map(function (c) {
    return c.so_canh + '. [' + c.kind + '] ' + c.text + '\n   🔊 ' + c.voice + '\n   🎞 ' + (clip[c.so_canh] ? clip[c.so_canh].getName() : (c.keyword ? 'Pexels: ' + c.keyword : 'nền màu'));
  }).join('\n');
  bao_('Video ' + d.so + ':\n' + t);
}

/* ============================ TIỆN ÍCH ============================ */
function thu_(tieuDe, msg) {
  try { MailApp.sendEmail(cfg_('EMAIL_BAO') || Session.getEffectiveUser().getEmail(), tieuDe, msg + '\n\nBảng: ' + SpreadsheetApp.getActive().getUrl()); } catch (e) {}
}
function nhacMotLan_(khoa, tieuDe, msg) {
  var c = CacheService.getScriptCache(); if (c.get(khoa)) return; c.put(khoa, '1', 6 * 3600); thu_(tieuDe, msg);
}
function ghiLog_(so, viec, kq) {
  var s = SpreadsheetApp.getActive().getSheetByName(SH_LOG); if (!s) return;
  s.appendRow([new Date(), so, viec, kq]);
  if (s.getLastRow() > 2000) s.deleteRows(2, 500);
}
function bao_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

if (typeof module !== 'undefined') module.exports = { dungCanh_: dungCanh_, canhTuDong_: canhTuDong_, chiaDeu_: chiaDeu_ };
