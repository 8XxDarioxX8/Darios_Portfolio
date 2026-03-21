# 📊 Dario's Portfolio Tracker

A personal investment portfolio tracker built with Flask + SQLite, deployed on Render.

## Features

- **Dashboard** — Live portfolio overview with donut chart, performance box and wealth history chart
- **Investments** — All positions grouped by ISIN with buy details, editable and deletable
- **Analyse** — Monthly returns heatmap + positions overview table with stock/FX gain breakdown
- **Rebalancing** — Set target allocations per ISIN, visualise drift vs. current allocation, get buy/sell instructions
- **Multi-Currency** — CHF, USD, EUR, GBP, JPY, CAD, AUD with live FX rates via yfinance
- **Performance Breakdown** — Total gain, stock gain vs. FX gain, fees, TWR badge on chart
- **Export** — Download portfolio as CSV or professional PDF report (chart, KPIs, heatmap, top/worst performers)
- **Live Ticker Search** — Search by name or ISIN, auto-fills ticker + ISIN
- **Multi-Profile** — Multiple user accounts, switch between profiles in the sidebar
- **Cash Balance** — Track cash alongside investments
- **Themes** — Light, Dark, and Girl theme
- **Responsive** — Works on mobile and desktop

## Stack

| Layer | Tech |
|---|---|
| Backend | Python / Flask |
| Database | SQLite |
| Market Data | yfinance |
| Frontend | Vanilla JS + Chart.js |
| PDF Export | ReportLab + Matplotlib |
| Deployment | Render (free tier) |

## Setup (local)

```bash
# Install dependencies
pip install -r requirements.txt

# Run
python app.py
```

App runs on `http://localhost:5000`

## Deployment (Render)

1. Push to GitHub
2. Connect repo on [render.com](https://render.com)
3. Set environment variable: `SECRET_KEY = <random hex>`
   - Generate: `python -c "import secrets; print(secrets.token_hex(32))"`
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn app:app`

## Environment Variables

| Variable | Description |
|---|---|
| `SECRET_KEY` | Flask session secret (required in production) |
| `PORT` | Port (set automatically by Render) |

## Database Schema

```sql
users       (id, username, password_hash, created_at)
portfolio   (id, user_id, name, isin, ticker, amount, priceUSD, rate, currency,
             date, totalCHF, fees, fee_stamp, fee_other)
cash        (user_id, balance)
auth_tokens (token, user_id, created_at)
targets     (id, user_id, isin, name, target_pct)
```

## Supported Currencies

| Currency | FX Ticker |
|---|---|
| CHF | — (base currency) |
| USD | USDCHF=X |
| EUR | EURCHF=X |
| GBP | GBPCHF=X |
| JPY | JPYCHF=X |
| CAD | CADCHF=X |
| AUD | AUDCHF=X |