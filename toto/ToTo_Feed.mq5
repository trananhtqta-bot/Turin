//+------------------------------------------------------------------+
//| ToTo_Feed.mq5 v2 — "mắt" của Tô Tô (Claude soạn 17/10/2026)       |
//| CHỈ ĐỌC: không đặt / sửa / đóng lệnh. Gửi số liệu MT5 lên cầu nối |
//| (Apps Script) để Tô Tô trên điện thoại nhìn cùng chart với anh.   |
//| Cần: Tools > Options > Expert Advisors > Allow WebRequest cho:    |
//|   https://script.google.com                                       |
//|   https://script.googleusercontent.com                            |
//+------------------------------------------------------------------+
#property version   "2.03"
#property strict

input string InpUrl        = "";     // URL cầu nối Apps Script (…/exec)
input string InpPass       = "";     // Mật khẩu cầu nối
input int    InpEvery      = 20;     // Gửi số liệu mỗi bao nhiêu giây (sự kiện thì gửi ngay)
input double InpMaxLot     = 0.10;   // Luật: lot tối đa
input double InpSupport    = 4.0;    // Luật: đường đỡ sau lưng lệnh trong bao nhiêu giá
input double InpAtLine     = 1.5;    // Lệnh chờ coi là "tại đường" nếu cách ≤ bao nhiêu giá
input double InpRemindPts  = 3.0;    // Nhắc chốt trước đóng nến khi lệnh lãi ≥ bao nhiêu giá
input int    InpRemindSec  = 30;     // Nhắc trước khi đóng nến M15/H1 bao nhiêu giây
input double InpDayWarn1   = 1.5;    // % lỗ ngày: nhắc lần 1
input double InpDayWarn2   = 2.5;    // % lỗ ngày: nhắc lần 2 (FTMO giới hạn 3%)

ENUM_TIMEFRAMES TF[]  = {PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};
string          TFN[] = {"M5", "M15", "H1", "H4", "D1"};
string          LN[]  = {"MA50", "MA100", "MA200", "BB trên", "BB giữa", "BB dưới"};
int hMA50[5], hMA100[5], hMA200[5], hBB[5];

// ---- theo dõi lệnh đang mở ----
ulong    P_tk[];  double P_sl[], P_op[], P_vol[];  long P_type[];
bool     P_sup[], P_slOff[], P_slRem[];  datetime P_slBar[], P_remBar[];
// ---- lệnh thua chờ phân loại ----
ulong    L_tk[];  long L_dir[];  double L_op[], L_cp[], L_net[], L_vol[];  bool L_sup[], L_slOff[];  datetime L_ct[];
// ---- lệnh chờ đã thấy ----
ulong    O_tk[];
// ---- ngày ----
int      g_day = -1;  bool g_w1 = false, g_w2 = false;  int g_sameDir = 0, g_wins = 0, g_n = 0;  double g_net = 0;
bool g_okOnce = false;
datetime g_lastSend = 0, g_lastM15 = 0, g_lastH1 = 0, g_lastH4 = 0;
bool     g_newH1 = false, g_newH4 = false, g_sendChart = true, g_sendY = true;
string   g_ev = "";

//---------------- tiện ích ----------------
int NthSunday(int y,int m,int n){ MqlDateTime d; d.year=y; d.mon=m; d.day=1; d.hour=0; d.min=0; d.sec=0;
   MqlDateTime w; TimeToStruct(StructToTime(d),w); return 1+((7-w.day_of_week)%7)+7*(n-1); }
int ServerToVN(datetime t){ MqlDateTime d; TimeToStruct(t,d);
   int s=NthSunday(d.year,3,2), e=NthSunday(d.year,11,1);
   bool dst=(d.mon>3&&d.mon<11)||(d.mon==3&&d.day>=s)||(d.mon==11&&d.day<e); return dst?4:5; }
