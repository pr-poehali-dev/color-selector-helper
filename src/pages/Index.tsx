import { useState, useCallback, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";

type Section = "generator" | "analyzer" | "gallery" | "export" | "tests" | "theory";

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function getLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(hex1: string, hex2: string) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function generatePalette(h: number, s: number, l: number, mode: string): string[] {
  if (mode === "analogous") {
    return [
      hslToHex((h - 30 + 360) % 360, s, l),
      hslToHex((h - 15 + 360) % 360, s, l),
      hslToHex(h, s, l),
      hslToHex((h + 15) % 360, s, l),
      hslToHex((h + 30) % 360, s, l),
    ];
  }
  if (mode === "complementary") {
    return [
      hslToHex(h, s, Math.max(20, l - 20)),
      hslToHex(h, s, l),
      hslToHex(h, Math.max(10, s - 20), Math.min(90, l + 20)),
      hslToHex((h + 180) % 360, s, l),
      hslToHex((h + 180) % 360, s, Math.max(20, l - 20)),
    ];
  }
  if (mode === "triadic") {
    return [
      hslToHex(h, s, l),
      hslToHex((h + 120) % 360, s, l),
      hslToHex((h + 240) % 360, s, l),
      hslToHex(h, Math.max(10, s - 20), Math.min(90, l + 20)),
      hslToHex((h + 120) % 360, Math.max(10, s - 20), Math.min(90, l + 20)),
    ];
  }
  return [
    hslToHex(h, s, Math.max(10, l - 30)),
    hslToHex(h, s, Math.max(10, l - 15)),
    hslToHex(h, s, l),
    hslToHex(h, s, Math.min(95, l + 15)),
    hslToHex(h, s, Math.min(95, l + 30)),
  ];
}

const GALLERY_PALETTES = [
  { name: "Закат над морем", mood: "Тёплый", colors: ["#FF6B6B", "#FF8E53", "#FF6B9D", "#C44569", "#F8A5C2"] },
  { name: "Северное сияние", mood: "Холодный", colors: ["#0F3460", "#16213E", "#0A7CFF", "#00D4AA", "#7B2FBE"] },
  { name: "Лесная прогулка", mood: "Природный", colors: ["#2D5016", "#57863A", "#8DB84A", "#C8E6C9", "#F1F8E9"] },
  { name: "Городская ночь", mood: "Тёмный", colors: ["#1A1A2E", "#16213E", "#0F3460", "#533483", "#E94560"] },
  { name: "Сакура", mood: "Нежный", colors: ["#FFB7C5", "#FF69B4", "#FF1493", "#C71585", "#4A0020"] },
  { name: "Пустыня", mood: "Земляной", colors: ["#C4A882", "#A0845C", "#7B5E3D", "#DEB887", "#F5DEB3"] },
  { name: "Техно", mood: "Цифровой", colors: ["#00FFFF", "#00FF41", "#FF00FF", "#0D0D0D", "#1A1A1A"] },
  { name: "Лаванда", mood: "Мягкий", colors: ["#E6DEFF", "#C4B5FD", "#A78BFA", "#7C3AED", "#4C1D95"] },
];

const THEORY_TOPICS = [
  { icon: "Palette", title: "Цветовой круг", desc: "Цветовой круг — основа всех цветовых схем. Он состоит из 12 оттенков: 3 основных (красный, жёлтый, синий), 3 вторичных и 6 третичных цветов." },
  { icon: "Sun", title: "Тон, насыщенность, яркость", desc: "Тон — это сам цвет (0–360°). Насыщенность — интенсивность от серого до чистого цвета. Яркость — от чёрного до белого." },
  { icon: "Layers", title: "Цветовые схемы", desc: "Аналогичная — соседние оттенки. Комплементарная — противоположные. Триадная — три равноудалённых. Монохромная — один оттенок." },
  { icon: "Eye", title: "Психология цвета", desc: "Красный — энергия и срочность. Синий — доверие и спокойствие. Зелёный — рост и природа. Жёлтый — оптимизм. Фиолетовый — креативность." },
  { icon: "Activity", title: "Контрастность и доступность", desc: "WCAG 2.1 требует контраст 4.5:1 для обычного текста и 3:1 для крупного. Это важно для пользователей с нарушениями зрения." },
  { icon: "Wand2", title: "60-30-10 Правило", desc: "Доминирующий цвет занимает 60%, вторичный — 30%, акцентный — 10%. Это создаёт визуальный баланс и гармонию в дизайне." },
];

function ColorWheel({ hue, saturation, lightness, onSelect }: {
  hue: number; saturation: number; lightness: number;
  onSelect: (h: number, s: number, l: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    // Draw wheel ring
    for (let deg = 0; deg < 360; deg++) {
      const startAngle = (deg - 1) * Math.PI / 180;
      const endAngle = (deg + 1) * Math.PI / 180;
      const gradient = ctx.createRadialGradient(cx, cy, r * 0.42, cx, cy, r);
      gradient.addColorStop(0, `hsla(${deg}, 10%, ${lightness}%, 0.15)`);
      gradient.addColorStop(1, `hsl(${deg}, ${saturation}%, ${lightness}%)`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Center inner circle with base color
    const innerR = r * 0.4;
    const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
    centerGrad.addColorStop(0, `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 10, 95)}%)`);
    centerGrad.addColorStop(1, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = centerGrad;
    ctx.fill();

    // Center hex label
    ctx.fillStyle = lightness > 55 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Cursor dot on wheel
    const angle = (hue - 90) * Math.PI / 180;
    const dotR = r * 0.72;
    const dx = cx + dotR * Math.cos(angle);
    const dy = cy + dotR * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(dx, dy, 9, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }, [hue, saturation, lightness]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const dist = Math.sqrt(x * x + y * y);
    if (dist < r * 0.38 || dist > r + 8) return;
    let angle = Math.atan2(y, x) * 180 / Math.PI + 90;
    if (angle < 0) angle += 360;
    onSelect(Math.round(angle) % 360, saturation, lightness);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onClick={handleClick}
        className="cursor-crosshair rounded-full"
        style={{ filter: "drop-shadow(0 0 20px rgba(150,80,230,0.4))" }}
      />
      <div className="text-xs text-muted-foreground">Кликните на круг чтобы выбрать оттенок</div>
    </div>
  );
}

function exportPaletteAsPng(palette: string[], paletteMode: string) {
  const W = 900;
  const H = 420;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d0a1a");
  bg.addColorStop(0.5, "#0f1520");
  bg.addColorStop(1, "#0a1015");
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, W, H, 24);
  ctx.fill();

  // Title
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("🎨  Цветовая палитра", 40, 56);

  const modeName: Record<string, string> = {
    analogous: "Аналогичная", complementary: "Комплементарная",
    triadic: "Триадная", monochromatic: "Монохромная"
  };
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "16px sans-serif";
  ctx.fillText(`Схема: ${modeName[paletteMode] ?? paletteMode}`, 40, 82);

  // Color blocks
  const blockW = (W - 80 - (palette.length - 1) * 12) / palette.length;
  const blockH = 180;
  const blockY = 110;

  palette.forEach((color, i) => {
    const x = 40 + i * (blockW + 12);

    // Shadow
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.roundRect(x, blockY, blockW, blockH, 16);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Hex label inside block
    const r2 = parseInt(color.slice(1, 3), 16);
    const g2 = parseInt(color.slice(3, 5), 16);
    const b2 = parseInt(color.slice(5, 7), 16);
    const lum = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
    ctx.fillStyle = lum > 140 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(color.toUpperCase(), x + blockW / 2, blockY + blockH - 18);

    // Role label below
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "13px sans-serif";
    const roles = ["Основной", "Светлый", "Акцент", "Тёмный", "Доп."];
    ctx.fillText(roles[i] ?? "", x + blockW / 2, blockY + blockH + 28);

    // Color swatch strip row below role
    ctx.fillStyle = color;
    ctx.roundRect(x, blockY + blockH + 42, blockW, 14, 7);
    ctx.fill();
  });

  // Strip bar at bottom
  const stripY = H - 52;
  palette.forEach((color, i) => {
    const x = 40 + i * ((W - 80) / palette.length);
    const sw = (W - 80) / palette.length;
    ctx.fillStyle = color;
    if (i === 0) {
      ctx.roundRect(x, stripY, sw, 20, [10, 0, 0, 10]);
    } else if (i === palette.length - 1) {
      ctx.roundRect(x, stripY, sw, 20, [0, 10, 10, 0]);
    } else {
      ctx.fillRect(x, stripY, sw, 20);
    }
    ctx.fill();
  });

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("kolоrist.app", W - 40, H - 18);

  const link = document.createElement("a");
  link.download = "palette.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export default function Index() {
  const [activeSection, setActiveSection] = useState<Section>("generator");

  const [hue, setHue] = useState(270);
  const [saturation, setSaturation] = useState(75);
  const [lightness, setLightness] = useState(55);
  const [paletteMode, setPaletteMode] = useState("analogous");
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const [color1, setColor1] = useState("#9B59B6");
  const [color2, setColor2] = useState("#1A1A2E");
  const [analyzerHue1, setAnalyzerHue1] = useState(270);
  const [analyzerSat1, setAnalyzerSat1] = useState(65);
  const [analyzerLit1, setAnalyzerLit1] = useState(52);

  const [selectedGallery, setSelectedGallery] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<"css" | "json" | "hex">("css");
  const [exportCopied, setExportCopied] = useState(false);

  const palette = generatePalette(hue, saturation, lightness, paletteMode);
  const baseColor = hslToHex(hue, saturation, lightness);

  const copyColor = useCallback((hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedColor(hex);
    setTimeout(() => setCopiedColor(null), 1500);
  }, []);

  const contrastRatio = getContrastRatio(color1, color2);
  const contrastAA = contrastRatio >= 4.5;
  const contrastAAA = contrastRatio >= 7;
  const contrastLarge = contrastRatio >= 3;

  const getExportText = () => {
    if (exportFormat === "css") {
      return `:root {\n${palette.map((c, i) => `  --color-${i + 1}: ${c};`).join("\n")}\n}`;
    }
    if (exportFormat === "json") {
      return JSON.stringify({ palette: palette.map((c, i) => ({ name: `color-${i + 1}`, value: c })) }, null, 2);
    }
    return palette.join(", ");
  };

  const copyExport = () => {
    navigator.clipboard.writeText(getExportText());
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const navItems: { id: Section; label: string; icon: string }[] = [
    { id: "generator", label: "Генератор", icon: "Sparkles" },
    { id: "analyzer", label: "Анализатор", icon: "ScanEye" },
    { id: "gallery", label: "Галерея", icon: "LayoutGrid" },
    { id: "export", label: "Экспорт", icon: "Download" },
    { id: "tests", label: "Тесты", icon: "ShieldCheck" },
    { id: "theory", label: "Справка", icon: "BookOpen" },
  ];

  return (
    <div className="min-h-screen mesh-bg relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-20 animate-float"
          style={{ background: "radial-gradient(circle, hsl(270,80%,65%), transparent 70%)" }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-15 animate-float"
          style={{ background: "radial-gradient(circle, hsl(195,100%,55%), transparent 70%)", animationDelay: "2s" }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full opacity-10 animate-float"
          style={{ background: "radial-gradient(circle, hsl(320,90%,65%), transparent 70%)", animationDelay: "1s" }} />
      </div>

      <header className="relative z-20 py-5 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, hsl(270,80%,65%), hsl(195,100%,55%))" }}>
              <Icon name="Palette" size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-oswald text-xl font-semibold text-white tracking-wide">КОЛОРИСТ</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">подбор цветов для продукта</p>
            </div>
          </div>

          <div className="flex items-center gap-1 glass rounded-2xl p-1.5 overflow-x-auto">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => setActiveSection(item.id)}
                className={`nav-pill flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all
                  ${activeSection === item.id ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}>
                <Icon name={item.icon} size={14} />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 pb-16">

        {activeSection === "generator" && (
          <div className="animate-slide-up">
            <div className="mb-8">
              <h2 className="font-oswald text-4xl font-bold gradient-text mb-2">Генератор палитр</h2>
              <p className="text-muted-foreground">Настройте базовый цвет и выберите схему — палитра создастся автоматически</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass rounded-3xl p-6 space-y-5">
                <div className="relative h-28 rounded-2xl overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${hslToHex(hue, saturation, Math.max(10, lightness - 20))}, ${baseColor}, ${hslToHex((hue + 30) % 360, saturation, lightness)})` }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-oswald text-2xl font-bold text-white drop-shadow-lg tracking-widest">{baseColor.toUpperCase()}</span>
                  </div>
                </div>

                {[
                  { label: "Оттенок (Hue)", value: hue, min: 0, max: 359, unit: "°", onChange: setHue,
                    track: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                    thumbColor: hslToHex(hue, 100, 50), thumbPos: (hue / 359) * 100 },
                  { label: "Насыщенность (Saturation)", value: saturation, min: 0, max: 100, unit: "%", onChange: setSaturation,
                    track: `linear-gradient(to right, hsl(${hue}, 0%, ${lightness}%), hsl(${hue}, 100%, ${lightness}%))`,
                    thumbColor: baseColor, thumbPos: saturation },
                  { label: "Яркость (Lightness)", value: lightness, min: 5, max: 95, unit: "%", onChange: setLightness,
                    track: `linear-gradient(to right, hsl(${hue}, ${saturation}%, 5%), hsl(${hue}, ${saturation}%, 50%), hsl(${hue}, ${saturation}%, 95%))`,
                    thumbColor: baseColor, thumbPos: ((lightness - 5) / 90) * 100 },
                ].map((slider) => (
                  <div key={slider.label}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-white">{slider.label}</label>
                      <span className="text-sm font-mono text-muted-foreground">{slider.value}{slider.unit}</span>
                    </div>
                    <div className="relative h-4">
                      <div className="h-4 rounded-full absolute inset-0" style={{ background: slider.track }} />
                      <input type="range" min={slider.min} max={slider.max} value={slider.value}
                        onChange={(e) => slider.onChange(Number(e.target.value))}
                        className="w-full absolute inset-0 opacity-0 h-4 cursor-pointer" />
                      <div className="w-5 h-5 rounded-full border-2 border-white shadow-lg absolute top-[-2px] pointer-events-none transition-all"
                        style={{ left: `calc(${slider.thumbPos}% - 10px)`, backgroundColor: slider.thumbColor }} />
                    </div>
                  </div>
                ))}

                <div>
                  <label className="text-sm font-medium text-white mb-3 block">Схема палитры</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "analogous", label: "Аналогичная" },
                      { key: "complementary", label: "Комплементарная" },
                      { key: "triadic", label: "Триадная" },
                      { key: "monochromatic", label: "Монохромная" },
                    ].map(({ key, label }) => (
                      <button key={key} onClick={() => setPaletteMode(key)}
                        className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${paletteMode === key ? "text-white" : "glass text-muted-foreground hover:text-white hover:bg-white/10"}`}
                        style={paletteMode === key ? { background: "linear-gradient(135deg, hsl(270,80%,45%), hsl(195,100%,40%))" } : {}}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="glass rounded-3xl p-6 flex flex-col items-center">
                  <h3 className="font-oswald text-lg font-semibold text-white mb-4 self-start">Цветовой круг</h3>
                  <ColorWheel
                    hue={hue}
                    saturation={saturation}
                    lightness={lightness}
                    onSelect={(h) => setHue(h)}
                  />
                </div>
                <div className="glass rounded-3xl p-6">
                  <h3 className="font-oswald text-lg font-semibold text-white mb-4">Ваша палитра</h3>
                  <div className="space-y-3">
                    {palette.map((color, i) => (
                      <div key={i} className="flex items-center gap-4 glass-bright rounded-2xl p-3 cursor-pointer hover:bg-white/10 transition-all group"
                        onClick={() => copyColor(color)}>
                        <div className="w-14 h-14 rounded-xl color-swatch flex-shrink-0 shadow-lg" style={{ backgroundColor: color }} />
                        <div className="flex-1">
                          <div className="font-mono text-white font-semibold">{color.toUpperCase()}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {["Основной", "Светлый", "Акцент", "Тёмный", "Дополнительный"][i]}
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedColor === color
                            ? <Icon name="Check" size={16} className="text-green-400" />
                            : <Icon name="Copy" size={16} className="text-muted-foreground" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="glass rounded-3xl p-4">
                  <h3 className="font-oswald text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Превью</h3>
                  <div className="flex rounded-2xl overflow-hidden h-16">
                    {palette.map((color, i) => (
                      <div key={i} className="flex-1 transition-all hover:flex-[2]" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === "analyzer" && (
          <div className="animate-slide-up">
            <div className="mb-8">
              <h2 className="font-oswald text-4xl font-bold gradient-text mb-2">Анализатор контраста</h2>
              <p className="text-muted-foreground">Проверьте совместимость двух цветов и их читаемость по стандарту WCAG</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="glass rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-5 h-5 rounded-md" style={{ backgroundColor: color1 }} />
                  <h3 className="font-oswald text-lg font-semibold text-white">Цвет текста</h3>
                </div>
                <div className="h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: color1 }}>
                  <span className="font-oswald text-xl font-bold" style={{ color: color2 }}>Пример</span>
                </div>
                {[
                  { label: "Оттенок", val: analyzerHue1, min: 0, max: 359, unit: "°",
                    track: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                    thumbColor: hslToHex(analyzerHue1, 100, 50), thumbPos: (analyzerHue1 / 359) * 100,
                    onSet: (v: number) => { setAnalyzerHue1(v); setColor1(hslToHex(v, analyzerSat1, analyzerLit1)); } },
                  { label: "Насыщенность", val: analyzerSat1, min: 0, max: 100, unit: "%",
                    track: `linear-gradient(to right, hsl(${analyzerHue1}, 0%, ${analyzerLit1}%), hsl(${analyzerHue1}, 100%, ${analyzerLit1}%))`,
                    thumbColor: color1, thumbPos: analyzerSat1,
                    onSet: (v: number) => { setAnalyzerSat1(v); setColor1(hslToHex(analyzerHue1, v, analyzerLit1)); } },
                  { label: "Яркость", val: analyzerLit1, min: 5, max: 95, unit: "%",
                    track: `linear-gradient(to right, hsl(${analyzerHue1}, ${analyzerSat1}%, 5%), hsl(${analyzerHue1}, ${analyzerSat1}%, 50%), hsl(${analyzerHue1}, ${analyzerSat1}%, 95%))`,
                    thumbColor: color1, thumbPos: ((analyzerLit1 - 5) / 90) * 100,
                    onSet: (v: number) => { setAnalyzerLit1(v); setColor1(hslToHex(analyzerHue1, analyzerSat1, v)); } },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm text-white">{s.label}</label>
                      <span className="text-sm font-mono text-muted-foreground">{s.val}{s.unit}</span>
                    </div>
                    <div className="relative h-4">
                      <div className="h-4 rounded-full absolute inset-0" style={{ background: s.track }} />
                      <input type="range" min={s.min} max={s.max} value={s.val}
                        onChange={(e) => s.onSet(Number(e.target.value))}
                        className="w-full absolute inset-0 opacity-0 h-4 cursor-pointer" />
                      <div className="w-5 h-5 rounded-full border-2 border-white shadow-lg absolute top-[-2px] pointer-events-none"
                        style={{ left: `calc(${s.thumbPos}% - 10px)`, backgroundColor: s.thumbColor }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="glass rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-5 h-5 rounded-md" style={{ backgroundColor: color2 }} />
                  <h3 className="font-oswald text-lg font-semibold text-white">Цвет фона</h3>
                </div>
                <div className="h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: color2 }}>
                  <span className="font-oswald text-xl font-bold" style={{ color: color1 }}>Пример текста</span>
                </div>
                <div className="flex gap-3">
                  <input type="color" value={color2} onChange={(e) => setColor2(e.target.value)}
                    className="w-14 h-12 rounded-xl border border-white/10 cursor-pointer bg-transparent" />
                  <input type="text" value={color2} onChange={(e) => setColor2(e.target.value)}
                    className="flex-1 glass rounded-xl px-4 text-sm font-mono text-white border border-white/10 bg-transparent outline-none focus:border-white/30" />
                </div>
                <p className="text-sm text-muted-foreground">Нажмите на цветной квадрат или введите HEX-код</p>

                <div className="glass-bright rounded-2xl p-4">
                  <div className="text-4xl font-oswald font-bold text-white mb-1">{contrastRatio.toFixed(2)}:1</div>
                  <div className="text-sm text-muted-foreground">Коэффициент контраста</div>
                </div>
              </div>
            </div>

            <div className="glass rounded-3xl p-6">
              <h3 className="font-oswald text-lg font-semibold text-white mb-4">Результаты WCAG 2.1</h3>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: "AA (обычный)", pass: contrastAA, desc: "4.5:1 минимум" },
                  { label: "AA (крупный)", pass: contrastLarge, desc: "3:1 минимум" },
                  { label: "AAA (строгий)", pass: contrastAAA, desc: "7:1 минимум" },
                ].map((check) => (
                  <div key={check.label} className={`rounded-2xl p-4 text-center ${check.pass ? "bg-green-500/15 border border-green-500/30" : "bg-red-500/15 border border-red-500/30"}`}>
                    <Icon name={check.pass ? "CheckCircle" : "XCircle"} size={24} className={`mx-auto mb-2 ${check.pass ? "text-green-400" : "text-red-400"}`} />
                    <div className="font-semibold text-white text-sm">{check.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{check.desc}</div>
                  </div>
                ))}
              </div>
              <div className="p-5 rounded-2xl" style={{ backgroundColor: color2 }}>
                <p className="font-oswald text-2xl font-bold mb-2" style={{ color: color1 }}>Заголовок страницы</p>
                <p className="text-sm" style={{ color: color1 }}>Обычный текст — так будет выглядеть контент на этом фоне. Важно проверить читаемость.</p>
              </div>
            </div>
          </div>
        )}

        {activeSection === "gallery" && (
          <div className="animate-slide-up">
            <div className="mb-8">
              <h2 className="font-oswald text-4xl font-bold gradient-text mb-2">Галерея палитр</h2>
              <p className="text-muted-foreground">Готовые цветовые схемы для разных стилей — нажмите, чтобы скопировать цвета</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {GALLERY_PALETTES.map((item, i) => (
                <div key={i}
                  className={`glass rounded-3xl p-4 cursor-pointer card-hover ${selectedGallery === i ? "ring-2 ring-white/30" : ""}`}
                  onClick={() => setSelectedGallery(selectedGallery === i ? null : i)}>
                  <div className="flex rounded-2xl overflow-hidden h-24 mb-3">
                    {item.colors.map((c, j) => <div key={j} className="flex-1" style={{ backgroundColor: c }} />)}
                  </div>
                  <div className="font-semibold text-white text-sm mb-1">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.mood}</div>
                  {selectedGallery === i && (
                    <div className="mt-3 space-y-1.5 animate-fade-in">
                      {item.colors.map((c, j) => (
                        <div key={j} className="flex items-center gap-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); copyColor(c); }}>
                          <div className="w-5 h-5 rounded-md" style={{ backgroundColor: c }} />
                          <span className="font-mono text-xs text-muted-foreground">{c.toUpperCase()}</span>
                          {copiedColor === c && <Icon name="Check" size={12} className="text-green-400" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === "export" && (
          <div className="animate-slide-up">
            <div className="mb-8">
              <h2 className="font-oswald text-4xl font-bold gradient-text mb-2">Экспорт палитры</h2>
              <p className="text-muted-foreground">Сохраните текущую палитру в нужном формате — код или красивое PNG-изображение</p>
            </div>

            {/* PNG export card */}
            <div className="glass rounded-3xl p-6 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-oswald text-xl font-bold text-white mb-1">Скачать как изображение</h3>
                  <p className="text-sm text-muted-foreground">Красивая карточка палитры в формате PNG — для презентаций, портфолио и Figma</p>
                </div>
                <button
                  onClick={() => exportPaletteAsPng(palette, paletteMode)}
                  className="flex items-center gap-3 px-6 py-3 rounded-2xl text-white font-semibold text-sm whitespace-nowrap transition-all hover:scale-105 active:scale-95"
                  style={{ background: "linear-gradient(135deg, hsl(320,90%,55%), hsl(270,80%,50%), hsl(195,100%,45%))" }}>
                  <Icon name="ImageDown" size={18} />
                  Скачать PNG
                </button>
              </div>

              {/* Preview of PNG card */}
              <div className="mt-5 rounded-2xl overflow-hidden border border-white/10"
                style={{ background: "linear-gradient(135deg, #0d0a1a, #0f1520, #0a1015)" }}>
                <div className="p-5">
                  <div className="text-white font-bold text-base mb-1">🎨  Цветовая палитра</div>
                  <div className="text-xs text-white/40 mb-4">
                    Схема: {{ analogous: "Аналогичная", complementary: "Комплементарная", triadic: "Триадная", monochromatic: "Монохромная" }[paletteMode]}
                  </div>
                  <div className="flex gap-2 mb-3">
                    {palette.map((c, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                        <div className="w-full rounded-xl" style={{ height: 64, backgroundColor: c, boxShadow: `0 4px 20px ${c}55` }} />
                        <span className="font-mono text-[9px] text-white/50">{c.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex rounded-lg overflow-hidden h-3">
                    {palette.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass rounded-3xl p-6">
                <h3 className="font-oswald text-lg font-semibold text-white mb-4">Текущая палитра</h3>
                <div className="flex rounded-2xl overflow-hidden h-20 mb-4">
                  {palette.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}
                </div>
                <div className="grid grid-cols-5 gap-2 mb-6">
                  {palette.map((c, i) => (
                    <div key={i} className="text-center">
                      <div className="w-full aspect-square rounded-xl mb-1" style={{ backgroundColor: c }} />
                      <div className="font-mono text-[10px] text-muted-foreground">{c.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-sm font-medium text-white mb-3 block">Формат кода</label>
                  <div className="flex gap-3">
                    {(["css", "json", "hex"] as const).map((fmt) => (
                      <button key={fmt} onClick={() => setExportFormat(fmt)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${exportFormat === fmt ? "text-white" : "glass text-muted-foreground hover:text-white"}`}
                        style={exportFormat === fmt ? { background: "linear-gradient(135deg, hsl(270,80%,45%), hsl(195,100%,40%))" } : {}}>
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="glass rounded-3xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-oswald text-lg font-semibold text-white">Результат</h3>
                  <button onClick={copyExport}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                    style={{ background: "linear-gradient(135deg, hsl(270,80%,50%), hsl(195,100%,45%))" }}>
                    <Icon name={exportCopied ? "Check" : "Copy"} size={14} />
                    {exportCopied ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
                <pre className="bg-black/30 rounded-2xl p-4 text-sm font-mono text-green-400 overflow-x-auto whitespace-pre-wrap min-h-[200px]">
                  {getExportText()}
                </pre>
              </div>
            </div>
          </div>
        )}

        {activeSection === "tests" && (
          <div className="animate-slide-up">
            <div className="mb-8">
              <h2 className="font-oswald text-4xl font-bold gradient-text mb-2">Тесты доступности</h2>
              <p className="text-muted-foreground">Проверьте вашу палитру по критериям WCAG 2.1 для инклюзивного дизайна</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {palette.map((bgColor, i) => {
                const lightContrast = getContrastRatio(bgColor, "#FFFFFF");
                const darkContrast = getContrastRatio(bgColor, "#000000");
                const bestContrast = Math.max(lightContrast, darkContrast);
                const textColor = lightContrast > darkContrast ? "#FFFFFF" : "#000000";
                const passes = bestContrast >= 4.5;
                const passesLarge = bestContrast >= 3;
                return (
                  <div key={i} className="glass rounded-3xl p-5">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: bgColor }}>
                        <span className="font-oswald text-lg font-bold" style={{ color: textColor }}>Aa</span>
                      </div>
                      <div>
                        <div className="font-mono text-white font-semibold">{bgColor.toUpperCase()}</div>
                        <div className="text-sm text-muted-foreground">{["Основной", "Светлый", "Акцент", "Тёмный", "Дополнительный"][i]}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`rounded-xl p-3 text-center ${passes ? "bg-green-500/15 border border-green-500/20" : "bg-red-500/15 border border-red-500/20"}`}>
                        <Icon name={passes ? "Check" : "X"} size={16} className={`mx-auto mb-1 ${passes ? "text-green-400" : "text-red-400"}`} />
                        <div className="text-xs text-white font-medium">AA норм.</div>
                        <div className="text-xs text-muted-foreground">{bestContrast.toFixed(1)}:1</div>
                      </div>
                      <div className={`rounded-xl p-3 text-center ${passesLarge ? "bg-green-500/15 border border-green-500/20" : "bg-red-500/15 border border-red-500/20"}`}>
                        <Icon name={passesLarge ? "Check" : "X"} size={16} className={`mx-auto mb-1 ${passesLarge ? "text-green-400" : "text-red-400"}`} />
                        <div className="text-xs text-white font-medium">AA крупн.</div>
                        <div className="text-xs text-muted-foreground">{bestContrast.toFixed(1)}:1</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="glass rounded-3xl p-6">
              <h3 className="font-oswald text-xl font-bold text-white mb-2">Симуляция цветовой слепоты</h3>
              <p className="text-muted-foreground text-sm mb-4">Около 8% мужчин и 0.5% женщин имеют нарушения цветового восприятия</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { name: "Нормальное", filter: "none" },
                  { name: "Протанопия", filter: "saturate(0) sepia(100%) hue-rotate(0deg)" },
                  { name: "Дейтеранопия", filter: "saturate(0.4) sepia(60%) hue-rotate(90deg)" },
                  { name: "Тританопия", filter: "saturate(0.4) sepia(60%) hue-rotate(200deg)" },
                ].map((type) => (
                  <div key={type.name} className="glass-bright rounded-2xl p-3">
                    <div className="flex rounded-xl overflow-hidden h-10 mb-2">
                      {palette.map((c, j) => (
                        <div key={j} className="flex-1" style={{ backgroundColor: c, filter: type.filter }} />
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground text-center">{type.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeSection === "theory" && (
          <div className="animate-slide-up">
            <div className="mb-8">
              <h2 className="font-oswald text-4xl font-bold gradient-text mb-2">Теория цвета</h2>
              <p className="text-muted-foreground">Основы цветоведения для создания гармоничных дизайнов</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {THEORY_TOPICS.map((topic, i) => (
                <div key={i} className="glass rounded-3xl p-6 card-hover">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: `linear-gradient(135deg, hsl(${(i * 60) % 360}, 70%, 50%), hsl(${(i * 60 + 40) % 360}, 70%, 50%))` }}>
                    <Icon name={topic.icon} size={22} className="text-white" />
                  </div>
                  <h3 className="font-oswald text-lg font-bold text-white mb-2">{topic.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{topic.desc}</p>
                </div>
              ))}
            </div>
            <div className="glass rounded-3xl p-6">
              <h3 className="font-oswald text-2xl font-bold text-white mb-4">Тёплые и холодные цвета</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="h-16 rounded-2xl mb-3" style={{ background: "linear-gradient(to right, #FF4500, #FF6B35, #FF8C00, #FFA500, #FFD700)" }} />
                  <h4 className="font-semibold text-white mb-2">Тёплые цвета</h4>
                  <p className="text-sm text-muted-foreground">Красные, оранжевые и жёлтые оттенки. Создают ощущение энергии, тепла и близости. Отлично для призывов к действию.</p>
                </div>
                <div>
                  <div className="h-16 rounded-2xl mb-3" style={{ background: "linear-gradient(to right, #0000CD, #4169E1, #1E90FF, #00BFFF, #00CED1)" }} />
                  <h4 className="font-semibold text-white mb-2">Холодные цвета</h4>
                  <p className="text-sm text-muted-foreground">Синие, зелёные и фиолетовые оттенки. Ассоциируются с покоем, профессионализмом и надёжностью. Идеальны для корпоративных сайтов.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}