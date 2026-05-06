import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";

const ROLE_STYLES = {
  user: "bg-emerald-600 text-white shadow-md shadow-emerald-200/40 dark:shadow-none",
  assistant:
    "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700/60 shadow-sm",
};

const PRESETS = [
  { label: "BTC", tv: "BINANCE:BTCUSDT", display: "BTC-USD" },
  { label: "ETH", tv: "BINANCE:ETHUSDT", display: "ETH-USD" },
  { label: "SOL", tv: "BINANCE:SOLUSDT", display: "SOL-USD" },
  { label: "AAPL", tv: "NASDAQ:AAPL", display: "AAPL" },
  { label: "TSLA", tv: "NASDAQ:TSLA", display: "TSLA" },
  { label: "NVDA", tv: "NASDAQ:NVDA", display: "NVDA" },
  { label: "SPY", tv: "AMEX:SPY", display: "SPY" },
  { label: "QQQ", tv: "NASDAQ:QQQ", display: "QQQ" },
];

const INTERVALS = [
  { id: "15", label: "15m" },
  { id: "60", label: "1H" },
  { id: "240", label: "4H" },
  { id: "D", label: "1D" },
  { id: "W", label: "1W" },
];

const QUICK_ACTIONS = [
  {
    id: "verdict",
    icon: "⚖️",
    label: "Multi-agent verdict",
    desc: "3 agents (TA + sentiment + risk) debate → consensus",
    prompt: (s) =>
      `Use mcp__tradingview__multi_agent_analysis on ${s} and return the consensus verdict — show what each of the 3 agents (Technical / Sentiment / Risk) said, then the final STRONG BUY / BUY / HOLD / SELL / STRONG SELL with confidence %.`,
  },
  {
    id: "mtf",
    icon: "📐",
    label: "Multi-timeframe",
    desc: "W → D → 4H → 1H → 15m alignment",
    prompt: (s) =>
      `Run mcp__tradingview__multi_timeframe_analysis on ${s}. Tell me which timeframes are aligned (bullish/bearish) and which are conflicting.`,
  },
  {
    id: "volume",
    icon: "🌊",
    label: "Volume flow",
    desc: "Smart money + price/volume confirmation",
    prompt: (s) =>
      `Run mcp__tradingview__smart_volume_scanner and mcp__tradingview__volume_confirmation_analysis on ${s}. Is volume confirming the move? Any divergence?`,
  },
  {
    id: "patterns",
    icon: "🕯️",
    label: "Candle patterns",
    desc: "Detect 15+ patterns on the chart",
    prompt: (s) =>
      `Run mcp__tradingview__advanced_candle_pattern on ${s} across daily and 4H. Highlight any actionable pattern.`,
  },
  {
    id: "sentiment",
    icon: "🗣️",
    label: "Sentiment + news",
    desc: "Reddit vibe + Reuters / CoinDesk feed",
    prompt: (s) =>
      `Run mcp__tradingview__market_sentiment and mcp__tradingview__financial_news on ${s}. Summarise the vibe and top 3 headlines.`,
  },
  {
    id: "backtest",
    icon: "🧪",
    label: "Backtest strategies",
    desc: "compare_strategies + walk-forward on winner",
    prompt: (s) =>
      `Run mcp__tradingview__compare_strategies on ${s} for the last 2 years. For the best one (highest Sharpe), confirm with mcp__tradingview__walk_forward_backtest_strategy. Tell me if the edge holds out-of-sample.`,
  },
  {
    id: "crypto",
    icon: "₿",
    label: "Crypto deep-dive",
    desc: "coin_analysis (crypto only)",
    prompt: (s) =>
      `Run mcp__tradingview__coin_analysis on ${s} — full crypto-specific deep dive.`,
  },
  {
    id: "recommend",
    icon: "💡",
    label: "Tips & recommendation",
    desc: "3 pragmatic moves right now",
    prompt: (s) =>
      `Based on the current setup of ${s}, give me 3 pragmatic recommendations: entry trigger, invalidation, and risk management. Use whatever mcp__tradingview__ tools you need.`,
  },
];

