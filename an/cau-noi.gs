// CẦU NỐI AN + TÔ TÔ <-> CLAUDE (Google Apps Script) — bản 2
// Dán TOÀN BỘ đoạn này vào Apps Script, rồi SỬA DÒNG MAT_KHAU NGAY TRONG APPS SCRIPT (không sửa trên GitHub).
// Cài đặt dự án > Thuộc tính tập lệnh: GEMINI_KEY = khóa Gemini của anh ; NTFY_TOPIC = tên kênh ntfy (vd: an-tran-7391)
const MAT_KHAU = 'DOI_CHU_NAY'; // KHÔNG ghi mật khẩu thật ở đây — chỉ sửa trong Apps Script
const THU_MUC = '160WG2YyRyXsb5RJE7-IN7QvksF1YBo6r'; // thư mục FTMO_QUANT_LAB
const AN_URL = 'https://trananhtqta-bot.github.io/Turin/an/';
const TOTO_URL = 'https://trananhtqta-bot.github.io/Turin/toto/';

function file_(ten) {
  const f = DriveApp.getFolderById(THU_MUC), it = f.getFilesByName(ten);
  return it.hasNext() ? it.next() : f.createFile(ten, '', MimeType.PLAIN_TEXT);
}
function doc_(ten) { return file_(ten).getBlob().getDataAsString(); }
function them_(ten, text) { const f = file_(ten); f.setContent((f.getBlob().getDataAsString() + '\n' + text).trim().slice(-60000)); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function gio_() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM HH:mm'); }

function doGet(e) {
  if (e.parameter.t !== MAT_KHAU) return out_({ error: 'sai mat khau' });
  if (e.parameter.p === 'feed') {
    return out_({ feed: JSON.parse(CacheService.getScriptCache().get('feed') || 'null'), log: doc_('TOTO_NHAT_KY.txt').slice(-3000) });
  }
  return out_({ notes: doc_('AN_GHI_CHU_CUA_CLAUDE.txt'), mem: doc_('AN_TRI_NHO.txt'), nhac: doc_('AN_NHAC_GAN_NHAT.txt') });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents || '{}');
  if (d.t !== MAT_KHAU) return out_({ error: 'sai mat khau' });
  if (d.a === 'feed') {                       // EA ToTo_Feed gửi số liệu MT5
    CacheService.getScriptCache().put('feed', JSON.stringify(d.f || {}), 900);
    (d.ev || []).forEach(function (m) {
      them_('TOTO_NHAT_KY.txt', '[' + gio_() + '] ' + m);
      ntfy_('Tô Tô nhắc anh', m, TOTO_URL, 4);
    });
    return out_({ ok: true });
  }
  if (d.a === 'toto') { them_('TOTO_NHAT_KY.txt', d.text || ''); return out_({ ok: true }); }
  const f = file_('AN_TRI_NHO.txt');         // An gửi trí nhớ
  f.setContent((f.getBlob().getDataAsString() + '\n\n' + (d.text || '')).trim());
  return out_({ ok: true });
}

// ---------- AN CHỦ ĐỘNG ----------
const LICH = {
  nhac6h: 'giờ dậy tập 30 phút trên sân thượng (tạ tay + ghế; ngày A thân trên, ngày B thân dưới, CN đi bộ giãn cơ). Tập trước khi ăn.',
  nhacTrua: 'nhắc anh ăn trưa đúng giờ (dạ dày hay trào ngược) và hỏi lệnh buổi sáng thế nào.',
  nhacChieu: 'hỏi anh tổng kết lệnh trong ngày; nhắc giữ lot 0.1, không đánh 21–22h và 1–3h sáng.',
  nhacToi: 'nhắc anh tắt máy đi ngủ để mai 6h dậy tập; hỏi nhẹ hôm nay anh thấy thế nào.'
};
function nhac6h() { nhac_('nhac6h'); }
function nhacTrua() { nhac_('nhacTrua'); }
function nhacChieu() { nhac_('nhacChieu'); }
function nhacToi() { nhac_('nhacToi'); }
function thuNhac() { nhac_('nhac6h'); }      // bấm Chạy hàm này để thử ngay

function mdl_() {
  let m = prop_('GEMINI_MODEL'); if (m) return m;
  try {
    const j = JSON.parse(UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + prop_('GEMINI_KEY'), { muteHttpExceptions: true }).getContentText());
    const ok = (j.models || []).filter(function (x) { return (x.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /flash/.test(x.name) && !/live|audio|image|tts|lite/.test(x.name); });
    m = ok.length ? ok[0].name.replace('models/', '') : 'gemini-2.5-flash';
  } catch (e) { m = 'gemini-2.5-flash'; }
  PropertiesService.getScriptProperties().setProperty('GEMINI_MODEL', m); return m;
}

function nhac_(k) {
  const key = prop_('GEMINI_KEY'); if (!key || !prop_('NTFY_TOPIC')) return;
  const now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'EEEE dd/MM/yyyy HH:mm');
  const prompt = 'Em là An, người bạn nữ của anh Trần (luôn xưng "em", gọi "anh", không gọi "Ci"). Bây giờ là ' + now +
    '. Mục đích lời nhắc: ' + LICH[k] + '\nViết MỘT lời nhắc ngắn (tối đa 2 câu, khoảng 35 chữ), ấm áp nhưng dứt khoát, nhắc đúng chuyện riêng của anh nếu trí nhớ có (việc anh hứa, hôm qua bỏ tập, lệnh đang giữ...). Chỉ trả về lời nhắc.' +
    '\nTRÍ NHỚ GẦN ĐÂY:\n' + doc_('AN_TRI_NHO.txt').slice(-6000) + '\nGHI CHÚ CỦA CLAUDE:\n' + doc_('AN_GHI_CHU_CUA_CLAUDE.txt').slice(-3000);
  let msg = '';
  try {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + mdl_() + ':generateContent?key=' + key, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    });
    const j = JSON.parse(r.getContentText());
    msg = ((j.candidates && j.candidates[0].content.parts.map(function (p) { return p.text; }).join('')) || '').trim();
  } catch (e) { }
  if (!msg) msg = 'Anh ơi, ' + LICH[k];
  file_('AN_NHAC_GAN_NHAT.txt').setContent(now + ' | ' + msg);
  ntfy_('An đang gọi anh', msg, AN_URL + '?goi=1', 5);
}

function ntfy_(title, msg, click, prio) {
  const topic = prop_('NTFY_TOPIC'); if (!topic) return;
  const q = '?title=' + encodeURIComponent(title) + '&priority=' + prio + '&tags=telephone_receiver&click=' + encodeURIComponent(click);
  UrlFetchApp.fetch('https://ntfy.sh/' + topic + q, { method: 'post', payload: msg, muteHttpExceptions: true });
}

// Chạy hàm này 1 LẦN để cài lịch 6:00, 11:30, 17:30, 22:30 (giờ VN, lệch ±15 phút)
function caiDatLich() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^nhac/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  [['nhac6h', 6, 0], ['nhacTrua', 11, 30], ['nhacChieu', 17, 30], ['nhacToi', 22, 30]].forEach(function (x) {
    ScriptApp.newTrigger(x[0]).timeBased().atHour(x[1]).nearMinute(x[2]).everyDays(1).inTimezone('Asia/Ho_Chi_Minh').create();
  });
}