datetime VN(datetime t){ return t+ServerToVN(t)*3600; }
string D(double v){ return DoubleToString(v,_Digits); }
string D1s(double v){ return DoubleToString(v,1); }
string Q(string s){ StringReplace(s,"\\","/"); StringReplace(s,"\"","'"); return "\""+s+"\""; }
void   Ev(string m){ if(StringLen(g_ev)>0) g_ev+=","; g_ev+=Q(m); }
double B(int h,int buf,int sh){ double a[]; if(CopyBuffer(h,buf,sh,1,a)!=1) return 0; return a[0]; }
double LineVal(int tf,int k,int sh){            // k: 0..5 theo LN[]
   if(k==0) return B(hMA50[tf],0,sh); if(k==1) return B(hMA100[tf],0,sh); if(k==2) return B(hMA200[tf],0,sh);
   if(k==3) return B(hBB[tf],1,sh);   if(k==4) return B(hBB[tf],0,sh);    return B(hBB[tf],2,sh); }

// đường gần nhất (M5..H4, MA/BB) — side: +1 phía trên giá, -1 phía dưới, 0 cả hai
double Nearest(double price,int side,string &name)
{
   double best=1e9; name="";
   for(int t=0;t<4;t++) for(int k=0;k<6;k++){
      double v=LineVal(t,k,0); if(v<=0) continue;
      double d=v-price;
      if(side>0 && d<0) continue; if(side<0 && d>0) continue;
      if(MathAbs(d)<best){ best=MathAbs(d); name=LN[k]+" "+TFN[t]+" "+D(v); }
   }
   return best;
}

//---------------- vòng đời ----------------
int OnInit()
{
   for(int i=0;i<5;i++){
      hMA50[i] =iMA(_Symbol,TF[i],50,0,MODE_SMA,PRICE_CLOSE);
      hMA100[i]=iMA(_Symbol,TF[i],100,0,MODE_SMA,PRICE_CLOSE);
      hMA200[i]=iMA(_Symbol,TF[i],200,0,MODE_SMA,PRICE_CLOSE);
      hBB[i]   =iBands(_Symbol,TF[i],20,0,2.0,PRICE_CLOSE);
   }
   ScanPositions(true); ScanOrders(true);
   Ping("https://script.google.com");
   Ping(InpUrl+"?p=ping");
   PingPost(50); PingPost(5000); PingPost(26000);
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int r){ EventKillTimer(); }

void Ping(string url)
{
   char d[], r[]; string h; ResetLastError();
   int c=WebRequest("GET",url,"",15000,d,r,h);
   string a=(ArraySize(r)>0)?CharArrayToString(r,0,MathMin(ArraySize(r),120),CP_UTF8):""; StringReplace(a,"\n"," ");
   Print("ToTo_Feed PING ",StringSubstr(url,0,45)," -> ",c," | ",a);
}
void PingPost(int len)
{
   string b="{\"t\":\"x\",\"a\":\"ping\",\"pad\":\""; while(StringLen(b)<len) b+="xxxxxxxxxx"; b+="\"}";
   char d[], r[]; string h; int n=StringToCharArray(b,d,0,WHOLE_ARRAY,CP_UTF8); if(n>0) ArrayResize(d,n-1);
   int c=WebRequest("POST",InpUrl,"Content-Type: text/plain\r\n",15000,d,r,h);
   string a=(ArraySize(r)>0)?CharArrayToString(r,0,MathMin(ArraySize(r),120),CP_UTF8):""; StringReplace(a,"\n"," ");
   Print("ToTo_Feed PINGPOST len=",len," -> ",c," | ",a);
}
int FindP(ulong tk){ for(int i=0;i<ArraySize(P_tk);i++) if(P_tk[i]==tk) return i; return -1; }
void AddP(ulong tk,long ty,double vol,double op,double sl,bool sup)
{
   int n=ArraySize(P_tk);
   ArrayResize(P_tk,n+1); ArrayResize(P_type,n+1); ArrayResize(P_vol,n+1); ArrayResize(P_op,n+1); ArrayResize(P_sl,n+1);
   ArrayResize(P_sup,n+1); ArrayResize(P_slOff,n+1); ArrayResize(P_slRem,n+1); ArrayResize(P_slBar,n+1); ArrayResize(P_remBar,n+1);
   P_tk[n]=tk; P_type[n]=ty; P_vol[n]=vol; P_op[n]=op; P_sl[n]=sl; P_sup[n]=sup;
   P_slOff[n]=false; P_slRem[n]=false; P_slBar[n]=(sl==0?iTime(_Symbol,PERIOD_M15,0):0); P_remBar[n]=0;
}
void DelP(int i)
{
   int n=ArraySize(P_tk)-1;
   P_tk[i]=P_tk[n]; P_type[i]=P_type[n]; P_vol[i]=P_vol[n]; P_op[i]=P_op[n]; P_sl[i]=P_sl[n]; P_sup[i]=P_sup[n];
   P_slOff[i]=P_slOff[n]; P_slRem[i]=P_slRem[n]; P_slBar[i]=P_slBar[n]; P_remBar[i]=P_remBar[n];
   ArrayResize(P_tk,n); ArrayResize(P_type,n); ArrayResize(P_vol,n); ArrayResize(P_op,n); ArrayResize(P_sl,n); ArrayResize(P_sup,n);
   ArrayResize(P_slOff,n); ArrayResize(P_slRem,n); ArrayResize(P_slBar,n); ArrayResize(P_remBar,n);
}

