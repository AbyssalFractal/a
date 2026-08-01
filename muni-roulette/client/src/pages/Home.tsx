import React, { useState, useEffect, useRef, useCallback } from "react";
import { Shuffle, RotateCcw, Copy, Check } from "lucide-react";

const HISTORY_KEY = "muni-roulette:history";

// 日本の全市区町村データ (SSDSE-A-2025より)
import municipalitiesData from "../data/municipalities.json";

function fmtNum(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("ja-JP") : "0";
}

function buildTemplateText(entry: any, cumulative: number): string {
  return `<LaTex>{entry.pref}</LaTex>{entry.name}
${entry.intro}

人口: ${fmtNum(entry.population)}人
累計人口: ${fmtNum(cumulative)}人`;
}

interface HistoryEntry {
  entry: any;
  cumulative: number;
  order: number;
  pickedAt: number;
}

export default function Home() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [reelText, setReelText] = useState("");
  const [winner, setWinner] = useState<HistoryEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fetchingIntro, setFetchingIntro] = useState(false);
  const spinTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      let h: HistoryEntry[] = [];
      try {
        const stored = localStorage.getItem(HISTORY_KEY);
        if (stored) h = JSON.parse(stored);
      } catch (e) {
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
        } catch (e2) {}
      }
      if (!cancelled) {
        setHistory(h);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (spinTimer.current) clearInterval(spinTimer.current);
    };
  }, []);

  const persistHistory = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch (e) {}
  }, []);

  const pickedIds = new Set(history.map((h) => h.entry.id));
  const remaining = municipalitiesData.filter((m: any) => !pickedIds.has(m.id));
  const cumulativeTotal = history.reduce((sum, h) => sum + Number(h.entry.population || 0), 0);

  function handleSpin() {
    if (spinning || remaining.length === 0) return;
    setCopied(false);
    setSpinning(true);
    setWinner(null);
    let ticks = 0;
    const maxTicks = 16;
    spinTimer.current = setInterval(() => {
      const r = remaining[Math.floor(Math.random() * remaining.length)];
      setReelText(`<LaTex>{r.pref}</LaTex>{r.name}`);
      ticks += 1;
      if (ticks >= maxTicks) {
        if (spinTimer.current) clearInterval(spinTimer.current);
        const chosen = remaining[Math.floor(Math.random() * remaining.length)];
        const cumulative = cumulativeTotal + Number(chosen.population || 0);
        const order = history.length + 1;
        const entry: HistoryEntry = { entry: chosen, cumulative, order, pickedAt: Date.now() };
        const nextHistory = [...history, entry];
        persistHistory(nextHistory);
        setWinner(entry);
        setSpinning(false);
      }
    }, 90);
  }

  function handleResetHistory() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    persistHistory([]);
    setWinner(null);
    setConfirmReset(false);
  }

  function handleCopy() {
    if (!winner) return;
    const text = buildTemplateText(winner.entry, winner.cumulative);
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {}
  }

  const updateEntryIntro = useCallback((id: string, intro: string) => {
    setHistory((prevHistory) => {
      const nextHistory = prevHistory.map((h) =>
        h.entry.id === id ? { ...h, entry: { ...h.entry, intro } } : h
      );
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      } catch (e) {}
      return nextHistory;
    });
    setWinner((prevWinner) =>
      prevWinner && prevWinner.entry.id === id
        ? { ...prevWinner, entry: { ...prevWinner.entry, intro } }
        : prevWinner
    );
  }, []);

  // 当選した市町村に紹介文が無ければ Wikipedia から自動取得する
  useEffect(() => {
    if (!winner || winner.entry.intro) return;
    let cancelled = false;
    const winnerRef = winner;
    async function run() {
      setFetchingIntro(true);
      try {
        const query = `<LaTex>{winnerRef.entry.pref}</LaTex>{winnerRef.entry.name}`;

        // まず Wikipedia 検索 API でページを探す
        const searchRes = await fetch(
          `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
            query
          )}&format=json&origin=*`
        );
        if (!searchRes.ok) throw new Error("search failed");
        const searchData = await searchRes.json();
        const results = searchData.query?.search || [];
        if (results.length === 0) throw new Error("no results");

        // 最初の検索結果のタイトルを使用
        const pageTitle = results[0].title;

        // そのページから抽出を取得
        const extractRes = await fetch(
          `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
        );
        if (!extractRes.ok) throw new Error("extract failed");
        const extractData = await extractRes.json();
        let extract = extractData.extract || "";

        // 2～3行の紹介文を抽出（句点で分割して2～3文を取得）
        const sentences = extract.split(/(?<=。)/g).filter((s: string) => s.trim());
        let intro = "";
        if (sentences.length >= 2) {
          intro = (sentences[0] + sentences[1]).slice(0, 200);
        } else if (sentences.length === 1) {
          intro = sentences[0].slice(0, 200);
        } else {
          intro = extract.slice(0, 200);
        }

        if (!cancelled && intro) updateEntryIntro(winnerRef.entry.id, intro);
      } catch (e) {
        if (!cancelled) updateEntryIntro(winnerRef.entry.id, "(紹介文の自動取得に失敗しました)");
      } finally {
        if (!cancelled) setFetchingIntro(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [winner, updateEntryIntro]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
        <div className="text-center">
          <div className="inline-block animate-spin mb-4">
            <Shuffle className="w-8 h-8 text-amber-700" />
          </div>
          <p className="text-amber-900 font-medium">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 pb-16">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');
        .serif { font-family: 'Shippori Mincho', serif; }
        .stamp-btn:active { transform: scale(0.97); }
        @keyframes stampIn {
          0% { transform: scale(2.4) rotate(-18deg); opacity: 0; }
          60% { transform: scale(0.92) rotate(-8deg); opacity: 1; }
          100% { transform: scale(1) rotate(-8deg); opacity: 1; }
        }
        .stamp-mark { animation: stampIn 0.45s cubic-bezier(.2,.8,.3,1) both; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.35s ease both; }
      `}</style>

      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 pt-9 pb-5">
        <div className="text-xs tracking-widest font-bold text-amber-700 mb-2">全国町巡り抽選帳</div>
        <h1 className="serif text-4xl font-black text-amber-900 mb-1">市町村ルーレット</h1>
        <p className="text-sm text-amber-800">
          残り <span className="font-bold text-amber-900">{remaining.length}</span> / 全{" "}
          <span className="font-bold text-amber-900">{municipalitiesData.length}</span> 市町村
        </p>
      </div>

      {/* Roulette card */}
      <div className="max-w-2xl mx-auto px-4 mb-4">
        <div className="relative bg-white border border-amber-200 rounded-lg p-9 min-h-56 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
          {!winner && !spinning && (
            <div className="text-amber-700">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-amber-300 mx-auto mb-4 flex items-center justify-center">
                <Shuffle size={30} className="text-amber-300" />
              </div>
              <p className="text-sm">日本全国の市町村からランダムに選ばれます。</p>
            </div>
          )}

          {spinning && (
            <div className="serif text-2xl font-bold text-amber-900 tracking-wide">{reelText || "抽選中…"}</div>
          )}

          {winner && !spinning && (
            <div className="fade-up w-full relative">
              <div
                className="stamp-mark absolute -top-1 right-1 w-16 h-16 rounded-full border-4 border-rose-600 text-rose-600 flex items-center justify-center font-black text-sm"
                style={{ transform: "rotate(-8deg)", opacity: 0.9 }}
              >
                当選
              </div>
              <div className="text-xs font-bold text-amber-700 mb-1">{winner?.order}箇所目</div>
              <h2 className="serif text-2xl font-black text-amber-900 mb-2">
                {winner?.entry.pref}
                {winner?.entry.name}
              </h2>
              <p className="text-sm leading-relaxed text-amber-900 mb-4 text-left">
                {fetchingIntro ? "紹介文を自動取得中…" : winner?.entry.intro || "(紹介文未登録)"}
              </p>
              <div className="border-t border-amber-200 pt-3 text-left text-sm">
                <div className="mb-1">
                  人口:<span className="font-bold">{fmtNum(winner?.entry.population)}</span>人
                </div>
                <div className="mb-3">
                  累計人口:<span className="font-bold text-amber-900">{fmtNum(winner?.cumulative)}</span>人
                </div>
              </div>
              <button
                onClick={handleCopy}
                className="stamp-btn mt-4 border border-amber-900 text-amber-900 bg-transparent rounded px-3 py-2 text-xs font-medium inline-flex items-center gap-2 hover:bg-amber-50 transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "コピーしました" : "定型文をコピー"}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleSpin}
          disabled={spinning || remaining.length === 0}
          className="stamp-btn w-full mt-3 py-3 rounded-lg border-none font-bold text-sm transition-all"
          style={{
            background: remaining.length === 0 ? "#d4af9a" : "#c85a3a",
            color: "#fef5f1",
            cursor: remaining.length === 0 || spinning ? "not-allowed" : "pointer",
            opacity: remaining.length === 0 || spinning ? 0.7 : 1,
          }}
        >
          <div className="flex items-center justify-center gap-2">
            <Shuffle size={18} />
            {remaining.length === 0 ? "すべて選出済みです" : spinning ? "抽選中…" : "抽選する"}
          </div>
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 pt-7">
          <div className="text-sm font-bold text-amber-900 mb-3">
            これまでの記録(累計人口:{fmtNum(cumulativeTotal)}人)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {[...history].reverse().map((h) => (
              <div
                key={h.entry.id + h.pickedAt}
                className="bg-white border border-amber-200 rounded p-3 shadow-xs"
              >
                <div className="text-xs font-bold text-amber-700 mb-1">{h.order}箇所目</div>
                <div className="text-sm font-bold text-amber-900">{h.entry.pref}</div>
                <div className="text-sm font-bold text-amber-900 mb-1">{h.entry.name}</div>
                <div className="text-xs text-amber-700">人口 {fmtNum(h.entry.population)}人</div>
              </div>
            ))}
          </div>
          <button
            onClick={handleResetHistory}
            className="stamp-btn text-xs font-medium inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{
              color: confirmReset ? "#c85a3a" : "#a89080",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <RotateCcw size={12} />
            {confirmReset ? "もう一度押すと記録をリセットします" : "抽選記録をリセット"}
          </button>
        </div>
      )}
    </div>
  );
}
