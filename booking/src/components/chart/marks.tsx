"use client";

import { useEffect, useRef, useState, type PointerEvent as RPE, type ReactNode, type WheelEvent as RWheel } from "react";

export type MarkType = "pain" | "stiff" | "numb" | "treat";
// 身体図の1筆（ペンの線）。pts は図内の相対座標 [x,y]（0〜1）の配列。
export type Stroke = { id: string; side: "front" | "back"; type: MarkType; pts: [number, number][] };
export const MARKS: { key: MarkType; label: string; color: string }[] = [
  { key: "pain", label: "痛み", color: "#ef4444" },
  { key: "stiff", label: "こり", color: "#3b82f6" },
  { key: "numb", label: "しびれ", color: "#22c55e" },
  { key: "treat", label: "治療ポイント", color: "#0d9488" },
];
export const markColor = (t: MarkType) => MARKS.find((m) => m.key === t)?.color ?? "#64748b";
export const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
// 旧形式（点 {x,y}）も新形式（線 {pts}）も Stroke[] に正規化
export function toStrokes(arr: unknown): Stroke[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((it) => {
    const o = it as Record<string, unknown>;
    if (Array.isArray(o.pts)) return { id: (o.id as string) || uid(), side: (o.side as "front" | "back") || "front", type: (o.type as MarkType) || "pain", pts: o.pts as [number, number][] };
    return { id: (o.id as string) || uid(), side: (o.side as "front" | "back") || "front", type: (o.type as MarkType) || "pain", pts: [[Number(o.x) || 0, Number(o.y) || 0]] };
  });
}