void ScanPositions(bool silent)
{
   // 1) lệnh mới / thay đổi SL / nhắc trước đóng nến
   datetime m15=iTime(_Symbol,PERIOD_M15,0);
   long srv=(long)TimeTradeServer();
   int left15=(int)(PeriodSeconds(PERIOD_M15)-(srv-(long)m15));
   int left60=(int)(PeriodSeconds(PERIOD_H1)-(srv-(long)iTime(_Symbol,PERIOD_H1,0)));
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      long ty=PositionGetInteger(POSITION_TYPE); double vol=PositionGetDouble(POSITION_VOLUME);
      double sl=PositionGetDouble(POSITION_SL), op=PositionGetDouble(POSITION_PRICE_OPEN);
      int dir=(ty==POSITION_TYPE_BUY?1:-1); string side=(dir>0?"BUY":"SELL");
      int k=FindP(tk);
      if(k<0){
         string nm; double sd=Nearest(op,-dir,nm);
         bool sup=(sd<=InpSupport);
         // đếm lệnh cùng chiều đang mở (chỉ thống kê)
         int same=0; for(int j=0;j<ArraySize(P_tk);j++) if(P_type[j]==ty) same++;
         AddP(tk,ty,vol,op,sl,sup);
         if(silent) continue;
         if(same>0) g_sameDir++;
         if(vol>InpMaxLot+1e-9) Ev("Anh vừa vào "+side+" "+DoubleToString(vol,2)+" — vượt lot "+DoubleToString(InpMaxLot,2)+" rồi anh ơi, nhớ lần mất 3 nghìn vì tăng lot.");
         if(!sup) Ev("Lệnh "+side+" "+D(op)+" vào giữa khoảng trống: sau lưng không có đường MA/BB nào trong "+D1s(InpSupport)+" giá (gần nhất "+nm+", cách "+D1s(sd)+").");
         else Ev("INFO|Lệnh "+side+" "+D(op)+" có đường đỡ: "+nm+" (cách "+D1s(sd)+").");
         continue;
      }
      // SL bị bỏ: ghi nhận nến M15 lúc bỏ — nhắc khi nến đó đã đóng
      if(sl==0 && P_sl[k]>0){ P_slOff[k]=true; P_slBar[k]=m15; P_slRem[k]=false; }
      if(sl==0 && P_slBar[k]==0) P_slBar[k]=m15;
      if(sl>0){ P_slBar[k]=0; P_slRem[k]=false; }
      if(!silent && sl>0 && P_sl[k]>0 && ((dir>0 && sl<P_sl[k]-_Point)||(dir<0 && sl>P_sl[k]+_Point)))
         Ev("INFO|Anh dời SL "+side+" ra xa thêm "+D1s(MathAbs(sl-P_sl[k]))+" giá ("+D(P_sl[k])+" → "+D(sl)+").");
      if(!silent && sl==0 && P_slBar[k]>0 && m15>P_slBar[k] && !P_slRem[k]){
         double wick=(dir>0?iLow(_Symbol,PERIOD_M15,1):iHigh(_Symbol,PERIOD_M15,1));
         Ev("Nến M15 đóng rồi anh — lệnh "+side+" "+D(op)+" đang chưa có SL. Râu nến vừa đóng: "+D(wick)+". Đặt lại SL ở đó không anh?");
         P_slRem[k]=true;
      }
      P_sl[k]=sl;
      // nhắc chốt trước đóng nến khi đang lãi
      double cur=(dir>0?SymbolInfoDouble(_Symbol,SYMBOL_BID):SymbolInfoDouble(_Symbol,SYMBOL_ASK));
      double pts=(cur-op)*dir;
      if(!silent && pts>=InpRemindPts && left15>0 && left15<=InpRemindSec && P_remBar[k]!=m15){
         string w=(left60<=InpRemindSec?"M15 và H1":"M15");
         Ev("Còn "+IntegerToString(left15)+" giây đóng nến "+w+" — lệnh "+side+" đang lãi +"+D1s(pts)+" giá. Chốt không anh?");
         P_remBar[k]=m15;
      }
   }
   // 2) lệnh đã đóng
   for(int i=ArraySize(P_tk)-1;i>=0;i--){
      if(PositionSelectByTicket(P_tk[i])) continue;
      ulong tk=P_tk[i];
      if(HistorySelectByPosition(tk)){
         double net=0, cp=0; datetime ct=0;
         for(int j=0;j<HistoryDealsTotal();j++){
            ulong dl=HistoryDealGetTicket(j);
            net+=HistoryDealGetDouble(dl,DEAL_PROFIT)+HistoryDealGetDouble(dl,DEAL_SWAP)+HistoryDealGetDouble(dl,DEAL_COMMISSION);
            if(HistoryDealGetInteger(dl,DEAL_ENTRY)==DEAL_ENTRY_OUT){ cp=HistoryDealGetDouble(dl,DEAL_PRICE); ct=(datetime)HistoryDealGetInteger(dl,DEAL_TIME); }
         }
         if(!silent && ct>0){
            g_n++; g_net+=net; if(net>0) g_wins++;
            if(net<0){
               int n=ArraySize(L_tk);
               ArrayResize(L_tk,n+1); ArrayResize(L_dir,n+1); ArrayResize(L_op,n+1); ArrayResize(L_cp,n+1); ArrayResize(L_net,n+1);
               ArrayResize(L_vol,n+1); ArrayResize(L_sup,n+1); ArrayResize(L_slOff,n+1); ArrayResize(L_ct,n+1);
               L_tk[n]=tk; L_dir[n]=(P_type[i]==POSITION_TYPE_BUY?1:-1); L_op[n]=P_op[i]; L_cp[n]=cp; L_net[n]=net;
               L_vol[n]=P_vol[i]; L_sup[n]=P_sup[i]; L_slOff[n]=P_slOff[i]; L_ct[n]=ct;
            }
         }
      }
      DelP(i);
   }
}

