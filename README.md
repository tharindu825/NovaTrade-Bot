# 🚀 NovaTrade-Bot

> **Institutional-Grade Algorithmic Crypto Trading Bot** built in TypeScript with **Bybit V5 Demo Trading API**, **OpenRouter AI (Free / High-Reasoning LLMs)**, and **Real-Time News & Sentiment Analysis**.

---

## 🌟 Key Highlights & Features

- ⚡ **Bybit V5 Demo Trading API**: Built on the official Bybit V5 Linear USDT Perps SDK (`bybit-api`) running against Bybit's dedicated demo environment (`api-demo.bybit.com`).
- 🎯 **Bybit Position Card TP/SL Sync**:
  - Automatically attaches and displays **Take Profit** (green) and **Stop Loss** (red) directly on your Bybit **"Entire Position: TP / SL"** position card.
  - Auto-sync engine monitors active positions every 15s and immediately sets missing TP/SL levels on the exchange.
- 🛡️ **Automated 2-Stage Take-Profit & Breakeven Protection**:
  - **Initial Entry**: Sets initial Stop Loss and **TP1 (1.3R)** on the Bybit position card.
  - **TP1 Hit (1.3R)**: Closes 50% of the position to secure profits, **automatically moves Stop Loss to Entry Price (Breakeven)** to eliminate risk, and **updates the Position Card TP to TP2**.
  - **TP2 Hit (2.6R)**: Closes the remaining 50% runner for maximum trend expansion and cleans up all child orders.
- 🤖 **OpenRouter AI Risk & Sentiment Evaluator**:
  - Supports zero-cost and ultra-fast models (`meta-llama/llama-3.3-70b-instruct:free`, `google/gemini-2.0-flash-001`, `deepseek/deepseek-r1:free`).
  - Acts as a Quantitative Risk Officer to filter low-probability setups, false breakouts, and macro event traps with strict JSON schema validation.
- 📰 **Free Real-Time News & Macro Sentiment Aggregator**:
  - Live RSS feed ingestion from **CoinTelegraph**, **CoinDesk**, and **Decrypt** with zero API fee.
  - **Alternative.me Crypto Fear & Greed Index** integration.
  - Real-time funding rates and open interest tracking to avoid crowded liquidation traps.
- ⚖️ **Percentage-Based Risk Sizing**:
  - Strict account equity risk percentage per trade (e.g. `POSITION_RISK_PERCENT=1.5` risks exactly 1.5% of total account balance on Stop Loss).
- 🔒 **Zero Hardcoding - 100% Parameterized in `.env`**:
  - All keys, endpoints, models, risk percentages, leverage, and timeframes are managed in `.env` with strict runtime Zod validation.
- 📊 **Multi-Channel Alerts & CLI Dashboard**:
  - Real-time color-coded terminal tables with active trade monitoring and balance tracking.
  - **Telegram Bot** and **Discord Webhook** instant trade notifications.

---

## 🏗️ Architecture & Trade Lifecycle

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
              │ (Verdict: APPROVE & Confidence >= 75%)
              ▼