const DISCOVERY_ACTIONS = [
  {
    id: "movers",
    icon: "🚀",
    label: "Today's movers",
    prompt: () =>
      `Run mcp__tradingview__top_gainers and mcp__tradingview__top_losers. Pick 2 to watch — one long candidate, one short candidate — and explain why.`,
  },
  {
    id: "breakouts",
    icon: "📈",
    label: "Find breakouts",
    prompt: () =>
      `Run mcp__tradingview__volume_breakout_scanner. Top 5 candidates by confluence (volume + RSI + MACD). Rank them.`,
  },
  {
    id: "squeeze",
    icon: "🎯",
    label: "Bollinger squeeze",
    prompt: () =>
      `Run mcp__tradingview__bollinger_scan. Find symbols in tight squeeze (low volatility) about to expand. Top 5.`,
  },
  {
    id: "macro",
    icon: "🌍",
    label: "Macro snapshot",
    prompt: () =>
      `Run mcp__tradingview__market_snapshot. Tell me: risk-on or risk-off right now? VIX level? Crypto vs equities divergence?`,
  },
];

const TIPS = [
  "Multi-timeframe agreement before entry — never trust a single TF.",
  "Volume confirms — a breakout without volume is a fakeout.",
  "Walk-forward your backtest before risking capital — simple backtests overfit.",
  "Multi-agent verdict > single indicator — 3 perspectives catch what 1 misses.",
  "Risk-off macro → tighten stops, scale down position size.",
  "BB squeeze → expansion, not direction. Wait for the breakout candle.",
  "Sentiment extremes are contrarian signals — when Reddit is euphoric, take some off.",
];

