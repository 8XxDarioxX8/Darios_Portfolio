from flask import Flask, jsonify, request, send_from_directory, session, Response
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import yfinance as yf
import sqlite3
import os
import secrets
import csv
import io

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
CORS(app, supports_credentials=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "portfolio.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE NOT NULL,
                  password_hash TEXT NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')

    c.execute('''CREATE TABLE IF NOT EXISTS portfolio
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL DEFAULT 1,
                  name TEXT, isin TEXT, amount REAL, priceUSD REAL,
                  rate REAL, date TEXT, totalCHF REAL, ticker TEXT,
                  fees REAL DEFAULT 0, fee_stamp REAL DEFAULT 0,
                  fee_other REAL DEFAULT 0, currency TEXT DEFAULT "USD",
                  asset_type TEXT DEFAULT "stock",
                  manual_price REAL DEFAULT NULL)''')

    for col in ['user_id INTEGER DEFAULT 1', 'fees REAL DEFAULT 0',
                'currency TEXT DEFAULT "USD"', 'fee_stamp REAL DEFAULT 0',
                'fee_other REAL DEFAULT 0',
                'asset_type TEXT DEFAULT "stock"',
                'manual_price REAL DEFAULT NULL']:
        try:
            c.execute(f'ALTER TABLE portfolio ADD COLUMN {col}')
        except sqlite3.OperationalError:
            pass

    c.execute('''CREATE TABLE IF NOT EXISTS auth_tokens
                 (token TEXT PRIMARY KEY,
                  user_id INTEGER NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')

    c.execute('''CREATE TABLE IF NOT EXISTS cash
                 (user_id INTEGER PRIMARY KEY,
                  balance REAL DEFAULT 0)''')

    c.execute('''CREATE TABLE IF NOT EXISTS targets
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL,
                  isin TEXT NOT NULL,
                  name TEXT,
                  target_pct REAL NOT NULL DEFAULT 0,
                  UNIQUE(user_id, isin))''')

    try:
        c.execute('ALTER TABLE cash ADD COLUMN user_id INTEGER')
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()

init_db()

def require_login():
    if session.get('user_id'):
        return session.get('user_id')
    token = request.headers.get('X-Auth-Token') or request.args.get('token')
    if token:
        conn = get_db_connection()
        row = conn.execute('SELECT user_id FROM auth_tokens WHERE token = ?', (token,)).fetchone()
        conn.close()
        if row:
            return row['user_id']
    return None

# ── AUTH ─────────────────────────────────────────────────

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username und Passwort erforderlich'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username mind. 3 Zeichen'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Passwort mind. 6 Zeichen'}), 400

    conn = get_db_connection()
    if conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone():
        conn.close()
        return jsonify({'error': 'Username bereits vergeben'}), 409

    pw_hash = generate_password_hash(password)
    c = conn.cursor()
    c.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, pw_hash))
    user_id = c.lastrowid
    c.execute('INSERT OR IGNORE INTO cash (user_id, balance) VALUES (?, 0)', (user_id,))
    conn.commit()

    session['user_id'] = user_id
    session['username'] = username
    token = secrets.token_hex(32)
    c.execute('INSERT OR REPLACE INTO auth_tokens (token, user_id) VALUES (?, ?)', (token, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'username': username, 'token': token, 'user_id': user_id})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Falscher Username oder Passwort'}), 401

    session['user_id'] = user['id']
    session['username'] = user['username']
    token = secrets.token_hex(32)
    conn2 = get_db_connection()
    conn2.execute('INSERT OR REPLACE INTO auth_tokens (token, user_id) VALUES (?, ?)', (token, user['id']))
    conn2.commit()
    conn2.close()
    return jsonify({'success': True, 'username': user['username'], 'token': token, 'user_id': user['id']})

@app.route('/api/token-login', methods=['POST'])
def token_login():
    data = request.json
    token = data.get('token', '')
    conn = get_db_connection()
    row = conn.execute(
        'SELECT auth_tokens.user_id, users.username FROM auth_tokens JOIN users ON auth_tokens.user_id = users.id WHERE auth_tokens.token = ?',
        (token,)
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Ungültiger Token'}), 401
    session['user_id'] = row['user_id']
    session['username'] = row['username']
    return jsonify({'success': True, 'username': row['username'], 'user_id': row['user_id']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/delete-account', methods=['DELETE'])
def delete_account():
    user_id = require_login()
    if not user_id:
        return jsonify({'error': 'Nicht eingeloggt'}), 401
    conn = get_db_connection()
    conn.execute('DELETE FROM portfolio WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM cash WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM targets WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    session.clear()
    return jsonify({'success': True})

@app.route('/api/me')
def me():
    user_id = require_login()
    if not user_id:
        return jsonify({'logged_in': False}), 401
    return jsonify({'logged_in': True, 'username': session.get('username'), 'user_id': user_id})

# ── TICKER SUCHE ─────────────────────────────────────────

@app.route('/api/search_ticker')
def search_ticker():
    if not require_login():
        return jsonify({'error': 'Nicht eingeloggt'}), 401
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify([])
    try:
        import re
        is_isin = bool(re.match(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$', query.upper()))
        results = yf.Search(query.upper() if is_isin else query, max_results=8)
        quotes = results.quotes or []
        out = []
        for q in quotes:
            symbol = q.get('symbol', '')
            name   = q.get('longname') or q.get('shortname') or ''
            exch   = q.get('exchDisp') or q.get('exchange') or ''
            qtype  = q.get('quoteType', '')
            isin   = q.get('isin', '')
            if symbol and name and qtype in ('EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'):
                out.append({'symbol': symbol, 'name': name, 'exchange': exch, 'type': qtype, 'isin': isin})
        return jsonify(out[:8])
    except Exception:
        return jsonify([])

# ── HISTORY ──────────────────────────────────────────────

@app.route('/get_history')
def get_history():
    if not require_login():
        return jsonify({'error': 'Nicht eingeloggt'}), 401
    symbol = request.args.get('symbol')
    period = request.args.get('period', '2y')
    if not symbol:
        return jsonify({"error": "Kein Symbol"}), 400
    try:
        ticker = yf.Ticker(symbol)
        interval = '15m' if period in ['1d', '5d'] else '1d'
        data = ticker.history(period=period, interval=interval)

        if data.empty and interval == '15m':
            interval = '1d'
            data = ticker.history(period=period, interval=interval)

        if data.empty:
            for fallback in ['max', '5y', '2y', '1y']:
                if fallback == period:
                    continue
                data = ticker.history(period=fallback, interval='1d')
                if not data.empty:
                    break

        if data.empty:
            return jsonify({"error": "Keine Daten"}), 404

        history = []
        for date, row in data.iterrows():
            if interval == '15m':
                date_local = date.tz_convert('Europe/Zurich')
                date_label = date_local.strftime('%d.%m %H:%M')
                full_date_str = date_local.strftime('%Y-%m-%d %H:%M:%S')
            else:
                date_label = date.strftime('%Y-%m-%d')
                full_date_str = date.strftime('%Y-%m-%d')
            history.append({"date": date_label, "full_date": full_date_str, "price": round(float(row['Close']), 2)})
        return jsonify(history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── PORTFOLIO ────────────────────────────────────────────

@app.route('/api/portfolio', methods=['GET'])
def get_portfolio():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM portfolio WHERE user_id = ?', (user_id,)).fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in rows])

@app.route('/api/portfolio', methods=['POST'])
def add_portfolio():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    data = request.json
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''INSERT INTO portfolio (user_id, name, isin, amount, priceUSD, rate, date, totalCHF, ticker, fee_stamp, fee_other, currency, asset_type, manual_price)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (user_id, data['name'], data['isin'], data['amount'], data['priceUSD'],
               data['rate'], data['date'], data['totalCHF'], data['ticker'],
               data.get('fee_stamp', 0), data.get('fee_other', 0), data.get('currency', 'USD'),
               data.get('asset_type', 'stock'),
               data.get('manual_price', None)))
    conn.commit()
    new_id = c.lastrowid
    conn.close()
    return jsonify({'id': new_id, 'success': True})

@app.route('/api/portfolio/<int:portfolio_id>', methods=['DELETE'])
def delete_portfolio(portfolio_id):
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    conn = get_db_connection()
    conn.execute('DELETE FROM portfolio WHERE id = ? AND user_id = ?', (portfolio_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/portfolio/<int:portfolio_id>', methods=['PUT'])
def update_portfolio(portfolio_id):
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    data = request.json
    conn = get_db_connection()
    conn.execute('''UPDATE portfolio SET name=?, isin=?, amount=?, priceUSD=?, rate=?, date=?, totalCHF=?, ticker=?, fee_stamp=?, fee_other=?, currency=?, asset_type=?, manual_price=?
                    WHERE id=? AND user_id=?''',
                 (data['name'], data['isin'], data['amount'], data['priceUSD'],
                  data['rate'], data['date'], data['totalCHF'], data['ticker'],
                  data.get('fee_stamp', 0), data.get('fee_other', 0),
                  data.get('currency', 'USD'),
                  data.get('asset_type', 'stock'),
                  data.get('manual_price', None),
                  portfolio_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/portfolio/<int:portfolio_id>/price', methods=['PUT'])
def update_manual_price(portfolio_id):
    """Aktualisiert nur den manuellen Kurs einer Position (für Assets ohne Ticker)."""
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    data = request.json
    price = data.get('manual_price')
    if price is None:
        return jsonify({'error': 'Kein Kurs angegeben'}), 400
    conn = get_db_connection()
    conn.execute('UPDATE portfolio SET manual_price=? WHERE id=? AND user_id=?',
                 (float(price), portfolio_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/cash', methods=['GET'])
def get_cash():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    conn = get_db_connection()
    row = conn.execute('SELECT balance FROM cash WHERE user_id = ?', (user_id,)).fetchone()
    conn.close()
    return jsonify({'balance': row['balance'] if row else 0})

@app.route('/api/cash', methods=['POST'])
def set_cash():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    data = request.json
    conn = get_db_connection()
    conn.execute('INSERT INTO cash (user_id, balance) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET balance=?',
                 (user_id, data['balance'], data['balance']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ── TARGETS (Ziel-Allokation) ─────────────────────────────

@app.route('/api/targets', methods=['GET'])
def get_targets():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM targets WHERE user_id = ?', (user_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/targets', methods=['POST'])
def save_targets():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    data = request.json
    conn = get_db_connection()
    conn.execute('DELETE FROM targets WHERE user_id = ?', (user_id,))
    for item in data:
        if item.get('target_pct', 0) > 0:
            conn.execute(
                'INSERT INTO targets (user_id, isin, name, target_pct) VALUES (?, ?, ?, ?)',
                (user_id, item['isin'], item.get('name', ''), item['target_pct'])
            )
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ── EXPORT ───────────────────────────────────────────────

@app.route('/api/export/csv')
def export_csv():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401

    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM portfolio WHERE user_id = ? ORDER BY date', (user_id,)).fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['Datum', 'Name', 'ISIN', 'Ticker', 'Währung', 'Anzahl', 'Kurs',
                     'Wechselkurs', 'Total CHF', 'Stempelsteuer CHF', 'Sonstige Kosten CHF',
                     'Asset-Typ', 'Manueller Kurs'])
    for r in rows:
        writer.writerow([
            r['date'], r['name'], r['isin'], r['ticker'], r['currency'],
            r['amount'], r['priceUSD'], r['rate'], r['totalCHF'],
            r['fee_stamp'] or 0, r['fee_other'] or 0,
            r['asset_type'] or 'stock',
            r['manual_price'] if r['manual_price'] is not None else ''
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=portfolio_export.csv'}
    )

@app.route('/api/import/csv', methods=['POST'])
def import_csv():
    """
    Importiert Transaktionen aus einem CSV.
    Erwartet JSON: { rows: [{name, isin, ticker, currency, amount, priceUSD, rate,
                              date, totalCHF, fee_stamp, fee_other,
                              asset_type, manual_price}] }
    Gibt {imported, skipped, errors} zurück.
    """
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401

    data = request.json
    rows = data.get('rows', [])
    if not rows:
        return jsonify({'error': 'Keine Zeilen zum Importieren'}), 400

    conn = get_db_connection()
    imported = 0
    errors   = []

    for i, r in enumerate(rows):
        try:
            name   = str(r.get('name', '')).strip()
            isin   = str(r.get('isin', '')).strip().upper()
            if not name or not isin:
                errors.append(f"Zeile {i+1}: Name oder ISIN fehlt")
                continue

            amount    = float(r.get('amount', 0) or 0)
            priceUSD  = float(r.get('priceUSD', 0) or 0)
            rate      = float(r.get('rate', 1) or 1)
            totalCHF  = float(r.get('totalCHF', 0) or 0)
            # Fallback: totalCHF berechnen wenn nicht angegeben
            if totalCHF == 0 and amount > 0 and priceUSD > 0:
                totalCHF = amount * priceUSD * rate

            conn.execute(
                '''INSERT INTO portfolio
                   (user_id, name, isin, ticker, currency, amount, priceUSD, rate,
                    date, totalCHF, fee_stamp, fee_other, asset_type, manual_price)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (user_id,
                 name, isin,
                 str(r.get('ticker', '') or '').strip().upper(),
                 str(r.get('currency', 'CHF') or 'CHF').strip().upper(),
                 amount, priceUSD, rate,
                 str(r.get('date', '') or '').strip(),
                 totalCHF,
                 float(r.get('fee_stamp', 0) or 0),
                 float(r.get('fee_other', 0) or 0),
                 str(r.get('asset_type', 'stock') or 'stock').strip(),
                 float(r['manual_price']) if r.get('manual_price') not in (None, '', 'None') else None)
            )
            imported += 1
        except Exception as e:
            errors.append(f"Zeile {i+1}: {str(e)}")

    conn.commit()
    conn.close()
    return jsonify({'imported': imported, 'skipped': len(errors), 'errors': errors})