// phân loại lệnh thua sau 60 phút (để biết giá có quay lại đúng hướng không)
void ClassifyLosses()
{
   for(int i=ArraySize(L_tk)-1;i>=0;i--){
      if(TimeCurrent()<L_ct[i]+3600) continue;
      double hi[], lo[];
      int nh=CopyHigh(_Symbol,PERIOD_M5,L_ct[i],L_ct[i]+3600,hi), nl=CopyLow(_Symbol,PERIOD_M5,L_ct[i],L_ct[i]+3600,lo);
      double fav=0;
      if(nh>0 && nl>0) fav=(L_dir[i]>0? hi[ArrayMaximum(hi)]-L_op[i] : L_op[i]-lo[ArrayMinimum(lo)]);
      double lossPts=(L_op[i]-L_cp[i])*L_dir[i];
      string tag;
      if(L_vol[i]>InpMaxLot+1e-9)      tag="tăng lot";
      else if(!L_sup[i])               tag="vào/nhồi không đúng chỗ MA-BB (không có đường đỡ trong "+D1s(InpSupport)+" giá)";
      else if(L_slOff[i] && lossPts>=10) tag="bỏ SL để lỗ lớn";
      else if(fav>=5)                  tag="SL gần — bị quét rồi giá chạy đúng hướng +"+D1s(fav)+" giá";
      else                             tag="sai hướng";
      Ev("THUA|"+tag+"|"+(L_dir[i]>0?"BUY ":"SELL ")+DoubleToString(L_vol[i],2)+" "+D(L_op[i])+"→"+D(L_cp[i])+" ("+DoubleToString(L_net[i],0)+"$)");
      int n=ArraySize(L_tk)-1;
      L_tk[i]=L_tk[n]; L_dir[i]=L_dir[n]; L_op[i]=L_op[n]; L_cp[i]=L_cp[n]; L_net[i]=L_net[n]; L_vol[i]=L_vol[n];
      L_sup[i]=L_sup[n]; L_slOff[i]=L_slOff[n]; L_ct[i]=L_ct[n];
      ArrayResize(L_tk,n); ArrayResize(L_dir,n); ArrayResize(L_op,n); ArrayResize(L_cp,n); ArrayResize(L_net,n);
      ArrayResize(L_vol,n); ArrayResize(L_sup,n); ArrayResize(L_slOff,n); ArrayResize(L_ct,n);
   }
}

