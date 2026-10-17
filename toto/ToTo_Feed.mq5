//+------------------------------------------------------------------+
//| ToTo_Feed.mq5 — "mắt" của Tô Tô (Claude soạn 17/10/2026)          |
//| CHỈ ĐỌC: không đặt / sửa / đóng lệnh. Gửi số liệu MT5 lên cầu nối |
//| (Apps Script) để Tô Tô trên điện thoại nhìn cùng chart với anh.   |
//| Cần: Tools > Options > Expert Advisors > Allow WebRequest cho:    |
//|   https://script.google.com                                       |
//|   https://script.googleusercontent.com                            |
//+------------------------------------------------------------------+
#property version   "1.00"
#property strict

input string InpUrl   = "";          // URL cầu nối Apps Script (…/exec)
input string InpPass  = "";          // Mật khẩu cầu nối
input int    InpEvery = 10;          // Gửi số liệu mỗi bao nhiêu giây
input double InpMaxLot = 0.10;       // Luật: lot tối đa

ENUM_TIMEFRAMES TF[] = {PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};
string          TFN[] = {"M5", "M15", "H1", "H4", "D1"};
int hMA50[5], hMA100[5], hMA200[5], hBB[5];

ulong  g_tk[];  double g_sl[];  long g_type[];   // lệnh đã thấy
ulong  g_lastLossDeal = 0;
datetime g_lastSend = 0;
string g_ev = "";                                  // sự kiện chờ gửi

int NthSunday(int y,int m,int n){ MqlDateTime d; d.year=y; d.mon=m; d.day=1; d.hour=0; d.min=0; d.sec=0;
   MqlDateTime w; TimeToStruct(StructToTime(d),w); return 1+((7-w.day_of_week)%7)+7*(n-1); }
int ServerToVN(datetime t){ MqlDateTime d; TimeToStruct(t,d);
   int s=NthSunday(d.year,3,2), e=NthSunday(d.year,11,1);
   bool dst=(d.mon>3&&d.mon<11)||(d.mon==3&&d.day>=s)||(d.mon==11&&d.day<e); return dst?4:5; }
datetime VN(datetime t){ return t+ServerToVN(t)*3600; }
int VNHour(){ MqlDateTime d; TimeToStruct(VN(TimeCurrent()),d); return d.hour; }

double B(int h,int buf){ double a[]; if(CopyBuffer(h,buf,0,1,a)!=1) return 0; return a[0]; }
string D(double v){ return DoubleToString(v,_Digits); }
string Q(string s){ StringReplace(s,"\\","/"); StringReplace(s,"\"","'"); return "\""+s+"\""; }
void Ev(string m){ if(StringLen(g_ev)>0) g_ev+=","; g_ev+=Q(m); }

int OnInit()
{
   for(int i=0;i<5;i++){
      hMA50[i] =iMA(_Symbol,TF[i],50,0,MODE_SMA,PRICE_CLOSE);
      hMA100[i]=iMA(_Symbol,TF[i],100,0,MODE_SMA,PRICE_CLOSE);
      hMA200[i]=iMA(_Symbol,TF[i],200,0,MODE_SMA,PRICE_CLOSE);
      hBB[i]   =iBands(_Symbol,TF[i],20,0,2.0,PRICE_CLOSE);
   }
   ArrayResize(g_tk,0); ArrayResize(g_sl,0); ArrayResize(g_type,0);
   ScanPositions(true);
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int r){ EventKillTimer(); }

int Find(ulong tk){ for(int i=0;i<ArraySize(g_tk);i++) if(g_tk[i]==tk) return i; return -1; }

void ScanPositions(bool silent)
{
   int nb=0, ns=0;
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      long ty=PositionGetInteger(POSITION_TYPE); if(ty==POSITION_TYPE_BUY) nb++; else ns++;
   }
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      long ty=PositionGetInteger(POSITION_TYPE); double vol=PositionGetDouble(POSITION_VOLUME);
      double sl=PositionGetDouble(POSITION_SL), op=PositionGetDouble(POSITION_PRICE_OPEN);
      string side=(ty==POSITION_TYPE_BUY?"BUY":"SELL");
      int k=Find(tk);
      if(k<0){
         int n=ArraySize(g_tk); ArrayResize(g_tk,n+1); ArrayResize(g_sl,n+1); ArrayResize(g_type,n+1);
         g_tk[n]=tk; g_sl[n]=sl; g_type[n]=ty;
         if(silent) continue;
         int h=VNHour();
         string base="Anh vừa vào "+side+" "+DoubleToString(vol,2)+" giá "+D(op)+". ";
         if(vol>InpMaxLot+1e-9) Ev(base+"Lot vượt "+DoubleToString(InpMaxLot,2)+" rồi anh ơi — nhớ lần mất 3 nghìn vì tăng lot.");
         if(sl==0) Ev(base+"Lệnh CHƯA có SL.");
         if((ty==POSITION_TYPE_BUY?nb:ns)>=2) Ev("Anh đang có "+IntegerToString(ty==POSITION_TYPE_BUY?nb:ns)+" lệnh "+side+" cùng lúc — rải theo cản hay đang chồng lệnh?");
         if(h==7||h==21||h==22||(h>=1&&h<3)) Ev(base+"Đây là khung giờ anh hay thua ("+IntegerToString(h)+"h).");
      } else {
         double old=g_sl[k];
         if(!silent && old>0 && sl>0 && ((ty==POSITION_TYPE_BUY && sl<old-_Point) || (ty==POSITION_TYPE_SELL && sl>old+_Point)))
            Ev("Anh vừa DỜI SL "+side+" xa hơn: "+D(old)+" → "+D(sl)+". Đang gồng hy vọng à anh?");
         if(!silent && old>0 && sl==0) Ev("Anh vừa XÓA SL lệnh "+side+".");
         g_sl[k]=sl;
      }
   }
}