function MessageBlock({ msg }) {
  return (
    <div
      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${ROLE_STYLES[msg.role]}`}
      >
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
          {msg.content}
        </pre>
      </div>
    </div>
  );
}

function StreamingBubble({ toolEvents, streamText }) {
  const latest = toolEvents[toolEvents.length - 1]?.label;
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[88%] rounded-2xl px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700/60 shadow-sm">
        {toolEvents.length > 0 && (
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
              <span
                className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"
                style={{ animationDelay: "200ms" }}
              />
              <span
                className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"
                style={{ animationDelay: "400ms" }}
              />
            </span>
            <span className="truncate">{latest || "Working"}</span>
            <span className="text-gray-400 dark:text-gray-500">
              · {toolEvents.length}
            </span>
          </div>
        )}
        {streamText ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {streamText}
          </pre>
        ) : (
          <div className="flex items-center gap-1 py-1">
            <span
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function friendlyToolLabel(name) {
  if (!name) return "Working";
  if (name === "Task") return "Delegating";
  if (name === "ToolSearch") return "Loading tool";
  if (name.startsWith("mcp__tradingview__")) {
    return (
      "TradingView: " +
      name.replace("mcp__tradingview__", "").replace(/_/g, " ")
    );
  }
  if (name.startsWith("mcp__")) return name.split("__").slice(1).join(" / ");
  return name;
}

function TradingViewChart({ symbol, interval, theme }) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const widgetDiv = document.createElement("div");
    widgetDiv.id = "tv-widget-" + Math.random().toString(36).slice(2, 9);
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    containerRef.current.appendChild(widgetDiv);

    function mount() {
      if (!window.TradingView) return;
      try {
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval,
          timezone: "Etc/UTC",
          theme: theme === "dark" ? "dark" : "light",
          style: "1",
          locale: "en",
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          allow_symbol_change: true,
          container_id: widgetDiv.id,
          studies: [
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies",
            "BB@tv-basicstudies",
          ],
        });
      } catch (e) {
        console.warn("[TradingView] widget mount failed", e);
      }
    }

    if (window.TradingView) mount();
    else {
      const existing = document.querySelector(
        'script[src="https://s3.tradingview.com/tv.js"]',
      );
      if (existing) existing.addEventListener("load", mount, { once: true });
      else {
        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = mount;
        document.body.appendChild(script);
      }
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, interval, theme]);

  return <div ref={containerRef} className="w-full h-full" />;
}

export default function Trading() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [symbol, setSymbol] = useState(
    () => localStorage.getItem("trading-symbol") || "BINANCE:BTCUSDT",
  );
  const [symbolInput, setSymbolInput] = useState("");
  const [tfInterval, setTfInterval] = useState(
    () => localStorage.getItem("trading-interval") || "D",
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolEvents, setToolEvents] = useState([]);
  const [tipIndex, setTipIndex] = useState(() =>
    Math.floor(Math.random() * TIPS.length),
  );
  const [chartTheme, setChartTheme] = useState(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  const wsRef = useRef(null);
  const bottomRef = useRef(null);

  // Watch theme
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setChartTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    localStorage.setItem("trading-symbol", symbol);
    localStorage.setItem("trading-interval", tfInterval);
  }, [symbol, tfInterval]);

  useEffect(() => {
    refreshChats();
  }, []);

  // Rotate tip every 12s
  useEffect(() => {
    const id = setInterval(
      () => setTipIndex((i) => (i + 1) % TIPS.length),
      12000,
    );
    return () => clearInterval(id);
  }, []);

  async function refreshChats() {
    try {
      const list = await api.getChats("trading");
      setChats(list);
      if (!activeId && list.length > 0) selectChat(list[0].id);
    } catch {}
  }

  async function selectChat(id) {
    setActiveId(id);
    setStreamText("");
    setToolEvents([]);
    try {
      const chat = await api.getChat(id);
      setActiveChat(chat);
    } catch {}
  }

  async function newAnalysis() {
    const c = await api.createChat({ kind: "trading", agent: "finance" });
    setChats((prev) => [c, ...prev]);
    selectChat(c.id);
  }

  async function deleteChat(id, e) {
    e.stopPropagation();
    if (!confirm("Delete this analysis?")) return;
    await api.deleteChat(id);
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setActiveChat(null);
    }
  }

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === 1) return wsRef.current;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;

    const sidebarBump = (chat) => ({
      id: chat.id,
      title: chat.title,
      kind: chat.kind,
      agent: chat.agent,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: (chat.messages || []).length,
    });

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "chat-user-saved") {
        setActiveChat(msg.chat);
        setChats((prev) => [
          sidebarBump(msg.chat),
          ...prev.filter((c) => c.id !== msg.chat.id),
        ]);
      } else if (msg.type === "chat-delta") {
        setStreamText((prev) => prev + msg.text);
      } else if (msg.type === "chat-tool") {
        setToolEvents((prev) => [
          ...prev,
          { label: friendlyToolLabel(msg.name) },
        ]);
      } else if (msg.type === "chat-done") {
        setStreaming(false);
        setStreamText("");
        setToolEvents([]);
        setActiveChat(msg.chat);
        setChats((prev) => [
          sidebarBump(msg.chat),
          ...prev.filter((c) => c.id !== msg.chat.id),
        ]);
      } else if (msg.type === "chat-stopped") {
        setStreaming(false);
      } else if (msg.type === "chat-error") {
        setStreaming(false);
        setStreamText((prev) => prev + `\n[Error] ${msg.error}`);
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    ws.onerror = () => {
      setStreaming(false);
    };
    return ws;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, streamText, toolEvents]);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  async function sendPrompt(text) {
    if (!text.trim() || streaming) return;
    let chatId = activeId;
    if (!chatId) {
      const c = await api.createChat({ kind: "trading", agent: "finance" });
      setChats((prev) => [c, ...prev]);
      setActiveId(c.id);
      setActiveChat(c);
      chatId = c.id;
    }
    const ws = connect();
    setInput("");
    setStreaming(true);
    setStreamText("");
    setToolEvents([]);
    const dispatch = () =>
      ws.send(JSON.stringify({ action: "chat-send", chatId, message: text }));
    if (ws.readyState === 1) dispatch();
    else ws.addEventListener("open", dispatch, { once: true });
  }

  function send() {
    if (!input.trim()) return;
    sendPrompt(input.trim());
  }

  function stop() {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ action: "chat-stop" }));
    }
  }

  function applySymbol(tvSymbol) {
    setSymbol(tvSymbol);
    setSymbolInput("");
  }

  function onSymbolSubmit(e) {
    e.preventDefault();
    const v = symbolInput.trim().toUpperCase();
    if (!v) return;
    if (v.includes(":")) applySymbol(v);
    else if (v.endsWith("-USD") || v.endsWith("USDT"))
      applySymbol(`BINANCE:${v.replace("-USD", "USDT")}`);
    else applySymbol(`NASDAQ:${v}`);
  }

  // Resolve a friendly symbol label for prompt usage
  const symbolLabel = symbol.includes(":")
    ? symbol.split(":")[1].replace(/USDT$/, "-USD")
    : symbol;

  function runQuick(action) {
    sendPrompt(action.prompt(symbolLabel));
  }
  function runDiscovery(action) {
    sendPrompt(action.prompt());
  }

  const messages = activeChat?.messages || [];

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-950">
      {/* Left: chart + actions */}
      <section className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-800">
        {/* Toolbar */}
        <div className="px-4 py-3 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 17l6-6 4 4 8-8M14 7h7v7"
              />
            </svg>
          </div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white mr-2">
            Trading
          </h1>

          <form onSubmit={onSymbolSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder={symbolLabel}
              className="w-40 text-xs font-mono px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium"
            >
              Load
            </button>
          </form>

          <div className="flex items-center gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.tv}
                onClick={() => applySymbol(p.tv)}
                className={`px-2 py-1 text-xs font-mono rounded-md transition-colors ${
                  symbol === p.tv
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1 border border-gray-200 dark:border-gray-800 rounded-md p-0.5">
            {INTERVALS.map((iv) => (
              <button
                key={iv.id}
                onClick={() => setTfInterval(iv.id)}
                className={`px-2 py-0.5 text-xs rounded ${
                  tfInterval === iv.id
                    ? "bg-emerald-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 bg-white dark:bg-gray-950 min-h-0">
          <TradingViewChart
            symbol={symbol}
            interval={tfInterval}
            theme={chartTheme}
          />
        </div>

        {/* Tip card */}
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-900/40 flex items-center gap-2">
          <span className="text-base">💡</span>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 flex-1">
            {TIPS[tipIndex]}
          </p>
          <button
            onClick={() => setTipIndex((i) => (i + 1) % TIPS.length)}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
          >
            next ›
          </button>
        </div>
      </section>

      {/* Right: chat with finance agent */}
      <section className="w-[480px] flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="px-4 py-3 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {activeChat?.title || "New analysis"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                @finance
              </span>{" "}
              · ask anything about{" "}
              <span className="font-mono">{symbolLabel}</span>
            </p>
          </div>
          <button
            onClick={newAnalysis}
            className="px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium flex items-center gap-1"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New
          </button>
        </div>

        {/* Quick actions for current symbol */}
        <div className="px-3 py-2 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 px-1">
            Ask about {symbolLabel}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => runQuick(a)}
                disabled={streaming}
                title={a.desc}
                className="text-left px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-gray-200 dark:border-gray-800 hover:border-emerald-300 dark:hover:border-emerald-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span>{a.icon}</span>
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {a.label}
                </span>
              </button>
            ))}
          </div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-2 mb-1.5 px-1">
            Discover (no symbol needed)
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {DISCOVERY_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => runDiscovery(a)}
                disabled={streaming}
                className="text-left px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-gray-200 dark:border-gray-800 hover:border-emerald-300 dark:hover:border-emerald-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span>{a.icon}</span>
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {messages.length === 0 && !streaming ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-3">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 17l6-6 4 4 8-8M14 7h7v7"
                  />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pick a quick action above or ask the{" "}
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  finance
                </span>{" "}
                agent anything about{" "}
                <span className="font-mono">{symbolLabel}</span>.
              </p>
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <MessageBlock key={i} msg={m} />
              ))}
              {streaming && (
                <StreamingBubble
                  toolEvents={toolEvents}
                  streamText={streamText}
                />
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-950">
          <div className="flex items-end gap-2 border border-gray-300 dark:border-gray-700 rounded-2xl px-3 py-2 bg-white dark:bg-gray-900 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 dark:focus-within:ring-emerald-900/40 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Ask about ${symbolLabel}...`}
              disabled={streaming}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none max-h-32"
              style={{ minHeight: "24px" }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 128) + "px";
              }}
            />
            {streaming ? (
              <button
                onClick={stop}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg font-medium"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium"
              >
                Ask
              </button>
            )}
          </div>
          {chats.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
              {chats.slice(0, 5).map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectChat(c.id)}
                  className={`px-2 py-1 text-xs rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 group ${
                    activeId === c.id
                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="truncate max-w-[140px]">{c.title}</span>
                  <span
                    onClick={(e) => deleteChat(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-500"
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
