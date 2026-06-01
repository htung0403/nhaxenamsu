import React from 'react';
import { 
  Settings, RotateCcw, Palette, Sun, Moon, Monitor, 
  Type, Maximize, Languages, Globe, Bell, 
  CheckCircle2, ChevronDown, X
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEME_COLORS, THEME_FONTS, THEME_SIZES } from '../context/ThemeContext';
import ZaloConfig from '../components/shared/ZaloConfig';


const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { theme, setTheme, primaryColor, setPrimaryColor, font, setFont, fontSize, setFontSize } = useTheme();
  const isAdmin = user?.role === 'admin';
  const [isFontDropdownOpen, setIsFontDropdownOpen] = React.useState(false);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = React.useState(false);
  const fontDropdownRef = React.useRef<HTMLDivElement>(null);
  const sizeDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as Node)) {
        setIsFontDropdownOpen(false);
      }
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(event.target as Node)) {
        setIsSizeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
            <Settings size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cài đặt hệ thống</h1>
            <p className="text-muted-foreground text-sm">Tùy chỉnh giao diện, ngôn ngữ và thông báo của bạn.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[12px] text-emerald-500 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 size={14} />
            Thay đổi được áp dụng tự động
          </div>
          <button 
            onClick={() => {
              setTheme('system');
              setPrimaryColor('Xanh thực vật');
              setFont('Inter');
              setFontSize('medium');
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card text-[13px] font-bold text-foreground hover:bg-muted transition-all shadow-sm"
          >
            <RotateCcw size={16} />
            Khôi phục mặc định
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Appearance Section */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border shadow-sm">
          <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-2 rounded-t-2xl">
            <Palette size={18} className="text-primary" />
            <h2 className="text-[14px] font-bold text-foreground">Giao diện & Hiển thị</h2>
          </div>
          <div className="p-6 space-y-8">
            {/* Display Mode */}
            <div className="space-y-4">
              <h3 className="text-[13px] font-bold text-foreground flex items-center gap-2">
                <Sun size={14} className="text-muted-foreground" />
                Chế độ hiển thị
              </h3>
              <div className="flex bg-muted rounded-xl w-fit p-1">
                {[
                  { id: 'light', label: 'Sáng', icon: Sun },
                  { id: 'dark', label: 'Tối', icon: Moon },
                  { id: 'system', label: 'Theo hệ thống', icon: Monitor },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTheme(item.id as any)}
                    className={clsx(
                      "flex items-center gap-2 px-6 py-2 rounded-lg text-[13px] font-medium transition-all",
                      theme === item.id 
                        ? "bg-card text-primary shadow-sm ring-1 ring-black/5" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Color */}
            <div className="space-y-4">
              <h3 className="text-[13px] font-bold text-foreground">Tông màu chủ đạo</h3>
              <div className="flex flex-wrap gap-3">
                {THEME_COLORS.map((color) => (
                  <button
                    key={color.name}
                    onClick={() => setPrimaryColor(color.name)}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2 rounded-full border transition-all",
                      primaryColor === color.name
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card hover:border-muted-foreground/30"
                    )}
                  >
                    <div className={clsx("w-4 h-4 rounded-full shadow-inner", color.class)} />
                    <span className={clsx(
                      "text-[13px] pr-1",
                      primaryColor === color.name ? "text-primary font-bold" : "text-muted-foreground font-medium"
                    )}>
                      {color.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Config */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-[13px] font-bold text-foreground flex items-center gap-2">
                  <Type size={14} className="text-muted-foreground" />
                  Kiểu chữ
                </h3>
                <div className="relative" ref={fontDropdownRef}>
                  <button 
                    onClick={() => {
                      setIsFontDropdownOpen(!isFontDropdownOpen);
                      setIsSizeDropdownOpen(false);
                    }}
                    className={clsx(
                      "w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border rounded-xl text-[14px] text-foreground font-medium transition-all",
                      isFontDropdownOpen ? "border-primary ring-2 ring-primary/10 shadow-sm" : "border-border hover:border-primary/30"
                    )}
                  >
                    <span style={{ fontFamily: font }}>{font}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <X 
                        size={14} 
                        className="hover:text-foreground cursor-pointer" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFont('Inter');
                        }}
                      />
                      <div className="w-[1px] h-4 bg-border" />
                      <ChevronDown size={14} className={clsx("transition-transform", isFontDropdownOpen && "rotate-180")} />
                    </div>
                  </button>

                  {isFontDropdownOpen && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-card border border-border shadow-xl rounded-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                      <div className="max-h-[280px] overflow-y-auto px-1 custom-scrollbar">
                        {THEME_FONTS.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              setFont(f.id);
                              setIsFontDropdownOpen(false);
                            }}
                            className={clsx(
                              "w-full text-left px-4 py-3 rounded-lg transition-colors group",
                              font === f.id ? "bg-primary/5 text-primary" : "hover:bg-muted"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span style={{ fontFamily: f.id }} className="text-[15px] font-semibold">{f.name}</span>
                              {font === f.id && <CheckCircle2 size={16} className="text-primary" />}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 group-hover:text-muted-foreground/80">{f.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-[13px] font-bold text-foreground flex items-center gap-2">
                  <Maximize size={14} className="text-muted-foreground" />
                  Kích thước văn bản
                </h3>
                <div className="space-y-3">
                <div className="relative" ref={sizeDropdownRef}>
                  <button 
                    onClick={() => {
                      setIsSizeDropdownOpen(!isSizeDropdownOpen);
                      setIsFontDropdownOpen(false);
                    }}
                    className={clsx(
                      "w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border rounded-xl text-[14px] text-foreground font-medium transition-all",
                      isSizeDropdownOpen ? "border-primary ring-2 ring-primary/10 shadow-sm" : "border-border hover:border-primary/30"
                    )}
                  >
                    <span>{THEME_SIZES.find(s => s.id === fontSize)?.name}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <X 
                        size={14} 
                        className="hover:text-foreground cursor-pointer" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFontSize('medium');
                        }}
                      />
                      <div className="w-[1px] h-4 bg-border" />
                      <ChevronDown size={14} className={clsx("transition-transform", isSizeDropdownOpen && "rotate-180")} />
                    </div>
                  </button>

                  {isSizeDropdownOpen && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-card border border-border shadow-xl rounded-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                      <div className="px-1">
                        {THEME_SIZES.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              setFontSize(s.id);
                              setIsSizeDropdownOpen(false);
                            }}
                            className={clsx(
                              "w-full text-left px-4 py-3 rounded-lg transition-colors group",
                              fontSize === s.id ? "bg-primary/5 text-primary" : "hover:bg-muted"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[14px] font-semibold">{s.name}</span>
                              {fontSize === s.id && <CheckCircle2 size={16} className="text-primary" />}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 group-hover:text-muted-foreground/80">{s.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-muted/30 rounded-xl border border-dashed border-border transition-all">
                  <p className="text-muted-foreground text-center" style={{ fontFamily: font }}>Đây là kiểu chữ mẫu được áp dụng.</p>
                </div>
                <p className="text-[11px] text-muted-foreground/60 italic px-1">Ảnh hưởng đến kích thước hiển thị trên toàn hệ thống.</p>
              </div>
              </div>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="lg:col-span-2">
            <ZaloConfig />
          </div>
        )}

        {/* Regional Settings */}
        <div className="bg-card rounded-2xl border border-border shadow-sm">
          <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-2 rounded-t-2xl">
            <Globe size={18} className="text-primary" />
            <h2 className="text-[14px] font-bold text-foreground">Cấu hình vùng</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <label className="text-[13px] font-bold text-foreground flex items-center gap-2">
                <Languages size={14} className="text-muted-foreground" />
                Ngôn ngữ hiển thị
              </label>
              <button className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border border-border rounded-xl text-[14px] text-foreground font-medium">
                <span>Tiếng Việt (Việt Nam)</span>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <X size={14} />
                  <div className="w-[1px] h-4 bg-border" />
                  <ChevronDown size={14} />
                </div>
              </button>
            </div>
            <div className="space-y-3">
              <label className="text-[13px] font-bold text-foreground flex items-center gap-2">
                <Monitor size={14} className="text-muted-foreground" />
                Múi giờ
              </label>
              <button className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border border-border rounded-xl text-[14px] text-foreground font-medium">
                <span>(GMT+07:00) Hà Nội, TP.HCM, Bangkok</span>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <X size={14} />
                  <div className="w-[1px] h-4 bg-border" />
                  <ChevronDown size={14} />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-card rounded-2xl border border-border shadow-sm relative">
          <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              <h2 className="text-[14px] font-bold text-foreground">Thông báo</h2>
            </div>
            <span className="text-[11px] font-bold text-muted-foreground/60 bg-muted/50 px-2.5 py-1 rounded-full border border-border/50">Sắp ra mắt</span>
          </div>
          <div className="p-6 space-y-6 opacity-40 select-none">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-bold text-foreground">Thông báo Email</p>
                <p className="text-[12px] text-muted-foreground">Nhận báo cáo qua mail.</p>
              </div>
              <div className="w-10 h-5 bg-border rounded-full relative">
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-foreground rounded-full shadow-sm" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-bold text-foreground">Thông báo trình duyệt</p>
                <p className="text-[12px] text-muted-foreground">Tin nhắn khi có biến động.</p>
              </div>
              <div className="w-10 h-5 bg-border rounded-full relative">
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-foreground rounded-full shadow-sm" />
              </div>
            </div>
            <div className="pt-4 text-center">
              <p className="text-[11px] text-muted-foreground italic">Tính năng đang được phát triển.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
