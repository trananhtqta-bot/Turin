// CẦU NỐI AN <-> CLAUDE (Google Apps Script)
// 1) Đổi MAT_KHAU bên dưới thành một chữ bí mật của anh (vd: an2026xyz)
// 2) Triển khai > Triển khai mới > Loại: Ứng dụng web > Thực thi với tư cách: Tôi > Ai có quyền truy cập: Bất kỳ ai > Triển khai
// 3) Sao chép URL ứng dụng web, dán vào An (Cài đặt > Cầu nối) cùng MAT_KHAU
const MAT_KHAU = 'DOI_CHU_NAY'; // KHÔNG ghi mật khẩu thật ở đây — chỉ sửa trong Apps Script
const THU_MUC = '160WG2YyRyXsb5RJE7-IN7QvksF1YBo6r'; // thư mục FTMO_QUANT_LAB

function file_(ten) {
  const f = DriveApp.getFolderById(THU_MUC), it = f.getFilesByName(ten);
  return it.hasNext() ? it.next() : f.createFile(ten, '', MimeType.PLAIN_TEXT);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  if (e.parameter.t !== MAT_KHAU) return out_({ error: 'sai mat khau' });
  return out_({
    notes: file_('AN_GHI_CHU_CUA_CLAUDE.txt').getBlob().getDataAsString(),
    mem: file_('AN_TRI_NHO.txt').getBlob().getDataAsString()
  });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents || '{}');
  if (d.t !== MAT_KHAU) return out_({ error: 'sai mat khau' });
  const f = file_('AN_TRI_NHO.txt');
  f.setContent((f.getBlob().getDataAsString() + '\n\n' + (d.text || '')).trim());
  return out_({ ok: true });
}
