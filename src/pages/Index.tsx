import { useState, useCallback, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";

type Section = "generator" | "analyzer" | "gallery" | "export" | "tests" | "theory";

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
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
  const l1 = getLuminance(hex1), l2 = getLuminance(hex2);
  const bright = Math.max(l1, l2), dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function hexToHsl(hex: string): [number, number, number] {
  let { r, g, b } = hexToRgb(hex);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function mixColors(hex1: string, hex2: string, ratio: number): string {
  const a = hexToRgb(hex1), b = hexToRgb(hex2);
  const r = Math.round(a.r * (1 - ratio) + b.r * ratio);
  const g = Math.round(a.g * (1 - ratio) + b.g * ratio);
  const bv = Math.round(a.b * (1 - ratio) + b.b * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`;
}

function generateMixSteps(hex1: string, hex2: string, steps: number): string[] {
  return Array.from({ length: steps }, (_, i) => mixColors(hex1, hex2, i / (steps - 1)));
}

function generatePalette(h: number, s: number, l: number, mode: string): string[] {
  if (mode === "analogous") return [
    hslToHex((h - 30 + 360) % 360, s, l), hslToHex((h - 15 + 360) % 360, s, l),
    hslToHex(h, s, l), hslToHex((h + 15) % 360, s, l), hslToHex((h + 30) % 360, s, l),
  ];
  if (mode === "complementary") return [
    hslToHex(h, s, Math.max(20, l - 20)), hslToHex(h, s, l),
    hslToHex(h, Math.max(10, s - 20), Math.min(90, l + 20)),
    hslToHex((h + 180) % 360, s, l), hslToHex((h + 180) % 360, s, Math.max(20, l - 20)),
  ];
  if (mode === "triadic") return [
    hslToHex(h, s, l), hslToHex((h + 120) % 360, s, l), hslToHex((h + 240) % 360, s, l),
    hslToHex(h, Math.max(10, s - 20), Math.min(90, l + 20)),
    hslToHex((h + 120) % 360, Math.max(10, s - 20), Math.min(90, l + 20)),
  ];
  return [
    hslToHex(h, s, Math.max(10, l - 30)), hslToHex(h, s, Math.max(10, l - 15)),
    hslToHex(h, s, l), hslToHex(h, s, Math.min(95, l + 15)), hslToHex(h, s, Math.min(95, l + 30)),
  ];
}

// K-means color quantization from image
function extractColorsFromImage(img: HTMLImageElement, count = 8): string[] {
  const canvas = document.createElement("canvas");
  const MAX = 120;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // Sample pixels
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    // Skip near-black and near-white
    const bright = (r + g + b) / 3;
    if (bright < 20 || bright > 235) continue;
    pixels.push([r, g, b]);
  }

  if (pixels.length === 0) return [];

  // Simple k-means
  let centers: [number, number, number][] = [];
  const step = Math.floor(pixels.length / count);
  for (let i = 0; i < count; i++) centers.push([...pixels[i * step]] as [number, number, number]);

  for (let iter = 0; iter < 12; iter++) {
    const sums: [number, number, number, number][] = Array.from({ length: count }, () => [0, 0, 0, 0]);
    for (const [r, g, b] of pixels) {
      let best = 0, bestDist = Infinity;
      for (let k = 0; k < count; k++) {
        const dr = r - centers[k][0], dg = g - centers[k][1], db = b - centers[k][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) { bestDist = d; best = k; }
      }
      sums[best][0] += r; sums[best][1] += g; sums[best][2] += b; sums[best][3]++;
    }
    centers = sums.map(([r, g, b, n], i) =>
      n > 0 ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : centers[i]
    );
  }

  // Sort by cluster size (most common first)
  const clusterSizes = new Array(count).fill(0);
  for (const [r, g, b] of pixels) {
    let best = 0, bestDist = Infinity;
    for (let k = 0; k < count; k++) {
      const dr = r - centers[k][0], dg = g - centers[k][1], db = b - centers[k][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; best = k; }
    }
    clusterSizes[best]++;
  }

  return centers
    .map((c, i) => ({ hex: `#${c[0].toString(16).padStart(2, "0")}${c[1].toString(16).padStart(2, "0")}${c[2].toString(16).padStart(2, "0")}`, size: clusterSizes[i] }))
    .sort((a, b) => b.size - a.size)
    .map(x => x.hex);
}

const GALLERY_PALETTES = [
  // Тёплый
  { name: "Закат над морем", mood: "Тёплый", colors: ["#FF6B6B", "#FF8E53", "#FF6B9D", "#C44569", "#F8A5C2"] },
  { name: "Осенний лес", mood: "Тёплый", colors: ["#D62828", "#F77F00", "#FCBF49", "#EAE2B7", "#A44200"] },
  { name: "Апельсиновый сок", mood: "Тёплый", colors: ["#FF4800", "#FF6D00", "#FF9100", "#FFAB40", "#FFD180"] },
  { name: "Огонь", mood: "Тёплый", colors: ["#D00000", "#E85D04", "#F48C06", "#FAA307", "#FFBA08"] },
  { name: "Тосканское лето", mood: "Тёплый", colors: ["#C1440E", "#E8835A", "#F0B27A", "#F7DC6F", "#FDEBD0"] },
  // Холодный
  { name: "Северное сияние", mood: "Холодный", colors: ["#0F3460", "#16213E", "#0A7CFF", "#00D4AA", "#7B2FBE"] },
  { name: "Зимний бриз", mood: "Холодный", colors: ["#CAF0F8", "#90E0EF", "#00B4D8", "#0077B6", "#03045E"] },
  { name: "Арктика", mood: "Холодный", colors: ["#E8F4F8", "#A8DADC", "#457B9D", "#1D3557", "#0D1B2A"] },
  { name: "Глубокий океан", mood: "Холодный", colors: ["#05668D", "#028090", "#00A896", "#02C39A", "#F0F3BD"] },
  { name: "Полярная ночь", mood: "Холодный", colors: ["#001219", "#005F73", "#0A9396", "#94D2BD", "#E9D8A6"] },
  // Природный
  { name: "Лесная прогулка", mood: "Природный", colors: ["#2D5016", "#57863A", "#8DB84A", "#C8E6C9", "#F1F8E9"] },
  { name: "Джунгли", mood: "Природный", colors: ["#004B23", "#006400", "#007200", "#38B000", "#70E000"] },
  { name: "Цветущий луг", mood: "Природный", colors: ["#606C38", "#283618", "#FEFAE0", "#DDA15E", "#BC6C25"] },
  { name: "Морской берег", mood: "Природный", colors: ["#F4E1C1", "#A8C5B5", "#5E8B7E", "#2F6B5E", "#1A3C34"] },
  { name: "Весенний сад", mood: "Природный", colors: ["#D8F3DC", "#B7E4C7", "#74C69D", "#40916C", "#1B4332"] },
  // Тёмный
  { name: "Городская ночь", mood: "Тёмный", colors: ["#1A1A2E", "#16213E", "#0F3460", "#533483", "#E94560"] },
  { name: "Готика", mood: "Тёмный", colors: ["#0D0208", "#003B00", "#008F11", "#00FF41", "#C8E6C9"] },
  { name: "Угольный", mood: "Тёмный", colors: ["#212121", "#37474F", "#546E7A", "#78909C", "#B0BEC5"] },
  { name: "Полночь", mood: "Тёмный", colors: ["#10002B", "#240046", "#3C096C", "#7B2FBE", "#E0AAFF"] },
  // Нежный
  { name: "Сакура", mood: "Нежный", colors: ["#FFB7C5", "#FF69B4", "#FF1493", "#C71585", "#4A0020"] },
  { name: "Лаванда", mood: "Нежный", colors: ["#E6DEFF", "#C4B5FD", "#A78BFA", "#7C3AED", "#4C1D95"] },
  { name: "Макарун", mood: "Нежный", colors: ["#FFCAD4", "#F4ACB7", "#FFDFEB", "#CDB4DB", "#BDE0FE"] },
  { name: "Рассвет", mood: "Нежный", colors: ["#FFF1E6", "#FFDDD2", "#FFBCAF", "#F4978E", "#F08080"] },
  { name: "Ванильный крем", mood: "Нежный", colors: ["#FFF8E7", "#FCEBD3", "#F7D9A8", "#F0C27F", "#E8A857"] },
  // Земляной
  { name: "Пустыня", mood: "Земляной", colors: ["#C4A882", "#A0845C", "#7B5E3D", "#DEB887", "#F5DEB3"] },
  { name: "Терракота", mood: "Земляной", colors: ["#9B2335", "#B5451B", "#C4622D", "#D4845A", "#E8C49A"] },
  { name: "Шоколад", mood: "Земляной", colors: ["#3E1F00", "#6F3200", "#9C4A1A", "#C47C3A", "#E8B882"] },
  { name: "Пшеничное поле", mood: "Земляной", colors: ["#F5E6C8", "#E8CC88", "#C8A84B", "#A07830", "#704820"] },
  // Цифровой
  { name: "Техно", mood: "Цифровой", colors: ["#00FFFF", "#00FF41", "#FF00FF", "#0D0D0D", "#1A1A1A"] },
  { name: "Киберпанк", mood: "Цифровой", colors: ["#FF006E", "#FB5607", "#FFBE0B", "#3A86FF", "#8338EC"] },
  { name: "Неон", mood: "Цифровой", colors: ["#FF00FF", "#00FFFF", "#FF3366", "#33FF00", "#0033FF"] },
  { name: "Vaporwave", mood: "Цифровой", colors: ["#FF6EC7", "#A855F7", "#6366F1", "#22D3EE", "#F0ABFC"] },
  // Бренд / UI
  { name: "Корпоративный", mood: "Бренд", colors: ["#003087", "#0057B7", "#0078D4", "#50ABF1", "#C7E0F4"] },
  { name: "Стартап", mood: "Бренд", colors: ["#6366F1", "#8B5CF6", "#EC4899", "#F43F5E", "#FB923C"] },
  { name: "Минимализм", mood: "Бренд", colors: ["#FFFFFF", "#F5F5F5", "#E0E0E0", "#9E9E9E", "#212121"] },
  { name: "Монохром", mood: "Бренд", colors: ["#F8F9FA", "#DEE2E6", "#868E96", "#343A40", "#212529"] },
];

const THEORY_TOPICS = [
  { icon: "Palette", title: "Цветовой круг", desc: "Цветовой круг — основа всех цветовых схем. Он состоит из 12 оттенков: 3 основных (красный, жёлтый, синий), 3 вторичных и 6 третичных цветов." },
  { icon: "Sun", title: "Тон, насыщенность, яркость", desc: "Тон — это сам цвет (0–360°). Насыщенность — интенсивность от серого до чистого цвета. Яркость — от чёрного до белого." },
  { icon: "Layers", title: "Цветовые схемы", desc: "Аналогичная — соседние оттенки. Комплементарная — противоположные. Триадная — три равноудалённых. Монохромная — один оттенок." },
  { icon: "Eye", title: "Психология цвета", desc: "Красный — энергия и срочность. Синий — доверие и спокойствие. Зелёный — рост и природа. Жёлтый — оптимизм. Фиолетовый — креативность." },
  { icon: "Activity", title: "Контрастность и доступность", desc: "WCAG 2.1 требует контраст 4.5:1 для обычного текста и 3:1 для крупного. Это важно для пользователей с нарушениями зрения." },
  { icon: "Wand2", title: "60-30-10 Правило", desc: "Доминирующий цвет занимает 60%, вторичный — 30%, акцентный — 10%. Это создаёт визуальный баланс и гармонию в дизайне." },
];

// ─── RGBWheel ──────────────────────────────────────────────────────────────────
function ColorWheel({ hue, onSelect }: {
  hue: number; saturation?: number; lightness?: number;
  onSelect: (h: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const SIZE = 240, CX = 120, CY = 120, R = 112;

  const getAngleFromEvent = (e: React.MouseEvent | MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const x = (e.clientX - rect.left) * scaleX - CX;
    const y = (e.clientY - rect.top) * scaleY - CY;
    let angle = Math.atan2(y, x) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return Math.round(angle) % 360;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(SIZE, SIZE);
    const data = imageData.data;

    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const dx = px - CX, dy = py - CY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > R) continue;

        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += 2 * Math.PI;
        const t = angle / (2 * Math.PI);

        const r6 = t * 6;
        const sector = Math.floor(r6) % 6;
        const frac = r6 - Math.floor(r6);

        let r = 0, g = 0, b = 0;
        if (sector === 0) { r = 255; g = Math.round(frac * 255); b = 0; }
        else if (sector === 1) { r = Math.round((1 - frac) * 255); g = 255; b = 0; }
        else if (sector === 2) { r = 0; g = 255; b = Math.round(frac * 255); }
        else if (sector === 3) { r = 0; g = Math.round((1 - frac) * 255); b = 255; }
        else if (sector === 4) { r = Math.round(frac * 255); g = 0; b = 255; }
        else { r = 255; g = 0; b = Math.round((1 - frac) * 255); }

        const sat = dist / R;
        r = Math.round(r * sat + 255 * (1 - sat));
        g = Math.round(g * sat + 255 * (1 - sat));
        b = Math.round(b * sat + 255 * (1 - sat));

        const idx = (py * SIZE + px) * 4;
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const hueAngle = (hue / 360) * 2 * Math.PI;
    const dotDist = R * 0.78;
    const dotX = CX + dotDist * Math.cos(hueAngle);
    const dotY = CY + dotDist * Math.sin(hueAngle);
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath();
    ctx.arc(dotX, dotY, 14, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.stroke();
  }, [hue]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDragging.current) onSelect(getAngleFromEvent(e)); };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onSelect]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    onSelect(getAngleFromEvent(e));
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} width={SIZE} height={SIZE}
        onMouseDown={handleMouseDown}
        className="cursor-crosshair rounded-full select-none"
        style={{ filter: "drop-shadow(0 0 20px rgba(150,80,230,0.4))", touchAction: "none" }} />
      <p className="text-xs text-muted-foreground">Кликните или тяните по RGB-кругу чтобы выбрать цвет</p>
    </div>
  );
}