export function Pad({ label, strokes, onChange, penType, bgImg, bgNode, penColor, aspect, onTranscribed }: {
  label?: string;
  strokes: Stroke[];
  onChange: (s: Stroke[]) => void;
  penType: MarkType;
  bgImg?: string;   // /joints/<関節>/<ビュー>.png（あれば優先）
  bgNode?: ReactNode; // 画像が無い時の簡易線画
  penColor?: string; // 指定時はこの色で描画（手書きメモ用）
  aspect?: string;   // 既定 "1 / 1"。手書きメモは横長に
  onTranscribed?: (text: string) => void; // 指定時「文字起こし」ボタンを表示し、結果テキストを渡す
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [txErr, setTxErr] = useState<string | null>(null);

  // 現在の手書き線を白背景のPNGに描き出す（文字起こし用）
  const toPng = (): string | null => {
    const [wR, hR] = (aspect ?? "1 / 1").split("/").map((n) => parseFloat(n.trim()) || 1);
    const W = 1600;
    const H = Math.round(W * (hR / wR));
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
    g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = Math.max(3, Math.round(W / 320));
    for (const s of strokes) {
      if (!s.pts.length) continue;
      g.strokeStyle = penColor ?? markColor(s.type);
      g.beginPath();
      s.pts.forEach(([x, y], i) => { const px = x * W, py = y * H; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); });
      if (s.pts.length === 1) { const [x, y] = s.pts[0]; g.lineTo(x * W + 0.1, y * H + 0.1); }
      g.stroke();
    }
    return cv.toDataURL("image/png");
  };

  const transcribe = async () => {
    if (!onTranscribed || !strokes.length || busy) return;
    setBusy(true); setTxErr(null);
    try {
      const image = toPng();
      if (!image) { setTxErr("画像化に失敗"); return; }
      const res = await fetch("/api/chart/transcribe", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }),
      });
      const json = (await res.json()) as { ok?: boolean; text?: string; reason?: string };
      if (json.ok && json.text) onTranscribed(json.text);
      else setTxErr(json.reason === "nokey" ? "APIキー未設定" : "読み取れませんでした");
    } catch {
      setTxErr("通信エラー");
    } finally {
      setBusy(false);
    }
  };
  const liveRef = useRef<SVGPolylineElement>(null); // 描画中の線は再描画せず直接更新（ペン追従を軽く）
  const cur = useRef<[number, number][] | null>(null);
  const drawPtr = useRef<number | null>(null);
  // 連続で素早く書いても再描画前の直前ストロークが消えない（＝字の途切れ防止）よう最新の線配列をrefで保持
  const allRef = useRef<Stroke[]>(strokes);
  allRef.current = strokes;
  const [imgOk, setImgOk] = useState(true);
  const pt = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const poly = (pts: [number, number][]) => { const s = pts.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`); if (s.length === 1) s.push(s[0]); return s.join(" "); };
  const paint = () => {
    const el = liveRef.current;
    if (!el) return;
    if (cur.current && cur.current.length) { el.setAttribute("points", poly(cur.current)); el.style.display = ""; }
    else { el.setAttribute("points", ""); el.style.display = "none"; }
  };
  const down = (e: RPE) => {
    if (drawPtr.current !== null) return; // 既に描画中（2本目の指・手のひら等）は無視して中断させない
    const p = pt(e); if (!p) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    drawPtr.current = e.pointerId; cur.current = [p]; paint();
  };
  const move = (e: RPE) => {
    if (drawPtr.current !== e.pointerId || !cur.current) return;
    // 速いペンでも間の点を取りこぼさないよう coalesced events を全て拾う
    const ne = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const evs = ne.getCoalescedEvents ? ne.getCoalescedEvents() : [ne];
    for (const ev of evs) { const q = pt(ev); if (q) cur.current.push(q); }
    paint();
  };
  const up = (e: RPE) => {
    if (drawPtr.current !== e.pointerId) return;
    drawPtr.current = null;
    const cs = cur.current; cur.current = null; paint();
    // allRef を使って直前の線を取りこぼさず追加（高速連続書きでも消えない）
    if (cs && cs.length) {
      const next = [...allRef.current, { id: uid(), side: "front" as const, type: penType, pts: cs }];
      allRef.current = next;
      onChange(next);
    }
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        {label ? <span className="text-[11px] font-bold text-slate-500">{label}</span> : <span />}
        <div className="flex items-center gap-1">
          {txErr && <span className="text-[10px] font-bold text-rose-500">{txErr}</span>}
          {onTranscribed && (
            <button type="button" onClick={transcribe} disabled={!strokes.length || busy}
              className="rounded border border-teal-500 bg-teal-50 px-2 text-[10px] font-bold text-teal-700 disabled:opacity-40">
              {busy ? "読取中…" : "✍️文字起こし"}
            </button>
          )}
          <button type="button" onClick={() => onChange(strokes.slice(0, -1))} disabled={!strokes.length} className="rounded border border-slate-300 px-1.5 text-[10px] font-bold text-slate-500 disabled:opacity-40">戻す</button>
          <button type="button" onClick={() => onChange([])} className="rounded border border-slate-300 px-1.5 text-[10px] font-bold text-slate-500">消</button>
        </div>
      </div>
      <div ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
        className="relative w-full touch-none select-none overflow-hidden rounded-lg border bg-white" style={{ aspectRatio: aspect ?? "1 / 1", touchAction: "none", cursor: "crosshair" }}>
        {/* 背景：画像があれば優先、無ければ簡易線画 */}
        {bgImg && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bgImg} alt="" draggable={false} onError={() => setImgOk(false)} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        ) : (
          bgNode && <div className="pointer-events-none absolute inset-0">{bgNode}</div>
        )}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {strokes.map((s) => (
            <polyline key={s.id} points={poly(s.pts)} fill="none" stroke={penColor ?? markColor(s.type)} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
          <polyline ref={liveRef} points="" fill="none" stroke={penColor ?? markColor(penType)} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ display: "none" }} />
        </svg>
      </div>
    </div>
  );
}

// 身体図：ズーム＆移動できる人体図にペン描画。指はtouchイベント、ペン/マウスはpointer。
export function BodyMap({ value, onChange }: { value: Stroke[]; onChange: (s: Stroke[]) => void }) {
  const [type, setType] = useState<MarkType>("pain");
  const [mode, setMode] = useState<"draw" | "pan">("draw");
  const typeRef = useRef(type); typeRef.current = type;
  const modeRef = useRef(mode); modeRef.current = mode;
  const valueRef = useRef(value); valueRef.current = value;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);     // transform を直接当てる
  const liveRef = useRef<SVGPolylineElement>(null); // 描画中の線を直接更新（再描画なし）
  const curStroke = useRef<[number, number][] | null>(null);
  const drawPtr = useRef<number | null>(null);      // pointer(ペン/マウス)での描画ID
  const touchDraw = useRef(false);                  // touch(指)での描画中
  const panRef = useRef<null | { x: number; y: number; tx: number; ty: number }>(null);
  const [vw, setVw] = useState({ s: 1, tx: 0, ty: 0 });
  const vwRef = useRef(vw); vwRef.current = vw;
  const pinch = useRef<null | { d: number; mx: number; my: number; s: number; tx: number; ty: number }>(null);

  const MAXS = 6;
  const clampT = (s: number, tx: number, ty: number) => ({ tx: Math.min(0, Math.max(1 - s, tx)), ty: Math.min(0, Math.max(1 - s, ty)) });
  const norm = (e: { clientX: number; clientY: number }) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const toContent = (p: { x: number; y: number }): [number, number] => {
    const v = vwRef.current;
    return [Math.min(1, Math.max(0, (p.x - v.tx) / v.s)), Math.min(1, Math.max(0, (p.y - v.ty) / v.s))];
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const poly = (pts: [number, number][]) => {
    const s = pts.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`);
    if (s.length === 1) s.push(s[0]);
    return s.join(" ");
  };
  const paintLive = () => {
    const el = liveRef.current;
    if (!el) return;
    if (curStroke.current && curStroke.current.length) {
      el.setAttribute("points", poly(curStroke.current));
      el.setAttribute("stroke", markColor(typeRef.current));
      el.style.display = "";
    } else {
      el.setAttribute("points", "");
      el.style.display = "none";
    }
  };
  const applyTransform = (v: { s: number; tx: number; ty: number }) => {
    if (wrapRef.current) wrapRef.current.style.transform = `translate(${v.tx * 100}%, ${v.ty * 100}%) scale(${v.s})`;
  };
  const commitStroke = () => {
    const cs = curStroke.current;
    curStroke.current = null;
    paintLive();
    if (cs && cs.length) onChangeRef.current([...valueRef.current, { id: uid(), side: "front", type: typeRef.current, pts: cs }]);
  };

  // ── 指（タッチ）：1本=描く/移動、2本=ピンチ。スクロール奪取を防ぐため passive:false ──
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nt = (t: Touch) => norm({ clientX: t.clientX, clientY: t.clientY });
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchDraw.current = false; curStroke.current = null; paintLive(); panRef.current = null;
        const a = nt(e.touches[0]), b = nt(e.touches[1]);
        if (!a || !b) return;
        const v = vwRef.current;
        pinch.current = { d: dist(a, b) || 0.0001, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: v.s, tx: v.tx, ty: v.ty };
      } else if (e.touches.length === 1 && !pinch.current) {
        const p = nt(e.touches[0]); if (!p) return;
        if (modeRef.current === "pan") { const v = vwRef.current; panRef.current = { x: p.x, y: p.y, tx: v.tx, ty: v.ty }; }
        else { touchDraw.current = true; curStroke.current = [toContent(p)]; paintLive(); }
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length >= 2 && pinch.current) {
        const a = nt(e.touches[0]), b = nt(e.touches[1]); if (!a || !b) return;
        const nd = dist(a, b), nmx = (a.x + b.x) / 2, nmy = (a.y + b.y) / 2, pn = pinch.current;
        const ns = Math.min(MAXS, Math.max(1, pn.s * (nd / pn.d)));
        const cx = (pn.mx - pn.tx) / pn.s, cy = (pn.my - pn.ty) / pn.s;
        const t = clampT(ns, nmx - cx * ns, nmy - cy * ns);
        vwRef.current = { s: ns, tx: t.tx, ty: t.ty }; applyTransform(vwRef.current);
      } else if (e.touches.length === 1 && touchDraw.current && curStroke.current) {
        const p = nt(e.touches[0]); if (p) { curStroke.current.push(toContent(p)); paintLive(); }
      } else if (e.touches.length === 1 && panRef.current) {
        const p = nt(e.touches[0]); if (p) { const pr = panRef.current, v = vwRef.current; const t = clampT(v.s, pr.tx + (p.x - pr.x), pr.ty + (p.y - pr.y)); vwRef.current = { s: v.s, tx: t.tx, ty: t.ty }; applyTransform(vwRef.current); }
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (pinch.current && e.touches.length < 2) { pinch.current = null; setVw(vwRef.current); }
      if (e.touches.length === 0) {
        if (touchDraw.current) { touchDraw.current = false; commitStroke(); }
        if (panRef.current) { panRef.current = null; setVw(vwRef.current); }
      }
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // 中身は全てrefで最新参照するため、一度だけ登録する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ペン/マウス（pointer）：指(touch)はtouchイベントに任せて無視 ──
  const down = (e: RPE) => {
    if (e.pointerType === "touch") return;
    const p = norm(e); if (!p) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    if (modeRef.current === "pan") { const v = vwRef.current; panRef.current = { x: p.x, y: p.y, tx: v.tx, ty: v.ty }; }
    else { drawPtr.current = e.pointerId; curStroke.current = [toContent(p)]; paintLive(); }
  };
  const move = (e: RPE) => {
    if (e.pointerType === "touch") return;
    const p = norm(e); if (!p) return;
    if (drawPtr.current === e.pointerId && curStroke.current) {
      const ne = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      const evs = ne.getCoalescedEvents ? ne.getCoalescedEvents() : [ne];
      for (const ev of evs) { const q = norm(ev); if (q) curStroke.current.push(toContent(q)); }
      paintLive();
    } else if (panRef.current) {
      const pr = panRef.current, v = vwRef.current;
      const t = clampT(v.s, pr.tx + (p.x - pr.x), pr.ty + (p.y - pr.y));
      vwRef.current = { s: v.s, tx: t.tx, ty: t.ty }; applyTransform(vwRef.current);
    }
  };
  const up = (e: RPE) => {
    if (e.pointerType === "touch") return;
    if (drawPtr.current === e.pointerId) { drawPtr.current = null; commitStroke(); }
    if (panRef.current) { panRef.current = null; setVw(vwRef.current); }
  };
  const onWheel = (e: RWheel) => {
    const p = norm(e);
    if (!p) return;
    const v = vwRef.current;
    const ns = Math.min(MAXS, Math.max(1, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const cx = (p.x - v.tx) / v.s, cy = (p.y - v.ty) / v.s;
    const t = clampT(ns, p.x - cx * ns, p.y - cy * ns);
    setVw({ s: ns, tx: t.tx, ty: t.ty });
  };
  const resetView = () => setVw({ s: 1, tx: 0, ty: 0 });
  const zoomBy = (f: number) => {
    const v = vwRef.current;
    const ns = Math.min(MAXS, Math.max(1, v.s * f));
    const cx = (0.5 - v.tx) / v.s, cy = (0.5 - v.ty) / v.s;
    const t = clampT(ns, 0.5 - cx * ns, 0.5 - cy * ns);
    setVw({ s: ns, tx: t.tx, ty: t.ty });
  };
  const undo = () => onChange(value.slice(0, -1));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {MARKS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => { setType(m.key); if (mode !== "draw") setMode("draw"); }}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${type === m.key && mode === "draw" ? "text-white" : "bg-white text-slate-600"}`}
            style={type === m.key && mode === "draw" ? { backgroundColor: m.color, borderColor: m.color } : { borderColor: "#cbd5e1" }}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={undo} disabled={value.length === 0} className="rounded-full border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-500 active:bg-slate-100 disabled:opacity-40">戻す</button>
          <button type="button" onClick={() => onChange([])} className="rounded-full border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-500 active:bg-slate-100">リセット</button>
        </div>
      </div>
      <div
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={onWheel}
        className="relative w-full select-none overflow-hidden rounded-lg border bg-white"
        style={{ aspectRatio: "900 / 860", touchAction: "none", cursor: mode === "pan" ? "grab" : "crosshair" }}
      >
        <div ref={wrapRef} className="absolute inset-0" style={{ transform: `translate(${vw.tx * 100}%, ${vw.ty * 100}%) scale(${vw.s})`, transformOrigin: "0 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bodymap.png" alt="人体図（前面・背面）" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {value.map((s) => (
              <polyline key={s.id} points={poly(s.pts)} fill="none" stroke={markColor(s.type)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            <polyline ref={liveRef} points="" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ display: "none" }} />
          </svg>
        </div>
        {/* 操作バー：モード＋ズーム */}
        <div className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-white/95 px-1 py-0.5 shadow">
          <button type="button" onClick={() => setMode("draw")} className={`h-6 rounded-full px-2 text-[11px] font-bold ${mode === "draw" ? "bg-teal-600 text-white" : "text-slate-500"}`}>✏️描く</button>
          <button type="button" onClick={() => setMode("pan")} className={`h-6 rounded-full px-2 text-[11px] font-bold ${mode === "pan" ? "bg-teal-600 text-white" : "text-slate-500"}`}>✋移動</button>
          <span className="mx-0.5 h-4 w-px bg-slate-200" />
          <button type="button" onClick={() => zoomBy(1 / 1.4)} disabled={vw.s <= 1} className="h-6 w-6 rounded-full text-base font-bold text-slate-600 disabled:opacity-30">－</button>
          <span className="w-7 text-center text-[10px] font-bold text-slate-500">×{vw.s.toFixed(1)}</span>
          <button type="button" onClick={() => zoomBy(1.4)} disabled={vw.s >= MAXS} className="h-6 w-6 rounded-full text-base font-bold text-slate-600 disabled:opacity-30">＋</button>
          {vw.s > 1 && <button type="button" onClick={resetView} className="rounded-full px-1 text-[10px] font-bold text-teal-600">全体</button>}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">左＝前面／右＝背面。<b>✏️描く</b>＝1本指で線、<b>✋移動</b>＝1本指で移動。＋/－で拡大（2本指ピンチも可）。</p>
    </div>
  );
}
