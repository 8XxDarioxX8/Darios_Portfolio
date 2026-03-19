# 📊 Dario's Portfolio Tracker

A personal investment portfolio tracker built with Flask + SQLite, deployed on Render.

## Features

- **Dashboard** — Live portfolio overview with donut chart, performance box and wealth history chart
- **Investments** — All positions grouped by ISIN with buy details, editable and deletable
- **Analyse** — Period performance (1T/1W/1M/1J), indexed comparison chart, positions overview table, monthly returns heatmap
- **Multi-Currency** — CHF, USD, EUR, GBP, JPY, CAD, AUD with live FX rates via yfinance
- **Performance Breakdown** — Total gain, stock gain vs. FX gain, fees, TWR badge
- **Themes** — Hell, Dunkel, Girl — saved in localStorage, charts adapt automatically
- **Trendline** — Toggle linear regression line in the comparison chart
- **Live Ticker Search** — Search by name or ISIN, auto-fills ticker + ISIN
- **Multi-Profile** — Multiple user accounts, switch between profiles in the sidebar
- **Cash Balance** — Track cash alongside investments
- **Responsive** — Works on mobile and desktop

## Stack

| Layer | Tech |
|---|---|
| Backend | Python / Flask |
| Database | SQLite |
| Market Data | yfinance |
| Frontend | Vanilla JS + Chart.js |
| Deployment | Render (free tier) |

## Setup (local)

```bash
pip install -r requirements.txt
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