// ─── Photo Color Extractor ─────────────────────────────────────────────────────
type PhotoAction = "palette" | "analyzer" | "mixer-a" | "mixer-b";

function PhotoExtractor({ onApply }: {
  onApply: (colors: string[], action: PhotoAction) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setLoading(true); setColors([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setImageUrl(url);
      const img = new Image();
      img.onload = () => { setColors(extractColorsFromImage(img, 8)); setLoading(false); };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const copyColor = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopied(hex);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mt-6 glass rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(195,100%,45%), hsl(270,80%,55%))" }}>
          <Icon name="ImageSearch" size={18} className="text-white" />
        </div>
        <div>
          <h3 className="font-oswald text-xl font-bold text-white">Цвета из фото</h3>
          <p className="text-xs text-muted-foreground">Загрузите изображение — извлечём доминирующие цвета</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center min-h-[220px] overflow-hidden
            ${dragging ? "border-purple-400 bg-purple-500/10" : "border-white/15 hover:border-white/30 hover:bg-white/5"}`}>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
          {imageUrl ? (
            <img src={imageUrl} alt="uploaded" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, hsl(270,80%,40%), hsl(195,100%,35%))" }}>
                <Icon name="Upload" size={24} className="text-white" />
              </div>
              <div>
                <p className="text-white font-medium">Перетащите фото сюда</p>
                <p className="text-muted-foreground text-sm mt-1">или нажмите чтобы выбрать файл</p>
                <p className="text-muted-foreground text-xs mt-1">JPG, PNG, WebP, GIF</p>
              </div>
            </div>
          )}
          {imageUrl && (
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-sm font-medium">Нажмите чтобы заменить</p>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex flex-col gap-3">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[120px]">
              <div className="w-10 h-10 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
              <p className="text-muted-foreground text-sm">Анализирую цвета...</p>
            </div>
          )}
          {!loading && colors.length === 0 && (
            <div className="flex-1 flex items-center justify-center min-h-[120px]">
              <p className="text-muted-foreground text-sm text-center">Загрузите фото<br />чтобы увидеть цвета</p>
            </div>
          )}
          {!loading && colors.length > 0 && (
            <>
              <div className="flex rounded-2xl overflow-hidden h-12">
                {colors.map((c, i) => (
                  <div key={i} className="flex-1 cursor-pointer transition-all hover:flex-[2]"
                    style={{ backgroundColor: c }}
                    onClick={() => setActiveColor(activeColor === c ? null : c)} />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 flex-1">
                {colors.map((c, i) => (
                  <div key={i}
                    className={`flex items-center gap-2 glass-bright rounded-xl p-2 cursor-pointer transition-all group ${activeColor === c ? "ring-2 ring-white/40 bg-white/10" : "hover:bg-white/10"}`}
                    onClick={() => setActiveColor(activeColor === c ? null : c)}>
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 color-swatch" style={{ backgroundColor: c }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-white text-[11px] font-semibold">{c.toUpperCase()}</div>
                      <div className="text-[9px] text-muted-foreground">#{i + 1} по частоте</div>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      onClick={(e) => { e.stopPropagation(); copyColor(c); }}>
                      {copied === c
                        ? <Icon name="Check" size={11} className="text-green-400" />
                        : <Icon name="Copy" size={11} className="text-muted-foreground" />}
                    </button>
                  </div>
                ))}
              </div>

              {/* Action panel for selected color */}
              {activeColor && (
                <div className="rounded-2xl p-3 space-y-2 animate-fade-in" style={{ backgroundColor: `${activeColor}22`, border: `1px solid ${activeColor}44` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-md" style={{ backgroundColor: activeColor }} />
                    <span className="font-mono text-white text-xs font-bold">{activeColor.toUpperCase()}</span>
                    <span className="text-muted-foreground text-xs">— выберите действие:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { action: "analyzer" as PhotoAction, icon: "ScanEye", label: "→ Анализатор (текст)" },
                      { action: "mixer-a" as PhotoAction, icon: "Blend", label: "→ Смешать (цвет A)" },
                      { action: "mixer-b" as PhotoAction, icon: "Blend", label: "→ Смешать (цвет B)" },
                      { action: "palette" as PhotoAction, icon: "Sparkles", label: "→ В генератор" },
                    ]).map(({ action, icon, label }) => (
                      <button key={action}
                        onClick={() => { onApply([activeColor], action); setActiveColor(null); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white glass transition-all hover:bg-white/15 text-left">
                        <Icon name={icon} size={12} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!activeColor && (
                <button
                  onClick={() => onApply(colors.slice(0, 5), "palette")}
                  className="w-full py-3 rounded-2xl text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-95"
                  style={{ background: "linear-gradient(135deg, hsl(195,100%,40%), hsl(270,80%,50%))" }}>
                  <Icon name="Sparkles" size={15} className="inline mr-2" />
                  Применить как палитру в генераторе
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export PNG ────────────────────────────────────────────────────────────────
function exportPaletteAsPng(palette: string[], paletteMode: string) {
  const W = 900, H = 420;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d0a1a"); bg.addColorStop(0.5, "#0f1520"); bg.addColorStop(1, "#0a1015");
  ctx.fillStyle = bg; ctx.roundRect(0, 0, W, H, 24); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "left"; ctx.fillText("🎨  Цветовая палитра", 40, 56);

  const modeNames: Record<string, string> = { analogous: "Аналогичная", complementary: "Комплементарная", triadic: "Триадная", monochromatic: "Монохромная" };
  ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "16px sans-serif";
  ctx.fillText(`Схема: ${modeNames[paletteMode] ?? paletteMode}`, 40, 82);

  const blockW = (W - 80 - (palette.length - 1) * 12) / palette.length;
  const blockH = 180, blockY = 110;

  palette.forEach((color, i) => {
    const x = 40 + i * (blockW + 12);
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.fillStyle = color; ctx.roundRect(x, blockY, blockW, blockH, 16); ctx.fill();
    ctx.shadowBlur = 0;

    const { r, g, b } = hexToRgb(color);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    ctx.fillStyle = lum > 140 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)";
    ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
    ctx.fillText(color.toUpperCase(), x + blockW / 2, blockY + blockH - 18);

    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "13px sans-serif";
    ctx.fillText(["Основной", "Светлый", "Акцент", "Тёмный", "Доп."][i] ?? "", x + blockW / 2, blockY + blockH + 28);
  });

  const stripY = H - 52;
  palette.forEach((color, i) => {
    const x = 40 + i * ((W - 80) / palette.length), sw = (W - 80) / palette.length;
    ctx.fillStyle = color;
    if (i === 0) ctx.roundRect(x, stripY, sw, 20, [10, 0, 0, 10]);
    else if (i === palette.length - 1) ctx.roundRect(x, stripY, sw, 20, [0, 10, 10, 0]);
    else ctx.fillRect(x, stripY, sw, 20);
    ctx.fill();
  });

  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.font = "12px sans-serif";
  ctx.textAlign = "right"; ctx.fillText("kolorist.app", W - 40, H - 18);

  const link = document.createElement("a");
  link.download = "palette.png"; link.href = canvas.toDataURL("image/png"); link.click();
}

// ─── Main Component ────────────────────────────────────────────────────────────
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
  const [galleryFilter, setGalleryFilter] = useState<string>("Все");
  const [exportFormat, setExportFormat] = useState<"css" | "json" | "hex">("css");
  const [exportCopied, setExportCopied] = useState(false);

  // Mixer
  const [mixColor1, setMixColor1] = useState("#9B59B6");
  const [mixColor2, setMixColor2] = useState("#00D4AA");
  const [mixRatio, setMixRatio] = useState(50);
  const [mixCopied, setMixCopied] = useState<string | null>(null);
  const [mixStepsCount, setMixStepsCount] = useState(7);
  const MIX_STEPS = mixStepsCount;

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
    if (exportFormat === "css") return `:root {\n${palette.map((c, i) => `  --color-${i + 1}: ${c};`).join("\n")}\n}`;
    if (exportFormat === "json") return JSON.stringify({ palette: palette.map((c, i) => ({ name: `color-${i + 1}`, value: c })) }, null, 2);
    return palette.join(", ");
  };

  const copyExport = () => {
    navigator.clipboard.writeText(getExportText());
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const copyMix = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setMixCopied(hex);
    setTimeout(() => setMixCopied(null), 1500);
  };

  const mixedResult = mixColors(mixColor1, mixColor2, mixRatio / 100);
  const mixStepsColors = generateMixSteps(mixColor1, mixColor2, MIX_STEPS);

  const handlePhotoColors = (colors: string[], action: PhotoAction) => {
    if (colors.length === 0) return;
    const hex = colors[0];
    if (action === "palette") {
      const [h, s, l] = hexToHsl(hex);
      setHue(h); setSaturation(s); setLightness(l);
    } else if (action === "analyzer") {
      const [h, s, l] = hexToHsl(hex);
      setAnalyzerHue1(h); setAnalyzerSat1(s); setAnalyzerLit1(l);
      setColor1(hex);
      setActiveSection("analyzer");
    } else if (action === "mixer-a") {
      setMixColor1(hex);
    } else if (action === "mixer-b") {
      setMixColor2(hex);
    }
  };

  const navItems: { id: Section; label: string; icon: string }[] = [
    { id: "generator", label: "Генератор", icon: "Sparkles" },
    { id: "analyzer", label: "Анализатор", icon: "ScanEye" },
    { id: "gallery", label: "Галерея", icon: "LayoutGrid" },
    { id: "export", label: "Экспорт", icon: "Download" },
    { id: "tests", label: "Тесты", icon: "ShieldCheck" },
    { id: "theory", label: "Справка", icon: "BookOpen" },
  ];

  const sliderTrack = (type: "hue" | "sat" | "lit") => {
    if (type === "hue") return "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";
    if (type === "sat") return `linear-gradient(to right, hsl(${hue}, 0%, ${lightness}%), hsl(${hue}, 100%, ${lightness}%))`;
    return `linear-gradient(to right, hsl(${hue}, ${saturation}%, 5%), hsl(${hue}, ${saturation}%, 50%), hsl(${hue}, ${saturation}%, 95%))`;
  };

  return (
    <div className="min-h-screen mesh-bg relative overflow-hidden">
      {/* Decorative orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-8%] left-[-4%] w-[560px] h-[560px] rounded-full opacity-[0.18] animate-float"
          style={{ background: "radial-gradient(circle, hsl(268,85%,68%), transparent 65%)" }} />
        <div className="absolute bottom-[-8%] right-[-4%] w-[460px] h-[460px] rounded-full opacity-[0.13] animate-float"
          style={{ background: "radial-gradient(circle, hsl(192,100%,58%), transparent 65%)", animationDelay: "2.2s" }} />
        <div className="absolute top-[38%] right-[18%] w-[340px] h-[340px] rounded-full opacity-[0.09] animate-float-reverse"
          style={{ background: "radial-gradient(circle, hsl(322,92%,66%), transparent 65%)", animationDelay: "1s" }} />
        <div className="absolute top-[60%] left-[10%] w-[220px] h-[220px] rounded-full opacity-[0.07] animate-float"
          style={{ background: "radial-gradient(circle, hsl(148,72%,52%), transparent 65%)", animationDelay: "3s" }} />
      </div>

      <header className="relative z-20 py-4 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="glass-card rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center relative"
                style={{ background: "linear-gradient(135deg, hsl(268,85%,68%), hsl(192,100%,58%))" }}>
                <Icon name="Palette" size={18} className="text-white" />
                <div className="absolute inset-0 rounded-xl animate-pulse-glow"
                  style={{ background: "linear-gradient(135deg, hsl(268,85%,68%), hsl(192,100%,58%))", opacity: 0.4 }} />
              </div>
              <div>
                <h1 className="font-oswald text-lg font-bold text-white tracking-widest leading-none">ЦВЕТОВОЙ ПОМОЩНИК</h1>
                <p className="text-[10px] text-muted-foreground tracking-wider uppercase mt-0.5">подбор палитр для продукта</p>
              </div>
            </div>
            {/* Nav */}
            <nav className="flex items-center gap-0.5 overflow-x-auto">
              {navItems.map((item) => (
                <button key={item.id} onClick={() => setActiveSection(item.id)}
                  className={`nav-pill relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap
                    ${activeSection === item.id
                      ? "nav-pill-active"
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                    }`}>
                  <Icon name={item.icon} size={14} />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 pb-16 pt-2">

        {/* ── GENERATOR ── */}
        {activeSection === "generator" && (
          <div className="animate-slide-up">
            <div className="mb-8 pt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(268,85%,68%), hsl(192,100%,58%))" }}>
                  <Icon name="Sparkles" size={18} className="text-white" />
                </div>
                <h2 className="font-oswald text-4xl font-bold gradient-text">Генератор палитр</h2>
              </div>
              <p className="text-muted-foreground pl-[52px]">Настройте базовый цвет и выберите схему — палитра создастся автоматически</p>
              <div className="gradient-divider mt-5" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: sliders */}
              <div className="glass-card rounded-3xl p-6 space-y-5">
                <div className="relative h-28 rounded-2xl overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${hslToHex(hue, saturation, Math.max(10, lightness - 20))}, ${baseColor}, ${hslToHex((hue + 30) % 360, saturation, lightness)})` }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-oswald text-2xl font-bold text-white drop-shadow-lg tracking-widest">{baseColor.toUpperCase()}</span>
                  </div>
                </div>

                {[
                  { label: "Оттенок (Hue)", value: hue, min: 0, max: 359, unit: "°", onChange: setHue, track: sliderTrack("hue"), thumbColor: hslToHex(hue, 100, 50), thumbPos: (hue / 359) * 100 },
                  { label: "Насыщенность (Saturation)", value: saturation, min: 0, max: 100, unit: "%", onChange: setSaturation, track: sliderTrack("sat"), thumbColor: baseColor, thumbPos: saturation },
                  { label: "Яркость (Lightness)", value: lightness, min: 5, max: 95, unit: "%", onChange: setLightness, track: sliderTrack("lit"), thumbColor: baseColor, thumbPos: ((lightness - 5) / 90) * 100 },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-white">{s.label}</label>
                      <span className="text-sm font-mono text-muted-foreground">{s.value}{s.unit}</span>
                    </div>
                    <div className="relative h-4">
                      <div className="h-4 rounded-full absolute inset-0" style={{ background: s.track }} />
                      <input type="range" min={s.min} max={s.max} value={s.value}
                        onChange={(e) => s.onChange(Number(e.target.value))}
                        className="w-full absolute inset-0 opacity-0 h-4 cursor-pointer" />
                      <div className="w-5 h-5 rounded-full border-2 border-white shadow-lg absolute top-[-2px] pointer-events-none transition-all"
                        style={{ left: `calc(${s.thumbPos}% - 10px)`, backgroundColor: s.thumbColor }} />
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
                        className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${paletteMode === key ? "text-white shadow-lg" : "glass text-muted-foreground hover:text-white hover:bg-white/8"}`}
                        style={paletteMode === key ? { background: "linear-gradient(135deg, hsl(268,85%,50%), hsl(192,100%,42%))", boxShadow: "0 4px 16px rgba(140,70,230,0.4)" } : {}}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: wheel + palette */}
              <div className="space-y-4">
                <div className="glass-card rounded-3xl p-6 flex flex-col items-center">
                  <h3 className="font-oswald text-lg font-bold text-white mb-4 self-start tracking-wide">Цветовой круг</h3>
                  <ColorWheel hue={hue} saturation={saturation} lightness={lightness} onSelect={(h) => setHue(h)} />
                </div>
                <div className="glass-card rounded-3xl p-6">
                  <h3 className="font-oswald text-lg font-bold text-white mb-4 tracking-wide">Ваша палитра</h3>
                  <div className="space-y-2.5">
                    {palette.map((color, i) => (
                      <div key={i} className="flex items-center gap-3 glass-bright rounded-2xl p-3 cursor-pointer hover:bg-white/10 transition-all group"
                        onClick={() => copyColor(color)}>
                        <div className="w-12 h-12 rounded-xl color-swatch flex-shrink-0"
                          style={{ backgroundColor: color, boxShadow: `0 4px 14px ${color}60` }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-white font-semibold text-sm">{color.toUpperCase()}</div>

                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {copiedColor === color ? <Icon name="Check" size={15} className="text-green-400" /> : <Icon name="Copy" size={15} className="text-muted-foreground" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="glass-card rounded-3xl p-4">
                  <h3 className="font-oswald text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-widest">Превью палитры</h3>
                  <div className="flex rounded-2xl overflow-hidden h-14">
                    {palette.map((color, i) => <div key={i} className="flex-1 transition-all duration-300 hover:flex-[2.5]" style={{ backgroundColor: color }} />)}
                  </div>
                </div>
              </div>
            </div>

            {/* Photo Extractor */}
            <PhotoExtractor onApply={(colors, action) => handlePhotoColors(colors, action)} />

            {/* Color Mixer */}
            <div className="mt-6 glass-card rounded-3xl p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${mixColor1}, ${mixColor2})` }}>
                    <Icon name="Blend" size={20} className="text-white drop-shadow" />
                  </div>
                  <div>
                    <h3 className="font-oswald text-2xl font-bold text-white leading-none">Смешивание цветов</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Интерактивный RGB-смешиватель</p>
                  </div>
                </div>
                <button onClick={() => { setMixColor1("#9B59B6"); setMixColor2("#00D4AA"); setMixRatio(50); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-white glass-bright border border-white/10 hover:border-white/20 transition-all">
                  <Icon name="RotateCcw" size={12} />
                  Сбросить
                </button>
              </div>

              {/* Main mixing area */}
              <div className="glass-bright rounded-2xl p-5 mb-4">
                {/* Color previews + result */}
                <div className="flex items-stretch gap-3 mb-5">
                  {/* Color A preview */}
                  <div className="flex-1 rounded-xl overflow-hidden relative min-h-[80px] cursor-pointer group"
                    style={{ backgroundColor: mixColor1 }}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <span className="font-oswald text-base font-bold drop-shadow-md"
                        style={{ color: getLuminance(mixColor1) > 0.4 ? "#000" : "#fff" }}>A</span>
                      <span className="font-mono text-[10px] font-bold drop-shadow-sm"
                        style={{ color: getLuminance(mixColor1) > 0.4 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.8)" }}>
                        {mixColor1.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Gradient bar */}
                  <div className="flex-[2] rounded-xl overflow-hidden relative min-h-[80px]"
                    style={{ background: `linear-gradient(to right, ${mixColor1}, ${mixColor2})` }}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                      <div className="w-14 h-14 rounded-full border-[3px] border-white shadow-2xl transition-all"
                        style={{ backgroundColor: mixedResult, boxShadow: `0 0 24px ${mixedResult}99, 0 4px 20px rgba(0,0,0,0.4)` }} />
                    </div>
                  </div>

                  {/* Color B preview */}
                  <div className="flex-1 rounded-xl overflow-hidden relative min-h-[80px] cursor-pointer group"
                    style={{ backgroundColor: mixColor2 }}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <span className="font-oswald text-base font-bold drop-shadow-md"
                        style={{ color: getLuminance(mixColor2) > 0.4 ? "#000" : "#fff" }}>B</span>
                      <span className="font-mono text-[10px] font-bold drop-shadow-sm"
                        style={{ color: getLuminance(mixColor2) > 0.4 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.8)" }}>
                        {mixColor2.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Slider */}
                <div className="mb-4">
                  <div className="relative h-6">
                    <div className="h-6 rounded-full absolute inset-0 shadow-inner"
                      style={{ background: `linear-gradient(to right, ${mixColor1}, ${mixColor2})` }} />
                    <input type="range" min={0} max={100} value={mixRatio}
                      onChange={(e) => setMixRatio(Number(e.target.value))}
                      className="w-full absolute inset-0 opacity-0 h-6 cursor-pointer" />
                    <div className="w-7 h-7 rounded-full shadow-xl absolute top-[-2px] pointer-events-none transition-all duration-75"
                      style={{
                        left: `calc(${mixRatio}% - 14px)`,
                        backgroundColor: mixedResult,
                        border: "3px solid white",
                        boxShadow: `0 0 10px ${mixedResult}80, 0 2px 8px rgba(0,0,0,0.4)`
                      }} />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-muted-foreground font-mono">A {100 - mixRatio}%</span>
                    <span className="text-xs text-white font-mono font-semibold">{mixedResult.toUpperCase()}</span>
                    <span className="text-xs text-muted-foreground font-mono">B {mixRatio}%</span>
                  </div>
                </div>

                {/* Result info + copy */}
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: `${mixedResult}18`, border: `1px solid ${mixedResult}40` }}>
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 shadow-lg"
                    style={{ backgroundColor: mixedResult, boxShadow: `0 0 12px ${mixedResult}60` }} />
                  <div className="flex-1">
                    <div className="font-mono text-white font-bold text-sm">{mixedResult.toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground">
                      {(() => { const r = hexToRgb(mixedResult); return `rgb(${r.r}, ${r.g}, ${r.b})`; })()}
                    </div>
                  </div>
                  <button onClick={() => copyMix(mixedResult)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all active:scale-95"
                    style={{ background: mixCopied === mixedResult ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg, hsl(270,80%,45%), hsl(195,100%,40%))" }}>
                    <Icon name={mixCopied === mixedResult ? "Check" : "Copy"} size={13} />
                    {mixCopied === mixedResult ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
              </div>

              {/* Color inputs */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: "Цвет A", color: mixColor1, setColor: setMixColor1 },
                  { label: "Цвет B", color: mixColor2, setColor: setMixColor2 },
                ].map(({ label, color, setColor }) => (
                  <div key={label} className="glass-bright rounded-2xl p-3">
                    <div className="text-xs text-muted-foreground mb-2">{label}</div>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-lg shadow-md" style={{ backgroundColor: color }} />
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                          className="absolute inset-0 opacity-0 w-9 h-9 cursor-pointer rounded-lg" />
                      </div>
                      <input type="text" value={color} onChange={(e) => setColor(e.target.value)}
                        className="flex-1 glass rounded-xl px-3 py-2 text-xs font-mono text-white border border-white/10 bg-transparent outline-none focus:border-white/30 min-w-0 h-9" />
                      <button onClick={() => { const t = mixColor1; setMixColor1(mixColor2); setMixColor2(t); }}
                        className="w-9 h-9 flex items-center justify-center glass-bright rounded-xl border border-white/10 hover:border-white/20 text-muted-foreground hover:text-white transition-all flex-shrink-0"
                        title="Поменять местами">
                        <Icon name="ArrowLeftRight" size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Steps gradient */}
              <div className="glass-bright rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">Градиентная шкала</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Шагов:</span>
                    {[5, 7, 9, 11].map(n => (
                      <button key={n} onClick={() => setMixStepsCount(n)}
                        className="w-7 h-7 rounded-lg text-xs font-mono font-semibold transition-all"
                        style={mixStepsCount === n
                          ? { background: "linear-gradient(135deg,hsl(270,80%,45%),hsl(195,100%,40%))", color: "white" }
                          : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5 mb-2">
                  {mixStepsColors.map((c, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 cursor-pointer group" onClick={() => copyMix(c)}>
                      <div className="w-full rounded-lg transition-all group-hover:scale-y-110 origin-bottom relative"
                        style={{
                          height: 52,
                          backgroundColor: c,
                          boxShadow: mixCopied === c ? `0 0 14px ${c}` : "none",
                          outline: mixCopied === c ? `2px solid white` : "none",
                        }}>
                        {mixCopied === c && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Icon name="Check" size={14} className="text-white drop-shadow-md" />
                          </div>
                        )}
                      </div>
                      <span className="font-mono text-[8px] text-muted-foreground hidden lg:block group-hover:text-white transition-colors">{c.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center">Нажмите на любой цвет, чтобы скопировать</p>
              </div>
            </div>
          </div>
        )}

        {/* ── ANALYZER ── */}
        {activeSection === "analyzer" && (
          <div className="animate-slide-up">
            <div className="mb-8 pt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(192,100%,58%), hsl(148,72%,52%))" }}>
                  <Icon name="ScanEye" size={18} className="text-white" />
                </div>
                <h2 className="font-oswald text-4xl font-bold gradient-text">Анализатор контраста</h2>
              </div>
              <p className="text-muted-foreground pl-[52px]">Проверьте совместимость двух цветов и их читаемость по стандарту WCAG</p>
              <div className="gradient-divider mt-5" />
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
                <p className="text-sm text-muted-foreground">Нажмите на квадрат или введите HEX-код</p>
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

        {/* ── GALLERY ── */}
        {activeSection === "gallery" && (
          <div className="animate-slide-up">
            <div className="mb-6 pt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(322,92%,66%), hsl(28,100%,62%))" }}>
                  <Icon name="LayoutGrid" size={18} className="text-white" />
                </div>
                <h2 className="font-oswald text-4xl font-bold gradient-text-warm">Галерея палитр</h2>
              </div>
              <p className="text-muted-foreground pl-[52px]">Готовые цветовые схемы для разных стилей — нажмите, чтобы скопировать цвета</p>
              <div className="gradient-divider mt-5" />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-6">
              {["Все", "Тёплый", "Холодный", "Природный", "Тёмный", "Нежный", "Земляной", "Цифровой", "Бренд"].map(f => (
                <button key={f} onClick={() => { setGalleryFilter(f); setSelectedGallery(null); }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={galleryFilter === f
                    ? { background: "linear-gradient(135deg,hsl(270,80%,50%),hsl(322,92%,60%))", color: "white" }
                    : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {f}
                  {f !== "Все" && (
                    <span className="ml-1.5 opacity-60">{GALLERY_PALETTES.filter(p => p.mood === f).length}</span>
                  )}
                </button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground self-center">
                {(galleryFilter === "Все" ? GALLERY_PALETTES : GALLERY_PALETTES.filter(p => p.mood === galleryFilter)).length} палитр
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(galleryFilter === "Все" ? GALLERY_PALETTES : GALLERY_PALETTES.filter(p => p.mood === galleryFilter)).map((item, i) => {
                const globalIdx = GALLERY_PALETTES.indexOf(item);
                return (
                  <div key={globalIdx}
                    className={`glass-card rounded-3xl p-4 cursor-pointer card-hover transition-all ${selectedGallery === globalIdx ? "ring-1 ring-white/20 glow-purple" : ""}`}
                    onClick={() => setSelectedGallery(selectedGallery === globalIdx ? null : globalIdx)}>
                    <div className="relative flex rounded-2xl overflow-hidden h-20 mb-3">
                      {item.colors.map((c, j) => <div key={j} className="flex-1 transition-all duration-300 hover:flex-[2]" style={{ backgroundColor: c }} />)}
                      {selectedGallery === globalIdx && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl">
                          <Icon name="Check" size={20} className="text-white drop-shadow" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-1 mb-0.5">
                      <div className="font-oswald font-bold text-white text-base tracking-wide leading-tight">{item.name}</div>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                        {item.mood}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {item.colors.map((c, j) => (
                        <div key={j} className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    {selectedGallery === globalIdx && (
                      <div className="mt-3 animate-slide-up">
                        <div className="space-y-1.5 mb-3">
                          {item.colors.map((c, j) => (
                            <div key={j} className="flex items-center gap-2 cursor-pointer group/c hover:bg-white/5 rounded-lg px-1.5 py-1 transition-all"
                              onClick={(e) => { e.stopPropagation(); copyColor(c); }}>
                              <div className="w-4 h-4 rounded-md flex-shrink-0" style={{ backgroundColor: c }} />
                              <span className="font-mono text-xs text-muted-foreground group-hover/c:text-white transition-colors">{c.toUpperCase()}</span>
                              {copiedColor === c
                                ? <Icon name="Check" size={11} className="text-green-400 ml-auto" />
                                : <Icon name="Copy" size={11} className="text-muted-foreground ml-auto opacity-0 group-hover/c:opacity-100 transition-opacity" />}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const [h, s, l] = hexToHsl(item.colors[0]);
                            setHue(h); setSaturation(s); setLightness(l);
                            setActiveSection("generator");
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
                          style={{ background: "linear-gradient(135deg, hsl(270,80%,45%), hsl(322,92%,55%))" }}>
                          <Icon name="Sparkles" size={13} />
                          Применить в генератор
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── EXPORT ── */}
        {activeSection === "export" && (
          <div className="animate-slide-up">
            <div className="mb-8 pt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(28,100%,62%), hsl(48,100%,60%))" }}>
                  <Icon name="Download" size={18} className="text-white" />
                </div>
                <h2 className="font-oswald text-4xl font-bold gradient-text-warm">Экспорт палитры</h2>
              </div>
              <p className="text-muted-foreground pl-[52px]">Сохраните текущую палитру в нужном формате — код или красивое PNG-изображение</p>
              <div className="gradient-divider mt-5" />
            </div>

            <div className="glass rounded-3xl p-6 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-oswald text-xl font-bold text-white mb-1">Скачать как изображение</h3>
                  <p className="text-sm text-muted-foreground">Красивая карточка палитры в формате PNG — для презентаций, портфолио и Figma</p>
                </div>
                <button onClick={() => exportPaletteAsPng(palette, paletteMode)}
                  className="flex items-center gap-3 px-6 py-3 rounded-2xl text-white font-semibold text-sm whitespace-nowrap transition-all hover:scale-105 active:scale-95"
                  style={{ background: "linear-gradient(135deg, hsl(320,90%,55%), hsl(270,80%,50%), hsl(195,100%,45%))" }}>
                  <Icon name="ImageDown" size={18} />
                  Скачать PNG
                </button>
              </div>
              <div className="mt-5 rounded-2xl overflow-hidden border border-white/10"
                style={{ background: "linear-gradient(135deg, #0d0a1a, #0f1520)" }}>
                <div className="p-5">
                  <div className="text-white font-bold text-base mb-1">🎨  Цветовая палитра</div>
                  <div className="text-xs text-white/40 mb-4">Схема: {{ analogous: "Аналогичная", complementary: "Комплементарная", triadic: "Триадная", monochromatic: "Монохромная" }[paletteMode]}</div>
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
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
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

        {/* ── TESTS ── */}
        {activeSection === "tests" && (
          <div className="animate-slide-up">
            <div className="mb-8 pt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(148,72%,52%), hsl(192,100%,58%))" }}>
                  <Icon name="ShieldCheck" size={18} className="text-white" />
                </div>
                <h2 className="font-oswald text-4xl font-bold gradient-text">Тесты доступности</h2>
              </div>
              <p className="text-muted-foreground pl-[52px]">Проверьте вашу палитру по критериям WCAG 2.1 для инклюзивного дизайна</p>
              <div className="gradient-divider mt-5" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {palette.map((bgColor, i) => {
                const lc = getContrastRatio(bgColor, "#FFFFFF"), dc = getContrastRatio(bgColor, "#000000");
                const best = Math.max(lc, dc), textColor = lc > dc ? "#FFFFFF" : "#000000";
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
                      {[{ label: "AA норм.", pass: best >= 4.5 }, { label: "AA крупн.", pass: best >= 3 }].map((c) => (
                        <div key={c.label} className={`rounded-xl p-3 text-center ${c.pass ? "bg-green-500/15 border border-green-500/20" : "bg-red-500/15 border border-red-500/20"}`}>
                          <Icon name={c.pass ? "Check" : "X"} size={16} className={`mx-auto mb-1 ${c.pass ? "text-green-400" : "text-red-400"}`} />
                          <div className="text-xs text-white font-medium">{c.label}</div>
                          <div className="text-xs text-muted-foreground">{best.toFixed(1)}:1</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* ── THEORY ── */}
        {activeSection === "theory" && (
          <div className="animate-slide-up">
            <div className="mb-8 pt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(268,85%,68%), hsl(322,92%,66%))" }}>
                  <Icon name="BookOpen" size={18} className="text-white" />
                </div>
                <h2 className="font-oswald text-4xl font-bold gradient-text">Теория цвета</h2>
              </div>
              <p className="text-muted-foreground pl-[52px]">Основы цветоведения для создания гармоничных дизайнов</p>
              <div className="gradient-divider mt-5" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {THEORY_TOPICS.map((topic, i) => (
                <div key={i} className="glass-card rounded-3xl p-6 card-hover animate-slide-up"
                  style={{ animationDelay: `${i * 0.07}s` }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: `linear-gradient(135deg, hsl(${(i * 55 + 260) % 360}, 75%, 55%), hsl(${(i * 55 + 300) % 360}, 75%, 55%))` }}>
                    <Icon name={topic.icon} size={20} className="text-white" />
                  </div>
                  <h3 className="font-oswald text-lg font-bold text-white mb-2 tracking-wide">{topic.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{topic.desc}</p>
                </div>
              ))}
            </div>
            {/* Palette Schemes Visual Guide */}
            <div className="glass-card rounded-3xl p-6 mb-4">
              <h3 className="font-oswald text-2xl font-bold text-white mb-1">Схемы цветовых палитр</h3>
              <p className="text-muted-foreground text-sm mb-6">Как строятся разные типы палитр на цветовом круге</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  {
                    name: "Аналогичная",
                    tag: "analogous",
                    desc: "Соседние цвета на круге (±30°). Создают мягкую, гармоничную палитру. Идеальна для природных, спокойных тем.",
                    colors: ["#7B2FBE", "#9B3ED4", "#B44FE8", "#CC6FF0", "#E090FF"],
                    icon: "Waves",
                    accent: "hsl(270,80%,55%)",
                  },
                  {
                    name: "Комплементарная",
                    tag: "complementary",
                    desc: "Противоположные цвета (180° друг от друга). Высокий контраст, энергичность. Хорошо для акцентов и CTA.",
                    colors: ["#2D6BE4", "#4A85F5", "#7AAAF8", "#F5882D", "#E46A2D"],
                    icon: "ArrowLeftRight",
                    accent: "hsl(215,80%,55%)",
                  },
                  {
                    name: "Триадная",
                    tag: "triadic",
                    desc: "Три цвета на равном расстоянии (120°). Яркая и разнообразная палитра. Подходит для детских, игровых проектов.",
                    colors: ["#E44B4B", "#4BE44B", "#4B4BE4", "#E4A44B", "#4BE4E4"],
                    icon: "Triangle",
                    accent: "hsl(0,70%,58%)",
                  },
                  {
                    name: "Монохромная",
                    tag: "monochromatic",
                    desc: "Оттенки одного цвета — разная яркость и насыщенность. Элегантно и профессионально. Для минималистичных сайтов.",
                    colors: ["#1A0A36", "#3D1A7A", "#6B35CC", "#9B6DE8", "#CCB5F5"],
                    icon: "Minus",
                    accent: "hsl(260,70%,55%)",
                  },
                ].map((scheme) => (
                  <div key={scheme.tag} className="glass-bright rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, ${scheme.accent}, ${scheme.accent}88)` }}>
                        <Icon name={scheme.icon} size={16} className="text-white" />
                      </div>
                      <h4 className="font-oswald text-lg font-bold text-white">{scheme.name}</h4>
                    </div>
                    <div className="flex rounded-xl overflow-hidden h-10 mb-3">
                      {scheme.colors.map((c, i) => (
                        <div key={i} className="flex-1 transition-all hover:flex-[2]" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{scheme.desc}</p>
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {scheme.colors.map((c, i) => (
                        <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: `${c}30`, color: c, border: `1px solid ${c}50` }}>
                          {c.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* WCAG 2.1 Block */}
            <div className="glass-card rounded-3xl p-6 mb-4">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                  <Icon name="ShieldCheck" size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-oswald text-2xl font-bold text-white mb-1">Что такое WCAG 2.1?</h3>
                  <p className="text-sm text-muted-foreground">Web Content Accessibility Guidelines — международный стандарт доступности сайтов</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                WCAG 2.1 — это набор правил от организации W3C, которым должны соответствовать сайты, чтобы ими могли пользоваться <span className="text-white">все люди без исключения</span>: с нарушениями зрения, слуха, моторики или когнитивными особенностями. Стандарт используется в законодательстве многих стран как обязательное требование к государственным и коммерческим сайтам.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                {[
                  {
                    level: "A",
                    label: "Уровень A",
                    sublabel: "Базовый",
                    color: "#f59e0b",
                    desc: "Минимальные требования. Без них сайтом невозможно пользоваться людям с ограничениями.",
                  },
                  {
                    level: "AA",
                    label: "Уровень AA",
                    sublabel: "Стандартный",
                    color: "#10b981",
                    desc: "Основной ориентир для большинства сайтов. Именно этот уровень требуется по закону в большинстве стран.",
                  },
                  {
                    level: "AAA",
                    label: "Уровень AAA",
                    sublabel: "Расширенный",
                    color: "#8b5cf6",
                    desc: "Наивысший уровень. Применяется для специализированных ресурсов и государственных порталов.",
                  },
                ].map((lvl) => (
                  <div key={lvl.level} className="glass-bright rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-oswald text-2xl font-bold" style={{ color: lvl.color }}>{lvl.level}</span>
                      <div>
                        <div className="text-white text-sm font-semibold leading-none">{lvl.label}</div>
                        <div className="text-muted-foreground text-xs">{lvl.sublabel}</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{lvl.desc}</p>
                  </div>
                ))}
              </div>
              <div className="glass-bright rounded-2xl p-4">
                <h4 className="font-oswald text-base font-bold text-white mb-3">Требования к контрасту текста (уровень AA)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Обычный текст", ratio: "4.5 : 1", example: "Кегль до 18pt", color: "#10b981" },
                    { label: "Крупный текст", ratio: "3.0 : 1", example: "Кегль 18pt+ или жирный 14pt+", color: "#3b82f6" },
                    { label: "Элементы интерфейса", ratio: "3.0 : 1", example: "Кнопки, поля ввода, иконки", color: "#8b5cf6" },
                    { label: "Декоративные элементы", ratio: "—", example: "Фоны, иллюстрации — без требований", color: "#6b7280" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: `${item.color}12`, border: `1px solid ${item.color}30` }}>
                      <span className="font-oswald text-xl font-bold w-16 text-center flex-shrink-0" style={{ color: item.color }}>{item.ratio}</span>
                      <div>
                        <div className="text-white text-sm font-medium">{item.label}</div>
                        <div className="text-muted-foreground text-xs">{item.example}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-card rounded-3xl p-6">
              <h3 className="font-oswald text-2xl font-bold text-white mb-1">Тёплые и холодные цвета</h3>
              <p className="text-muted-foreground text-sm mb-5">Как температура цвета влияет на восприятие</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="glass-bright rounded-2xl p-4">
                  <div className="h-14 rounded-xl mb-4 relative overflow-hidden"
                    style={{ background: "linear-gradient(to right, #FF4500, #FF6B35, #FF8C00, #FFA500, #FFD700)" }}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white/80 drop-shadow tracking-widest uppercase">Warm</span>
                    </div>
                  </div>
                  <h4 className="font-oswald font-bold text-white mb-1.5 tracking-wide">Тёплые цвета</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">Красные, оранжевые и жёлтые оттенки. Создают ощущение энергии, тепла и близости. Отлично для призывов к действию.</p>
                </div>
                <div className="glass-bright rounded-2xl p-4">
                  <div className="h-14 rounded-xl mb-4 relative overflow-hidden"
                    style={{ background: "linear-gradient(to right, #0000CD, #4169E1, #1E90FF, #00BFFF, #00CED1)" }}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white/80 drop-shadow tracking-widest uppercase">Cool</span>
                    </div>
                  </div>
                  <h4 className="font-oswald font-bold text-white mb-1.5 tracking-wide">Холодные цвета</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">Синие, зелёные и фиолетовые оттенки. Ассоциируются с покоем, профессионализмом и надёжностью. Идеальны для корпоративных сайтов.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}