void ScanOrders(bool silent)
{
   for(int i=OrdersTotal()-1;i>=0;i--){
      ulong tk=OrderGetTicket(i); if(!OrderSelect(tk)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol) continue;
      bool seen=false; for(int j=0;j<ArraySize(O_tk);j++) if(O_tk[j]==tk){ seen=true; break; }
      if(seen) continue;
      int n=ArraySize(O_tk); ArrayResize(O_tk,n+1); O_tk[n]=tk;
      if(silent) continue;
      double pr=OrderGetDouble(ORDER_PRICE_OPEN); string nm; double d=Nearest(pr,0,nm);
      string typ=EnumToString((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE)); StringReplace(typ,"ORDER_TYPE_","");
      if(d<=InpAtLine) Ev("INFO|Lệnh chờ "+typ+" "+D(pr)+" đặt tại "+nm+" ✓");
      else Ev("Lệnh chờ "+typ+" "+D(pr)+" không nằm sát đường nào — gần nhất "+nm+" cách "+D1s(d)+" giá.");
   }
   if(ArraySize(O_tk)>200) ArrayResize(O_tk,0);
}

void DayCheck()
{
   MqlDateTime d; TimeToStruct(TimeCurrent(),d);
   if(d.day_of_year!=g_day){ g_day=d.day_of_year; g_w1=false; g_w2=false; g_sameDir=0; g_wins=0; g_n=0; g_net=0; g_sendY=true; }
   // lỗ ngày ước tính = số dư đầu ngày (số dư hiện tại trừ lãi lỗ đã chốt hôm nay) – equity
   double closed=0; d.hour=0; d.min=0; d.sec=0;
   if(HistorySelect(StructToTime(d),TimeCurrent()+60))
      for(int j=0;j<HistoryDealsTotal();j++){ ulong dl=HistoryDealGetTicket(j);
         long ty=HistoryDealGetInteger(dl,DEAL_TYPE); if(ty!=DEAL_TYPE_BUY && ty!=DEAL_TYPE_SELL) continue;
         closed+=HistoryDealGetDouble(dl,DEAL_PROFIT)+HistoryDealGetDouble(dl,DEAL_SWAP)+HistoryDealGetDouble(dl,DEAL_COMMISSION); }
   double start=AccountInfoDouble(ACCOUNT_BALANCE)-closed, eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double dd=(start>0? (start-eq)/start*100.0 : 0);
   if(dd>=InpDayWarn1 && !g_w1){ g_w1=true; Ev("Hôm nay đang lỗ "+DoubleToString(dd,2)+"% (giới hạn FTMO 3%). Anh chậm lại, chỉ vào lệnh thật chuẩn nhé."); }
   if(dd>=InpDayWarn2 && !g_w2){ g_w2=true; Ev("Lỗ ngày đã "+DoubleToString(dd,2)+"% — sát giới hạn 3% của FTMO. Dừng vào lệnh mới hôm nay anh ơi."); }
}