@app.route('/api/export/pdf')
def export_pdf():
    user_id = require_login()
    if not user_id: return jsonify({'error': 'Nicht eingeloggt'}), 401
    try:
        return _build_pdf(user_id)
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


def _build_pdf(user_id):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                    Paragraph, Spacer, HRFlowable, Image)
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
    from datetime import datetime, date as date_cls
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    # ── Load data ─────────────────────────────────────────
    conn     = get_db_connection()
    rows     = conn.execute('SELECT * FROM portfolio WHERE user_id = ? ORDER BY date', (user_id,)).fetchall()
    cash_row = conn.execute('SELECT balance FROM cash WHERE user_id = ?', (user_id,)).fetchone()
    user_row = conn.execute('SELECT username FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()

    rows         = [dict(r) for r in rows]
    username     = user_row['username'] if user_row else 'Portfolio'
    cash_balance = float(cash_row['balance']) if cash_row else 0.0
    today        = datetime.now()
    ytd_start    = date_cls(today.year, 1, 1)

    # ── Fetch market data ─────────────────────────────────
    FX_MAP = {'USD': 'USDCHF=X', 'EUR': 'EURCHF=X', 'GBP': 'GBPCHF=X',
              'JPY': 'JPYCHF=X', 'CAD': 'CADCHF=X', 'AUD': 'AUDCHF=X', 'CHF': None}

    tickers    = list(set(r['ticker'] for r in rows if r['ticker']))
    currencies = list(set(r.get('currency') or 'USD' for r in rows))
    fx_tickers = list(set(FX_MAP[c] for c in currencies if FX_MAP.get(c)))
    all_syms   = tickers + fx_tickers

    def fetch_hist(sym):
        try:
            d = yf.Ticker(sym).history(period='2y', interval='1d')
            if d.empty:
                d = yf.Ticker(sym).history(period='max', interval='1d')
            if d.empty:
                return []
            return [{'date': dt.strftime('%Y-%m-%d'), 'price': float(r['Close'])}
                    for dt, r in d.iterrows()]
        except Exception:
            return []

    hist = {s: fetch_hist(s) for s in all_syms}

    def get_fx(ccy, date_str=None):
        fxt = FX_MAP.get(ccy)
        if not fxt:
            return 1.0
        h = hist.get(fxt, [])
        if not h:
            return 1.0
        if date_str:
            e = next((x for x in h if x['date'] >= date_str), None)
            return float(e['price']) if e else float(h[-1]['price'])
        return float(h[-1]['price'])

    # ── Group positions ───────────────────────────────────
    grouped = {}
    for r in rows:
        key = r['isin'] or r['name']
        if key not in grouped:
            grouped[key] = {
                'name': r['name'] or '', 'isin': r['isin'] or '',
                'ticker': r['ticker'] or '',
                'currency': r.get('currency') or 'USD',
                'amount': 0.0, 'invested': 0.0, 'fees': 0.0,
                'rate_sum': 0.0, 'count': 0, 'buys': []
            }
        g = grouped[key]
        g['amount']   += float(r['amount'] or 0)
        g['invested'] += float(r['totalCHF'] or 0)
        g['fees']     += float(r['fee_stamp'] or 0) + float(r['fee_other'] or 0)
        g['rate_sum'] += float(r['rate'] or 0)
        g['count']    += 1
        g['buys'].append(r)

    for g in grouped.values():
        h  = hist.get(g['ticker'], [])
        px = float(h[-1]['price']) if h else 0.0
        fx = get_fx(g['currency'])
        cv = g['amount'] * px * fx
        g['current_value'] = cv if cv > 0 else g['invested']
        g['gain_chf']      = g['current_value'] - g['invested']
        g['gain_pct']      = (g['gain_chf'] / g['invested'] * 100) if g['invested'] else 0.0

    total_invested = sum(g['invested']      for g in grouped.values())
    total_stocks   = sum(g['current_value'] for g in grouped.values())
    total_value    = total_stocks + cash_balance
    total_gain     = total_stocks - total_invested
    total_gain_pct = (total_gain / total_invested * 100) if total_invested else 0.0
    total_fees     = sum(g['fees'] for g in grouped.values())

    # ── YTD ───────────────────────────────────────────────
    ytd_str       = ytd_start.strftime('%Y-%m-%d')
    val_ytd_start = 0.0
    for g in grouped.values():
        h    = hist.get(g['ticker'], [])
        px   = next((x['price'] for x in h if x['date'] >= ytd_str), None)
        held = sum(float(b['amount'] or 0) for b in g['buys']
                   if b['date'] and b['date'] < ytd_str)
        if px and held > 0:
            val_ytd_start += held * float(px) * get_fx(g['currency'], ytd_str)
    ytd_gain_chf = total_stocks - val_ytd_start if val_ytd_start > 0 else total_gain
    ytd_gain_pct = (ytd_gain_chf / val_ytd_start * 100) if val_ytd_start > 0 else total_gain_pct

    # ── Daily portfolio series ────────────────────────────
    all_dates = sorted(set(
        x['date'] for s in tickers for x in hist.get(s, [])
    ))
    earliest = min((r['date'] for r in rows if r['date']), default=None)
    if earliest:
        all_dates = [d for d in all_dates if d >= earliest]

    port_vals, inv_vals = [], []
    last_px = {}
    for d in all_dates:
        inv = sum(float(r['totalCHF'] or 0) for r in rows if r['date'] and r['date'] <= d)
        mkt = 0.0
        for g in grouped.values():
            h  = hist.get(g['ticker'], [])
            px = next((x['price'] for x in h if x['date'] == d), None)
            if px is not None:
                last_px[g['ticker']] = float(px)
            lp   = last_px.get(g['ticker'], 0.0)
            held = sum(float(b['amount'] or 0) for b in g['buys']
                       if b['date'] and b['date'] <= d)
            mkt += held * lp * get_fx(g['currency'], d)
        port_vals.append(mkt)
        inv_vals.append(inv)

    # TWR
    twr = 1.0
    for i in range(1, len(port_vals)):
        if inv_vals[i - 1] > 0:
            cf    = max(0.0, inv_vals[i] - inv_vals[i - 1])
            basis = port_vals[i - 1] + cf
            if basis > 0:
                twr *= port_vals[i] / basis
    twr_pct = (twr - 1) * 100

    # Monthly returns
    monthly = {}
    for i, d in enumerate(all_dates):
        dt  = datetime.strptime(d, '%Y-%m-%d')
        key = (dt.year, dt.month)
        if key not in monthly:
            monthly[key] = {'start': port_vals[i], 'end': port_vals[i]}
        else:
            monthly[key]['end'] = port_vals[i]
    monthly_rets = [
        {'year': yr, 'month': mo,
         'return': ((v['end'] - v['start']) / v['start'] * 100) if v['start'] > 0 else 0.0}
        for (yr, mo), v in sorted(monthly.items())
    ]

    # ── Design tokens ─────────────────────────────────────
    ACCENT    = colors.HexColor('#5B8DEF')
    DARK      = colors.HexColor('#2F3A4A')
    MID       = colors.HexColor('#6B7A99')
    LIGHT     = colors.HexColor('#A8B4CC')
    LIGHT_BG  = colors.HexColor('#EBF2FF')
    LIGHT_BG2 = colors.HexColor('#F7F9FC')
    BORDER    = colors.HexColor('#E4EAF4')
    GREEN     = colors.HexColor('#2BB580')
    GREEN_BG  = colors.HexColor('#EDFAF4')
    RED       = colors.HexColor('#E05C7A')
    RED_BG    = colors.HexColor('#FEF0F4')
    WHITE     = colors.white
    NAVY      = colors.HexColor('#1E2D45')

    styles = getSampleStyleSheet()

    # ── Page layout ───────────────────────────────────────
    # A4 = 21.0 cm wide. Left+Right margins = 1.5 cm each → usable = 18.0 cm exactly.
    W_CM = 18.0
    buf  = io.BytesIO()
    doc  = SimpleDocTemplate(buf, pagesize=A4,
                             leftMargin=1.5 * cm, rightMargin=1.5 * cm,
                             topMargin=0, bottomMargin=1.8 * cm)
    el   = []

    gain_col = GREEN if total_gain    >= 0 else RED
    ytd_col  = GREEN if ytd_gain_chf  >= 0 else RED
    twr_col  = GREEN if twr_pct       >= 0 else RED
    gain_hex = '#34D399' if total_gain >= 0 else '#F87171'
    gs       = '+' if total_gain >= 0 else ''

    # ── Helpers ───────────────────────────────────────────
    def signed(v, d=2, s=''):
        return f"{v:+,.{d}f}{s}"

    _ps_cache = {}
    def PS(name, **kw):
        key = (name, tuple(sorted(kw.items())))
        if key not in _ps_cache:
            _ps_cache[key] = ParagraphStyle(
                f'{name}_{len(_ps_cache)}', parent=styles['Normal'], **kw)
        return _ps_cache[key]

    def build_table(data, col_w_cm, header=True, right_from=None):
        t = Table(data, colWidths=[x * cm for x in col_w_cm],
                  repeatRows=1 if header else 0)
        cmds = [
            ('FONTNAME',       (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE',       (0, 0), (-1, -1), 7.5),
            ('TEXTCOLOR',      (0, 0), (-1, -1), DARK),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, LIGHT_BG2]),
            ('LINEBELOW',      (0, 0), (-1, -1), 0.3, BORDER),
            ('LEFTPADDING',    (0, 0), (-1, -1), 5),
            ('RIGHTPADDING',   (0, 0), (-1, -1), 5),
            ('TOPPADDING',     (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING',  (0, 0), (-1, -1), 5),
            ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
        ]
        if header:
            cmds += [
                ('BACKGROUND', (0, 0), (-1, 0), ACCENT),
                ('TEXTCOLOR',  (0, 0), (-1, 0), WHITE),
                ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE',   (0, 0), (-1, 0), 7),
            ]
        if right_from is not None:
            cmds.append(('ALIGN', (right_from, 0), (-1, -1), 'RIGHT'))
        t.setStyle(TableStyle(cmds))
        return t

    H2_style = PS('H2', fontSize=11, textColor=ACCENT, fontName='Helvetica-Bold',
                  spaceBefore=10, spaceAfter=4)
    H3_style = PS('H3', fontSize=7,  textColor=LIGHT,  fontName='Helvetica-Bold', leading=9)
    NM_style = PS('NM', fontSize=7.5, textColor=DARK, leading=10)
    SM_style = PS('SM', fontSize=6.5, textColor=MID,  leading=9)

    # ── HEADER ────────────────────────────────────────────
    # colWidths must exactly equal W_CM * cm
    hdr_cols = [W_CM * 0.58 * cm, W_CM * 0.42 * cm]
    hdr = Table(
        [[
            Paragraph(
                f"<font size='22' color='#FFFFFF'><b>Portfolio Report</b></font><br/>"
                f"<font size='10' color='#8BAED4'>{username.capitalize()}  ·  "
                f"{today.strftime('%B %d, %Y')}</font>",
                PS('HL', leading=30)
            ),
            Paragraph(
                f"<font size='9' color='#8BAED4'>Total Value</font><br/>"
                f"<font size='20' color='#FFFFFF'><b>CHF {total_value:,.0f}</b></font><br/>"
                f"<font size='9' color='{gain_hex}'>{gs}{total_gain:,.0f} CHF"
                f"  ({signed(total_gain_pct, 1, '%')})</font>",
                PS('HR', alignment=TA_RIGHT, leading=26)
            )
        ]],
        colWidths=hdr_cols
    )
    hdr.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), NAVY),
        ('LEFTPADDING',   (0, 0), (-1, -1), 22),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 22),
        ('TOPPADDING',    (0, 0), (-1, -1), 20),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    el.append(hdr)
    el.append(Spacer(1, 0.3 * cm))

    # ── KPI ROWS ──────────────────────────────────────────
    # 4 equal columns, each W_CM/4 cm wide
    kpi_col = W_CM / 4  # 4.5 cm each, total = 18.0 cm

    def kpi_row(items, bg):
        row_labels = [Paragraph(i[0], H3_style) for i in items]
        row_values = [
            Paragraph(i[1], PS(f'kv{n}', fontSize=14, fontName='Helvetica-Bold',
                               textColor=i[3] if len(i) > 3 else DARK, leading=17))
            for n, i in enumerate(items)
        ]
        row_subs = [Paragraph(i[2], SM_style) for i in items]
        t = Table(
            [row_labels, row_values, row_subs],
            colWidths=[kpi_col * cm] * 4
        )
        t.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, -1), bg),
            ('LINEBEFORE',    (1, 0), (3, -1),  0.4, BORDER),
            ('LINEBELOW',     (0, -1), (-1, -1), 0.5, BORDER),
            ('BOX',           (0, 0), (-1, -1),  0.4, BORDER),
            ('LEFTPADDING',   (0, 0), (-1, -1),  10),
            ('RIGHTPADDING',  (0, 0), (-1, -1),  6),
            ('TOPPADDING',    (0, 0), (-1, 0),   8),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
            ('TOPPADDING',    (0, 1), (-1, 1),   2),
            ('BOTTOMPADDING', (0, 1), (-1, 1),   2),
            ('VALIGN',        (0, 0), (-1, -1),  'TOP'),
        ]))
        return t

    el.append(kpi_row([
        ('INVESTED',     f"CHF {total_invested:,.0f}", 'total capital deployed', DARK),
        ('YTD RETURN',   signed(ytd_gain_pct, 1, '%'), f"CHF {signed(ytd_gain_chf, 0)}", ytd_col),
        ('TWR ALL TIME', signed(twr_pct, 1, '%'),      'time-weighted return', twr_col),
        ('TOTAL FEES',   f"CHF {total_fees:,.2f}",     'stamp duty + costs', DARK),
    ], LIGHT_BG))
    el.append(Spacer(1, 0.12 * cm))
    el.append(kpi_row([
        ('TOTAL GAIN',    f"CHF {signed(total_gain, 0)}", 'unrealised gain/loss', gain_col),
        ('SIMPLE RETURN', signed(total_gain_pct, 2, '%'), '(value − invested) / invested', gain_col),
        ('CASH BALANCE',  f"CHF {cash_balance:,.0f}",    'not invested', DARK),
        ('POSITIONS',     str(len(grouped)),               'unique ISINs held', DARK),
    ], WHITE))
    el.append(Spacer(1, 0.12 * cm))

    # ── CHART ─────────────────────────────────────────────
    if all_dates and port_vals:
        el.append(Paragraph("Portfolio Value Over Time", H2_style))
        fig, ax = plt.subplots(figsize=(7.5, 2.9))
        fig.patch.set_facecolor('white')
        ax.set_facecolor('#FAFBFE')
        xs = list(range(len(all_dates)))
        ax.fill_between(xs, port_vals, inv_vals,
                        where=[p >= iv for p, iv in zip(port_vals, inv_vals)],
                        alpha=0.15, color='#2BB580', interpolate=True)
        ax.fill_between(xs, port_vals, inv_vals,
                        where=[p < iv for p, iv in zip(port_vals, inv_vals)],
                        alpha=0.15, color='#E05C7A', interpolate=True)
        ax.plot(xs, port_vals, color='#5B8DEF', lw=2,   label='Market Value', zorder=3)
        ax.plot(xs, inv_vals,  color='#A8B4CC', lw=1.2, ls='--', label='Invested', zorder=2)
        if port_vals:
            ax.annotate(f"CHF {port_vals[-1]:,.0f}",
                        xy=(xs[-1], port_vals[-1]), xytext=(-60, 8),
                        textcoords='offset points', fontsize=6.5, color='#5B8DEF',
                        fontweight='bold',
                        arrowprops=dict(arrowstyle='->', color='#5B8DEF', lw=0.8))
        step = max(1, len(all_dates) // 9)
        ax.set_xticks(xs[::step])
        ax.set_xticklabels([all_dates[i][:7] for i in xs[::step]],
                           fontsize=6, color='#A8B4CC', rotation=25, ha='right')
        ax.yaxis.set_tick_params(labelsize=6, labelcolor='#A8B4CC')
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"CHF {x:,.0f}"))
        ax.grid(axis='y', color='#E4EAF4', lw=0.5)
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.legend(fontsize=7, framealpha=0, labelcolor='#6B7A99', loc='upper left', ncol=2)
        plt.tight_layout(pad=0.4)
        ibuf = io.BytesIO()
        plt.savefig(ibuf, format='png', dpi=160, bbox_inches='tight',
                    facecolor='white', edgecolor='none')
        plt.close(fig)
        ibuf.seek(0)
        el.append(Image(ibuf, width=W_CM * cm, height=6.5 * cm))
        el.append(Spacer(1, 0.15 * cm))

    # ── HOLDINGS ──────────────────────────────────────────
    el.append(Paragraph("Holdings Overview", H2_style))
    total_noc = sum(g['current_value'] for g in grouped.values()) or 1.0

    # Columns sum must = W_CM = 18.0 cm
    # Name(4.0) ISIN(2.5) Shares(1.5) AvgPx(1.7) Invested(2.1) Value(2.1) Gain(2.1) Ret(1.5) Wt(0.5)
    hd_cols = [4.0, 2.5, 1.5, 1.7, 2.1, 2.1, 2.1, 1.5, 0.5]
    # sum = 18.0
    hd = [['Position', 'ISIN', 'Shares', 'Avg Px', 'Invested', 'Value', 'Gain', 'Ret.', 'Wt']]
    for g in sorted(grouped.values(), key=lambda x: x['current_value'], reverse=True):
        wt  = g['current_value'] / total_noc * 100
        gc  = GREEN if g['gain_chf'] >= 0 else RED
        avg = g['invested'] / g['amount'] if g['amount'] else 0.0
        hd.append([
            Paragraph(g['name'][:32], NM_style),
            Paragraph(g['isin'][:14], SM_style),
            f"{g['amount']:.2f}",
            f"{avg:.2f}",
            f"{g['invested']:,.0f}",
            f"{g['current_value']:,.0f}",
            Paragraph(signed(g['gain_chf'], 0),
                      PS(f'gc{id(g)}', fontSize=7.5, textColor=gc,
                         fontName='Helvetica-Bold')),
            Paragraph(signed(g['gain_pct'], 1, '%'),
                      PS(f'gp{id(g)}', fontSize=7.5, textColor=gc)),
            f"{wt:.0f}%",
        ])
    el.append(build_table(hd, hd_cols, right_from=2))
    el.append(Spacer(1, 0.15 * cm))

    # ── TOP & WORST PERFORMERS ────────────────────────────
    el.append(Paragraph("Performance Highlights", H2_style))
    all_g = sorted(grouped.values(), key=lambda g: g['gain_pct'], reverse=True)
    top   = all_g[:min(3, len(all_g))]
    worst = list(reversed(all_g[-min(3, len(all_g)):]))

    # gap between the two side tables
    gap_cm = 0.4
    sw_cm  = (W_CM - gap_cm) / 2  # 8.8 cm each side

    def perf_side(title, items, col, bg):
        # name col: 65%, pct col: 35%
        c1 = round(sw_cm * 0.65, 2)
        c2 = round(sw_cm - c1, 2)  # ensure exact sum
        tdata = [[Paragraph(title, PS('pth', fontSize=8, fontName='Helvetica-Bold',
                                       textColor=WHITE)), '']]
        for g in items:
            tdata.append([
                Paragraph(g['name'][:32], NM_style),
                Paragraph(signed(g['gain_pct'], 1, '%'),
                          PS(f'pp{id(g)}', fontSize=9, textColor=col,
                             fontName='Helvetica-Bold', alignment=TA_RIGHT)),
            ])
        t = Table(tdata, colWidths=[c1 * cm, c2 * cm])
        t.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, 0),  col),
            ('SPAN',          (0, 0), (-1, 0)),
            ('FONTSIZE',      (0, 0), (-1, -1), 8),
            ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
            ('TEXTCOLOR',     (0, 1), (0, -1),  DARK),
            ('ROWBACKGROUNDS',(0, 1), (-1, -1), [WHITE, bg]),
            ('LINEBELOW',     (0, 0), (-1, -1), 0.3, BORDER),
            ('LEFTPADDING',   (0, 0), (-1, -1), 7),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 7),
            ('TOPPADDING',    (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('ALIGN',         (1, 0), (1, -1),  'RIGHT'),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        return t

    pw = Table(
        [[perf_side('▲  Top Performers',   top,   GREEN, GREEN_BG),
          '',
          perf_side('▼  Worst Performers', worst, RED,   RED_BG)]],
        colWidths=[sw_cm * cm, gap_cm * cm, sw_cm * cm]
    )
    pw.setStyle(TableStyle([
        ('VALIGN',  (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(pw)
    el.append(Spacer(1, 0.15 * cm))

    # ── MONTHLY HEATMAP ───────────────────────────────────
    if monthly_rets:
        el.append(Paragraph("Monthly Returns", H2_style))
        years = sorted(set(m['year'] for m in monthly_rets), reverse=True)
        MN    = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        # Yr(1.1) + 12×Mon(1.25) + Ann(1.9) = 18.0 cm
        cw_yr  = 1.1
        cw_mo  = 1.25
        cw_ann = W_CM - cw_yr - cw_mo * 12   # 18.0 - 1.1 - 15.0 = 1.9
        cw_hm  = [cw_yr] + [cw_mo] * 12 + [cw_ann]

        hm_data = [
            [Paragraph('Yr',  PS('hmhy', fontSize=7, textColor=WHITE,
                                  fontName='Helvetica-Bold', alignment=TA_CENTER))] +
            [Paragraph(m, PS('hmhm', fontSize=7, textColor=WHITE,
                              fontName='Helvetica-Bold', alignment=TA_CENTER)) for m in MN] +
            [Paragraph('Ann.', PS('hmha', fontSize=7, textColor=WHITE,
                                   fontName='Helvetica-Bold', alignment=TA_CENTER))]
        ]

        for yr in years:
            ann = 1.0
            row = [Paragraph(str(yr), PS(f'hmy{yr}', fontSize=7, textColor=DARK,
                                          fontName='Helvetica-Bold', alignment=TA_CENTER))]
            for mo in range(1, 13):
                e = next((m for m in monthly_rets if m['year'] == yr and m['month'] == mo), None)
                if e:
                    ann *= (1 + e['return'] / 100)
                    tc  = colors.HexColor('#1a4b1a') if e['return'] > 0 else colors.HexColor('#7a0a20')
                    row.append(Paragraph(f"{e['return']:+.1f}%",
                               PS(f'hc{yr}{mo}', fontSize=6.5, textColor=tc,
                                  alignment=TA_CENTER)))
                else:
                    row.append(Paragraph('—', PS(f'hx{yr}{mo}', fontSize=6.5,
                               textColor=LIGHT, alignment=TA_CENTER)))
            ap = (ann - 1) * 100
            row.append(Paragraph(f"{ap:+.1f}%",
                       PS(f'ha{yr}', fontSize=6.5, fontName='Helvetica-Bold',
                          textColor=GREEN if ap >= 0 else RED, alignment=TA_CENTER)))
            hm_data.append(row)

        ht = Table(hm_data, colWidths=[x * cm for x in cw_hm], repeatRows=1)
        hs = TableStyle([
            ('BACKGROUND', (0, 0),  (-1, 0),  ACCENT),
            ('ALIGN',      (0, 0),  (-1, -1), 'CENTER'),
            ('LINEBELOW',  (0, 0),  (-1, -1), 0.3, BORDER),
            ('LEFTPADDING',   (0, 0), (-1, -1), 3),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 3),
            ('TOPPADDING',    (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('BACKGROUND', (0, 1),  (0, -1),  LIGHT_BG),
            ('BACKGROUND', (-1, 1), (-1, -1), LIGHT_BG),
        ])
        for ri, row in enumerate(hm_data[1:], 1):
            for ci in range(1, 13):
                cell = row[ci]
                try:
                    raw = cell.text if hasattr(cell, 'text') else ''
                    val = float(raw.replace('%', '').replace('+', '').strip())
                    it  = min(abs(val) / 8.0, 1.0)
                    if val > 0:
                        bg_c = colors.Color(
                            (220 - it * 110) / 255,
                            (200 + it * 55)  / 255,
                            (220 - it * 110) / 255)
                    else:
                        bg_c = colors.Color(
                            (200 + it * 55)  / 255,
                            (220 - it * 110) / 255,
                            (220 - it * 110) / 255)
                    hs.add('BACKGROUND', (ci, ri), (ci, ri), bg_c)
                except Exception:
                    pass
        ht.setStyle(hs)
        el.append(ht)
        el.append(Spacer(1, 0.15 * cm))

    # ── TRANSACTION HISTORY ───────────────────────────────
    el.append(Paragraph("Transaction History", H2_style))

    # Date(2.0) Name(3.5) ISIN(2.7) CCY(1.0) Shares(1.6) Price(1.7) Total(2.75) Fees(2.75) = 18.0
    tx_cols = [2.0, 3.5, 2.7, 1.0, 1.6, 1.7, 2.75, 2.75]
    tx = [['Date', 'Position', 'ISIN', 'CCY', 'Shares', 'Price', 'Total CHF', 'Fees CHF']]
    for r in rows:
        fees = float(r['fee_stamp'] or 0) + float(r['fee_other'] or 0)
        tx.append([
            r['date'] or '—',
            Paragraph((r['name'] or '—')[:30], NM_style),
            Paragraph(r['isin'] or '—', SM_style),
            r.get('currency') or 'USD',
            f"{float(r['amount'] or 0):.4f}",
            f"{float(r['priceUSD'] or 0):.2f}",
            f"{float(r['totalCHF'] or 0):,.2f}",
            f"{fees:.2f}",
        ])
    el.append(build_table(tx, tx_cols, right_from=4))

    # ── FOOTER ────────────────────────────────────────────
    el.append(Spacer(1, 0.5 * cm))
    el.append(HRFlowable(width=W_CM * cm, thickness=0.4, color=BORDER, spaceAfter=5))
    el.append(Paragraph(
        f"Generated by <b>Dario's Portfolio Tracker</b> on "
        f"{today.strftime('%B %d, %Y at %H:%M')}. "
        "Market data via Yahoo Finance. Past performance is not indicative of future results.",
        PS('ft', fontSize=6.5, textColor=LIGHT, leading=10)
    ))

    doc.build(el)
    buf.seek(0)
    return Response(
        buf.getvalue(),
        mimetype='application/pdf',
        headers={'Content-Disposition':
                 f'attachment; filename=portfolio_report_{today.strftime("%Y%m%d")}.pdf'}
    )


# ── STATIC ───────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)