void CheckLosses()
{
   MqlDateTime d; TimeToStruct(TimeCurrent(),d); d.hour=0; d.min=0; d.sec=0;
   if(!HistorySelect(StructToTime(d),TimeCurrent()+60)) return;
   int n=HistoryDealsTotal(); int cnt=0; long dir=-1; ulong last=0; double sum=0;
   for(int i=n-1;i>=0 && cnt<2;i--){
      ulong dl=HistoryDealGetTicket(i);
      if(HistoryDealGetString(dl,DEAL_SYMBOL)!=_Symbol) continue;
      if(HistoryDealGetInteger(dl,DEAL_ENTRY)!=DEAL_ENTRY_OUT) continue;
      double p=HistoryDealGetDouble(dl,DEAL_PROFIT)+HistoryDealGetDouble(dl,DEAL_SWAP)+HistoryDealGetDouble(dl,DEAL_COMMISSION);
      long t=HistoryDealGetInteger(dl,DEAL_TYPE);        // deal đóng BUY là DEAL_TYPE_SELL
      long pd=(t==DEAL_TYPE_SELL?0:1);                    // 0=lệnh BUY, 1=lệnh SELL
      if(cnt==0) last=dl;
      if(p>=0) return;
      if(dir<0) dir=pd; else if(dir!=pd) return;
      sum+=p; cnt++;
   }
   if(cnt==2 && last!=g_lastLossDeal){
      g_lastLossDeal=last;
      Ev("Thua 2 lệnh "+(dir==0?"BUY":"SELL")+" liên tiếp ("+DoubleToString(sum,0)+"$). Luật của anh: dừng hướng này, chờ nến H1 sau rồi tính lại.");
   }
}

string Feed()
{
   string s="{\"sym\":"+Q(_Symbol)+",\"vn\":"+Q(TimeToString(VN(TimeCurrent()),TIME_DATE|TIME_MINUTES))
           +",\"bid\":"+D(SymbolInfoDouble(_Symbol,SYMBOL_BID))+",\"ask\":"+D(SymbolInfoDouble(_Symbol,SYMBOL_ASK))
           +",\"bal\":"+DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE),2)+",\"eq\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)+",\"tf\":{";
   for(int i=0;i<5;i++){
      if(i) s+=",";
      s+="\""+TFN[i]+"\":{\"ma50\":"+D(B(hMA50[i],0))+",\"ma100\":"+D(B(hMA100[i],0))+",\"ma200\":"+D(B(hMA200[i],0))
        +",\"bbu\":"+D(B(hBB[i],1))+",\"bbm\":"+D(B(hBB[i],0))+",\"bbl\":"+D(B(hBB[i],2))
        +",\"o\":"+D(iOpen(_Symbol,TF[i],0))+",\"po\":"+D(iOpen(_Symbol,TF[i],1))+",\"pc\":"+D(iClose(_Symbol,TF[i],1))+"}";
   }
   s+="},\"pos\":[";
   int c=0;
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(c++) s+=",";
      s+="{\"type\":"+Q(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL")+",\"vol\":"+DoubleToString(PositionGetDouble(POSITION_VOLUME),2)
        +",\"op\":"+D(PositionGetDouble(POSITION_PRICE_OPEN))+",\"sl\":"+D(PositionGetDouble(POSITION_SL))+",\"tp\":"+D(PositionGetDouble(POSITION_TP))
        +",\"pnl\":"+DoubleToString(PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP),2)+"}";
   }
   s+="]}";
   return s;
}

void Send()
{
   if(StringLen(InpUrl)<10) return;
   string body="{\"t\":"+Q(InpPass)+",\"a\":\"feed\",\"f\":"+Feed()+",\"ev\":["+g_ev+"]}";
   char data[], res[]; string rh;
   int n=StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8); if(n>0) ArrayResize(data,n-1);
   ResetLastError();
   int code=WebRequest("POST",InpUrl,"Content-Type: text/plain\r\n",8000,data,res,rh);
   if(code==-1) Print("ToTo_Feed: WebRequest lỗi ",GetLastError()," — kiểm tra Allow WebRequest cho script.google.com");
   g_ev=""; g_lastSend=TimeCurrent();
}

void OnTimer()
{
   ScanPositions(false);
   CheckLosses();
   if(StringLen(g_ev)>0 || TimeCurrent()-g_lastSend>=InpEvery) Send();
}
//+------------------------------------------------------------------+