//---------------- số liệu gửi đi ----------------
string Feed()
{
   string s="{\"sym\":"+Q(_Symbol)+",\"vn\":"+Q(TimeToString(VN(TimeCurrent()),TIME_DATE|TIME_MINUTES))
           +",\"bid\":"+D(SymbolInfoDouble(_Symbol,SYMBOL_BID))+",\"ask\":"+D(SymbolInfoDouble(_Symbol,SYMBOL_ASK))
           +",\"bal\":"+DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE),2)+",\"eq\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)
           +",\"newH1\":"+(g_newH1?"true":"false")+",\"newH4\":"+(g_newH4?"true":"false")
           +",\"day\":{\"n\":"+IntegerToString(g_n)+",\"win\":"+IntegerToString(g_wins)+",\"net\":"+DoubleToString(g_net,2)+",\"same\":"+IntegerToString(g_sameDir)+"}"
           +",\"tf\":{";
   for(int i=0;i<5;i++){
      if(i) s+=",";
      s+="\""+TFN[i]+"\":{\"ma50\":"+D(B(hMA50[i],0,0))+",\"ma100\":"+D(B(hMA100[i],0,0))+",\"ma200\":"+D(B(hMA200[i],0,0))
        +",\"bbu\":"+D(B(hBB[i],1,0))+",\"bbm\":"+D(B(hBB[i],0,0))+",\"bbl\":"+D(B(hBB[i],2,0))
        +",\"o\":"+D(iOpen(_Symbol,TF[i],0))+",\"po\":"+D(iOpen(_Symbol,TF[i],1))+",\"pc\":"+D(iClose(_Symbol,TF[i],1))
        +",\"ph\":"+D(iHigh(_Symbol,TF[i],1))+",\"pl\":"+D(iLow(_Symbol,TF[i],1))+"}";
   }
   s+="},\"pos\":[";
   int c=0;
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(c>0) s+=","; c++;
      s+="{\"type\":"+Q(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL")+",\"vol\":"+DoubleToString(PositionGetDouble(POSITION_VOLUME),2)
        +",\"op\":"+D(PositionGetDouble(POSITION_PRICE_OPEN))+",\"sl\":"+D(PositionGetDouble(POSITION_SL))+",\"tp\":"+D(PositionGetDouble(POSITION_TP))
        +",\"pnl\":"+DoubleToString(PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP),2)+"}";
   }
   s+="],\"ord\":[";
   c=0;
   for(int i=OrdersTotal()-1;i>=0;i--){
      ulong tk=OrderGetTicket(i); if(!OrderSelect(tk)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol) continue;
      string typ=EnumToString((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE)); StringReplace(typ,"ORDER_TYPE_","");
      if(c>0) s+=","; c++;
      s+="{\"type\":"+Q(typ)+",\"vol\":"+DoubleToString(OrderGetDouble(ORDER_VOLUME_CURRENT),2)+",\"pr\":"+D(OrderGetDouble(ORDER_PRICE_OPEN))
        +",\"sl\":"+D(OrderGetDouble(ORDER_SL))+",\"tp\":"+D(OrderGetDouble(ORDER_TP))+"}";
   }
   s+="]";
   if(g_sendChart) s+=",\"chart\":"+Chart();
   if(g_sendY)     s+=",\"y\":"+Yesterday();
   s+="}";
   return s;
}

