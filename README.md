# 🚀 NovaTrade-Bot

> **Institutional-Grade Algorithmic Crypto Trading Bot** built in TypeScript with **Bybit V5 Demo Trading API**, **OpenRouter AI (Free / High-Reasoning LLMs)**, and **Real-Time News & Sentiment Analysis**.

---

## 🌟 Key Highlights & Features

- ⚡ **Bybit V5 Demo Trading API**: Built on official Bybit V5 Linear USDT Perps SDK (`bybit-api`) running against Bybit's dedicated demo environment (`api-demo.bybit.com`).
- 🤖 **OpenRouter AI Risk & Sentiment Evaluator**:
  - Leverages zero-cost / high-efficiency models (such as `meta-llama/llama-3.3-70b-instruct:free`, `google/gemini-2.0-flash-001`, or `deepseek/deepseek-r1:free`).
  - Acts as a Chief Quantitative Risk Officer to veto low-probability setups, false breakouts, and macro event traps.
  - Returns structured, Zod-validated JSON decisions with confidence scores (0-100) and position size multipliers.
- 📰 **Free Real-Time News & Macro Sentiment Aggregator**:
  - Direct RSS ingestion from **CoinTelegraph**, **CoinDesk**, and **Decrypt** with zero API fee.
  - **Alternative.me Fear & Greed Index** integration.
  - Derivatives sentiment tracking (Funding Rates & Open Interest spikes).
- 🎯 **Multi-Timeframe Trend & Strategy Engine**:
  - Macro trend filter (1h/4h 50/200 EMA + Market Structure).
  - Trigger timeframe (15m) EMA pullbacks + RSI momentum + volume surge confirmation.
  - Dynamic ATR-based Stop Loss sizing.
- 🛡️ **Automated 2-Stage Take-Profit & Breakeven Protection**:
  - **TP1 (1.3R)**: Closes 50% of the position to secure profits and **automatically moves Stop Loss to Entry Price (Breakeven)** to guarantee a 100% risk-free trade!
  - **TP2 (2.6R)**: Closes the remaining 50% for maximum trend expansion.
- 🔒 **Zero Hardcoding - 100% Parameterized in `.env`**:
  - All credentials, model names, risk limits, leverage, and timeframes are managed in `.env` with strict runtime Zod validation.
- 📊 **CLI Dashboard & Multi-Channel Alerts**:
  - Color-coded console tables with real-time active trade status and balance tracking.
  - Optional **Discord Webhook** and **Telegram Bot** alert broadcasts.

---

## 🏗️ Architecture

```
                                  ┌────────────────────────┐
                                  │   Bybit V5 Demo API    │
                                  │ (Tickers/Klines/Perps) │
                                  └───────────┬────────────┘
                                              │
┌───────────────────────────┐                 ▼
│ Free RSS Feeds & F&G Index│ ────► ┌───────────────────┐
└─────────────┬─────────────┘       │  Market Scanner & │
              │                     │  Feature Engine   │
              ▼                     └─────────┬─────────┘
┌───────────────────────────┐                 │
│ OpenRouter AI Filter      │ ◄───────────────┘ (Setup Candidate)
│ (Llama-3.3-70B / Gemini)  │
└─────────────┬─────────────┘
              │ (Verdict & Confidence >= 75%)
              ▼
┌───────────────────────────┐
│ Dynamic Position Sizing   │
│ (1-2% Account Risk)       │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ Bybit Order Execution     │
└─────────────┬─────────────┘
              ▼
┌────────────────────────────────────────────────────────┐
│ Active Position Manager (Every 15s)                    │
│ 1. TP1 Hit ──► Partial Close 50% + Move SL to Entry    │
│ 2. TP2 Hit ──► Close remaining 50%                     │
└────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
NovaTrade-Bot/
├── .env.example                     # Full configuration documentation
├── .env                             # Active environment variables (gitignored)
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # Modern TypeScript configuration
├── README.md                        # Documentation
├── src/
│   ├── index.ts                     # Main Bot Orchestrator & Loop
│   ├── config/
│   │   └── env.ts                   # Strict Zod schema validation for .env
│   ├── types/
│   │   └── index.ts                 # Shared TypeScript types & interfaces
│   ├── services/
│   │   ├── bybit/
│   │   │   ├── client.ts            # Bybit V5 REST Client
│   │   │   ├── market.service.ts    # Tickers, Klines, Instrument Specs
│   │   │   ├── trade.service.ts     # Order submission, balance, leverage
│   │   │   └── positionManager.ts   # TP1 partial close & Breakeven SL automation
│   │   ├── sentiment/
│   │   │   ├── news.service.ts      # Free RSS news fetcher & formatter
│   │   │   └── fearGreed.service.ts # Fear & Greed index parser
│   │   ├── ai/
│   │   │   ├── openrouter.client.ts # OpenRouter API client with fallback
│   │   │   ├── prompts.ts           # Risk & sentiment prompt templates
│   │   │   └── riskEvaluator.ts     # AI evaluation coordinator
│   │   ├── strategy/
│   │   │   ├── indicators.ts        # Fast EMA, RSI, ATR, MACD calculations
│   │   │   ├── signal.service.ts    # High-probability setup detector
│   │   │   └── scanner.service.ts   # Top liquid pairs scanner
│   │   ├── risk/
│   │   │   └── positionSizer.ts     # 1-2% equity risk-based position sizer
│   │   ├── database/
│   │   │   └── storage.ts           # JSON file state persistence
│   │   ├── notification/
│   │   │   └── webhook.service.ts   # Discord & Telegram notification sender
│   │   └── logger.ts                # Winston & Chalk logger
│   └── scripts/
│       ├── testAI.ts                # Smoke test OpenRouter AI
│       ├── testBybit.ts             # Smoke test Bybit V5 connectivity
│       ├── testNews.ts              # Smoke test RSS & Fear & Greed feeds
│       └── dryRun.ts                # Complete dry run scan without live orders
```