┌───────────────────────────┐
│ Dynamic Position Sizing   │
│ (1.5% Account Equity Risk)│
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ Bybit Entry Execution     │ ──► Sets [TP1 / SL] on Position Card
└─────────────┬─────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────┐
│ Active Position Manager (Every 15s)                    │
│ 1. Auto-Sync: Ensures TP/SL is active on Position Card │
│ 2. TP1 Hit: Closes 50% + Moves SL to Breakeven         │
│             + Updates Position Card TP to TP2          │
│ 3. TP2 Hit: Closes remaining 50% + Cleans up Orders    │
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
│   │   │   ├── client.ts            # Bybit V5 REST Client (Demo Trading)
│   │   │   ├── market.service.ts    # Tickers, Klines, Instrument Specs
│   │   │   ├── trade.service.ts     # Order placement, leverage, position TP/SL
│   │   │   └── positionManager.ts   # TP1/TP2 execution & Breakeven automation
│   │   ├── sentiment/
│   │   │   ├── news.service.ts      # Free RSS news fetcher & formatter
│   │   │   └── fearGreed.service.ts # Fear & Greed index parser
│   │   ├── ai/
│   │   │   ├── openrouter.client.ts # OpenRouter API client with fallback
│   │   │   ├── prompts.ts           # Risk & sentiment prompt templates
│   │   │   └── riskEvaluator.ts     # AI evaluation coordinator
│   │   ├── strategy/
│   │   │   ├── indicators.ts        # Fast EMA, RSI, ATR, MACD calculations
│   │   │   ├── signal.service.ts    # Multi-timeframe setup detector
│   │   │   └── scanner.service.ts   # Top liquid pairs scanner
│   │   ├── risk/
│   │   │   └── positionSizer.ts     # Institutional 1.5% equity risk position sizer
│   │   ├── database/
│   │   │   └── storage.ts           # JSON file state persistence
│   │   ├── notification/
│   │   │   └── webhook.service.ts   # Telegram & Discord alert broadcaster
│   │   └── logger.ts                # Winston & Chalk logger
│   └── scripts/
│       ├── testAI.ts                # Smoke test OpenRouter AI
│       ├── testBybit.ts             # Smoke test Bybit V5 connectivity
│       ├── testNews.ts              # Smoke test RSS & Fear & Greed feeds
│       └── dryRun.ts                # Complete dry run scan without live orders
```

---

## ⚙️ Configuration Reference (.env)

All variables are strictly typed and loaded from `.env`:

| Variable | Default | Description |
|---|---|---|
| `BYBIT_API_KEY` | `""` | Bybit Demo Trading API Key |
| `BYBIT_API_SECRET` | `""` | Bybit Demo Trading API Secret |
| `BYBIT_DEMO_TRADING` | `true` | `true` uses `api-demo.bybit.com` (Testnet) |
| `OPENROUTER_API_KEY` | `""` | OpenRouter API Key (from [openrouter.ai](https://openrouter.ai)) |
| `OPENROUTER_PRIMARY_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | Primary LLM model for trade evaluation |
| `OPENROUTER_FALLBACK_MODEL` | `google/gemini-2.0-flash-001` | Fallback model if primary model times out |
| `OPENROUTER_MIN_CONFIDENCE` | `75` | Minimum AI confidence score (0-100) to approve a trade |
| `AI_ENABLED` | `true` | Enable/disable AI filtering layer |
| `TRADING_PAIRS` | `BTCUSDT,ETHUSDT,...` | Comma-separated list of symbols to trade |
| `SCAN_INTERVAL_MINUTES` | `15` | Market scan cycle interval in minutes |
| `TRIGGER_TIMEFRAME` | `15` | Trigger candle timeframe (15m) |
| `TREND_TIMEFRAME` | `60` | Higher timeframe trend context (1h) |
| `LEVERAGE` | `5` | USDT Linear Perpetual contract leverage |
| `POSITION_RISK_PERCENT` | `1.5` | Risk **1.5%** of account equity per trade (e.g. $15 on $1,000) |
| `MAX_OPEN_POSITIONS` | `3` | Maximum concurrent active trades |
| `MIN_24H_VOLUME_USDT` | `10000000` | Minimum 24h volume filter ($10M) |
| `MAX_SPREAD_PERCENT` | `0.08` | Maximum allowed bid-ask spread (0.08%) |
| `SL_ATR_MULTIPLIER` | `1.5` | Stop Loss distance in multiples of ATR |
| `TP1_RR_RATIO` | `1.3` | Take Profit 1 Risk-to-Reward ratio (1.3R) |
| `TP2_RR_RATIO` | `2.6` | Take Profit 2 Risk-to-Reward ratio (2.6R) |
| `TP1_CLOSE_RATIO` | `0.5` | Fraction of position closed at TP1 (50%) |
| `MOVE_SL_TO_BREAKEVEN_ON_TP1` | `true` | Automatically moves SL to entry price once TP1 is reached |
| `ENABLE_RSS_NEWS` | `true` | Ingest live RSS news from CoinTelegraph & CoinDesk |
| `ENABLE_FEAR_GREED_INDEX` | `true` | Pull Alternative.me Fear & Greed Index |
| `TELEGRAM_BOT_TOKEN` | `""` | Telegram Bot Token for instant notifications |
| `TELEGRAM_CHAT_ID` | `""` | Telegram Chat ID / Channel ID |
| `DISCORD_WEBHOOK_URL` | `""` | Optional Discord Webhook URL |

---

## 📐 How Position Sizing Works

The bot uses an **institutional fixed-fractional risk model**:

$$\text{Risk Amount (USDT)} = \text{Account Equity} \times \left(\frac{\text{POSITION\_RISK\_PERCENT}}{100}\right) \times \text{AI\_Adjustment}$$

$$\text{Position Quantity} = \frac{\text{Risk Amount}}{\text{Entry Price} - \text{Stop Loss Price}}$$

### Examples:
- **$1,000 Equity** with `POSITION_RISK_PERCENT=1.5` $\rightarrow$ Risks **$15.00 USDT** on Stop Loss.
- **$5,000 Equity** with `POSITION_RISK_PERCENT=1.5` $\rightarrow$ Risks **$75.00 USDT** on Stop Loss.
- **$10,000 Equity** with `POSITION_RISK_PERCENT=2.0` $\rightarrow$ Risks **$200.00 USDT** on Stop Loss.

---

## 🚀 Quick Start Guide

### 1. Installation

```bash
npm install
```

### 2. Configure Environment

Create and edit `.env` (copied from `.env.example`):
```bash
cp .env.example .env
```
Fill in your `BYBIT_API_KEY`, `BYBIT_API_SECRET`, and `OPENROUTER_API_KEY`.

### 3. Run Component Verification

```bash
# Test News RSS & Fear & Greed Ingestion
npm run test:news

# Test Bybit V5 Connection & Market Tickers
npm run test:bybit

# Test OpenRouter AI Risk Evaluator
npm run test:ai

# Run a Dry-Run Simulation Scan (No Orders Placed)
npm run scan:dry
```

### 4. Start the Bot

```bash
# Start bot in development mode (hot-reloading)
npm run dev

# Build for production
npm run build
npm start
```

---

## 📱 Telegram Notifications Setup

1. Message `@BotFather` on Telegram to create a bot and get your `TELEGRAM_BOT_TOKEN`.
2. Add the bot to your group or channel, send a test message, and get your `TELEGRAM_CHAT_ID`.
3. Add both to `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```
4. The bot will automatically send trade entry alerts, TP1/Breakeven updates, and trade exit summaries!

---

## ⚖️ Disclaimer

This software is for educational and research purposes only. Cryptocurrency derivatives trading carries high financial risk. Always test thoroughly in **Demo Trading** mode before risking any real capital.