// 80 nến M15 / H1 / H4 + MA/BB (cũ → mới) để Tô Tô vẽ chart
string Arr(const double &a[],int n,int from){ string s="["; for(int i=from;i<n;i++){ if(i>from) s+=","; s+=D(a[i]); } return s+"]"; }
string Chart()
{
   int idx[]={1,2,3}; string s="{";
   for(int q=0;q<3;q++){
      int t=idx[q]; int N=80;
      MqlRates r[]; ArraySetAsSeries(r,false);
      int got=CopyRates(_Symbol,TF[t],0,N,r); if(got<=0) continue;
      double m50[],m100[],m200[],bu[],bm[],bl[];
      ArraySetAsSeries(m50,false); ArraySetAsSeries(m100,false); ArraySetAsSeries(m200,false);
      ArraySetAsSeries(bu,false); ArraySetAsSeries(bm,false); ArraySetAsSeries(bl,false);
      if(CopyBuffer(hMA50[t],0,0,got,m50)!=got || CopyBuffer(hMA100[t],0,0,got,m100)!=got || CopyBuffer(hMA200[t],0,0,got,m200)!=got ||
         CopyBuffer(hBB[t],1,0,got,bu)!=got || CopyBuffer(hBB[t],0,0,got,bm)!=got || CopyBuffer(hBB[t],2,0,got,bl)!=got) continue;
      double o[],h[],l[],c[]; ArrayResize(o,got); ArrayResize(h,got); ArrayResize(l,got); ArrayResize(c,got);
      string ts="[";
      for(int i=0;i<got;i++){ o[i]=r[i].open; h[i]=r[i].high; l[i]=r[i].low; c[i]=r[i].close;
         if(i) ts+=","; ts+=Q(TimeToString(VN(r[i].time),TIME_DATE|TIME_MINUTES)); }
      ts+="]";
      if(StringLen(s)>1) s+=",";
      s+="\""+TFN[t]+"\":{\"t\":"+ts+",\"o\":"+Arr(o,got,0)+",\"h\":"+Arr(h,got,0)+",\"l\":"+Arr(l,got,0)+",\"c\":"+Arr(c,got,0)
        +",\"ma50\":"+Arr(m50,got,0)+",\"ma100\":"+Arr(m100,got,0)+",\"ma200\":"+Arr(m200,got,0)
        +",\"bbu\":"+Arr(bu,got,0)+",\"bbm\":"+Arr(bm,got,0)+",\"bbl\":"+Arr(bl,got,0)+"}";
   }
   return s+"}";
}