---

## ⚙️ Configuration (.env)

All variables must be configured in `.env` (copied from `.env.example`):

```bash
# 1. Bybit V5 Demo API Credentials
BYBIT_API_KEY=your_bybit_demo_key
BYBIT_API_SECRET=your_bybit_demo_secret
BYBIT_DEMO_TRADING=true
BYBIT_RECV_WINDOW=5000
BYBIT_ENABLE_TIME_SYNC=true

# 2. OpenRouter AI Configuration (Free Models Supported)
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_PRIMARY_MODEL=meta-llama/llama-3.3-70b-instruct:free
OPENROUTER_FALLBACK_MODEL=google/gemini-2.0-flash-001
OPENROUTER_MIN_CONFIDENCE=75
AI_ENABLED=true

# 3. Strategy & Trading Settings
TRADING_PAIRS=BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT,NEARUSDT,SUIUSDT,ADAUSDT
SCAN_INTERVAL_MINUTES=15
TRIGGER_TIMEFRAME=15
TREND_TIMEFRAME=60
LEVERAGE=5
POSITION_RISK_PERCENT=1.5
MAX_OPEN_POSITIONS=3
MIN_24H_VOLUME_USDT=10000000
MAX_SPREAD_PERCENT=0.08

# 4. Take Profit & Stop Loss Automation
SL_ATR_MULTIPLIER=1.5
TP1_RR_RATIO=1.3
TP2_RR_RATIO=2.6
TP1_CLOSE_RATIO=0.5
MOVE_SL_TO_BREAKEVEN_ON_TP1=true

# 5. News & Macro Sentiment
NEWS_FETCH_INTERVAL_MINUTES=15
ENABLE_RSS_NEWS=true
RSS_FEED_URLS=https://cointelegraph.com/rss,https://www.coindesk.com/arc/outboundfeeds/rss/
ENABLE_FEAR_GREED_INDEX=true

# 6. Notifications & Persistence
LOG_LEVEL=info
STORAGE_FILE_PATH=./data/trades.json
DISCORD_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## 🚀 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Configure Your `.env`

Copy `.env.example` to `.env` and insert your API keys:
- **Bybit Demo API Key**: Available in Bybit Account -> Demo Trading -> API Management.
- **OpenRouter API Key**: Free key from [openrouter.ai/keys](https://openrouter.ai/keys).

### 3. Verify Components

Run individual component smoke tests:

```bash
# Test News RSS & Fear & Greed Ingestion
npm run test:news

# Test Bybit V5 Public Tickers & Market Data
npm run test:bybit

# Test OpenRouter AI Model & Risk Evaluator
npm run test:ai

# Run a Dry-Run Scan Across All Pairs (No Real Orders)
npm run scan:dry
```

### 4. Start the Bot

```bash
# Development mode with hot-reloading
npm run dev

# Production build & run
npm run build
npm start
```

---

## ⚖️ Disclaimer

This software is for educational and research purposes. Cryptocurrency trading involves substantial risk of loss. Always test thoroughly using **Demo Trading / Testnet** before deploying any capital.