// Thống kê hôm qua: số lần chạm từng đường ở M5/M15/H1/H4, giữ hay phá, bật bao nhiêu giá
string Yesterday()
{
   datetime t0=iTime(_Symbol,PERIOD_D1,1), t1=iTime(_Symbol,PERIOD_D1,0);
   string s="{\"d\":"+Q(TimeToString(t0,TIME_DATE))+",\"o\":"+D(iOpen(_Symbol,PERIOD_D1,1))+",\"h\":"+D(iHigh(_Symbol,PERIOD_D1,1))
           +",\"l\":"+D(iLow(_Symbol,PERIOD_D1,1))+",\"c\":"+D(iClose(_Symbol,PERIOD_D1,1))+",\"tf\":{";
   int tfw=0;
   for(int t=0;t<4;t++){
      int sEnd=iBarShift(_Symbol,TF[t],t1-1), sBeg=iBarShift(_Symbol,TF[t],t0);
      if(sEnd<0||sBeg<0||sBeg<sEnd){ continue; }
      int N=sBeg+1;                                   // lấy từ nến hiện tại về tới đầu hôm qua
      MqlRates r[]; ArraySetAsSeries(r,true);
      if(CopyRates(_Symbol,TF[t],0,N,r)!=N) continue;
      if(tfw>0) s+=","; tfw++;
      s+="\""+TFN[t]+"\":[";
      int written=0;
      for(int k=0;k<6;k++){
         double v[]; ArraySetAsSeries(v,true);
         int h=(k==0?hMA50[t]:(k==1?hMA100[t]:(k==2?hMA200[t]:hBB[t])));
         int buf=(k==3?1:(k==4?0:(k==5?2:0)));
         if(CopyBuffer(h,buf,0,N,v)!=N) continue;
         int touch=0, held=0; double bsum=0; bool prev=false;
         for(int i=sBeg;i>=sEnd;i--){
            double L=v[i]; bool tch=(r[i].low<=L && r[i].high>=L);
            if(tch && !prev){
               touch++;
               bool fromAbove=(r[i].open>L);
               bool broke=false; double ext=0;
               for(int j=i;j>=MathMax(0,i-3);j--){
                  if(j>=i-1){ if(fromAbove && r[j].close<L-1) broke=true; if(!fromAbove && r[j].close>L+1) broke=true; }
                  ext=MathMax(ext, fromAbove? r[j].high-L : L-r[j].low);
               }
               if(!broke){ held++; bsum+=ext; }
            }
            prev=tch;
         }
         if(touch==0) continue;
         if(written) s+=","; written++;
         s+="{\"n\":"+Q(LN[k])+",\"t\":"+IntegerToString(touch)+",\"g\":"+IntegerToString(held)+",\"b\":"+D1s(held>0?bsum/held:0)+"}";
      }
      s+="]";
   }
   return s+"}}";
}

void Send()
{
   if(StringLen(InpUrl)<10) return;
   string body="{\"t\":"+Q(InpPass)+",\"a\":\"feed\",\"f\":"+Feed()+",\"ev\":["+g_ev+"]}";
   char data[], res[]; string rh;
   int n=StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8); if(n>0) ArrayResize(data,n-1);
   ResetLastError();
   int code=WebRequest("POST",InpUrl,"Content-Type: text/plain\r\n",15000,data,res,rh);
   if(code==-1){ g_lastSend=TimeCurrent(); Print("ToTo_Feed: WebRequest lỗi ",GetLastError()," — kiểm tra Allow WebRequest cho script.google.com"); return; }
   string ans=CharArrayToString(res,0,MathMin(ArraySize(res),300),CP_UTF8);
   if(code!=200 || StringFind(ans,"error")>=0)
   {
      g_lastSend=TimeCurrent();
      Print("ToTo_Feed: cầu nối trả về ",code," err=",GetLastError()," dài=",n-1," | ",ans);
      return;
   }
   if(!g_okOnce){ g_okOnce=true; Print("ToTo_Feed: đã nối thông cầu nối (",code,") | ",ans); }
   g_ev=""; g_lastSend=TimeCurrent(); g_newH1=false; g_newH4=false; g_sendChart=false; g_sendY=false;
}

void OnTimer()
{
   datetime m15=iTime(_Symbol,PERIOD_M15,0), h1=iTime(_Symbol,PERIOD_H1,0), h4=iTime(_Symbol,PERIOD_H4,0);
   if(m15!=g_lastM15){ g_lastM15=m15; g_sendChart=true; }
   if(h1!=g_lastH1){ if(g_lastH1>0) g_newH1=true; g_lastH1=h1; }
   if(h4!=g_lastH4){ if(g_lastH4>0) g_newH4=true; g_lastH4=h4; }
   DayCheck();
   ScanPositions(false);
   ScanOrders(false);
   ClassifyLosses();
   if(StringLen(g_ev)>0 || g_sendChart || g_newH1 || TimeCurrent()-g_lastSend>=InpEvery) Send();
}
//+------------------------------------------------------------------+
