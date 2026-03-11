from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import yfinance as yf
import sqlite3
import os
import secrets

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

    # Users Tabelle
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE NOT NULL,
                  password_hash TEXT NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')

    # Portfolio Tabelle mit user_id
    c.execute('''CREATE TABLE IF NOT EXISTS portfolio
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL DEFAULT 1,
                  name TEXT, isin TEXT, amount REAL, priceUSD REAL,
                  rate REAL, date TEXT, totalCHF REAL, ticker TEXT,
                  fees REAL DEFAULT 0, fee_stamp REAL DEFAULT 0,
                  fee_other REAL DEFAULT 0, currency TEXT DEFAULT "USD")''')

    # Migrations
    for col in ['user_id INTEGER DEFAULT 1', 'fees REAL DEFAULT 0',
                'currency TEXT DEFAULT "USD"', 'fee_stamp REAL DEFAULT 0',
                'fee_other REAL DEFAULT 0']:
        try:
            c.execute(f'ALTER TABLE portfolio ADD COLUMN {col}')
        except sqlite3.OperationalError:
            pass

    # Auth Tokens für Multi-Profile
    c.execute('''CREATE TABLE IF NOT EXISTS auth_tokens
                 (token TEXT PRIMARY KEY,
                  user_id INTEGER NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS cash
                 (user_id INTEGER PRIMARY KEY,
                  balance REAL DEFAULT 0)''')

    # Alte cash Tabelle migration (falls id-basiert)
    try:
        c.execute('ALTER TABLE cash ADD COLUMN user_id INTEGER')
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()

init_db()

def require_login():
    # Cookie-Session (Standard)
    if session.get('user_id'):
        return session.get('user_id')
    # Token-Auth (für Multi-Profile)
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
    conn.close()

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
    # Token für Multi-Profile generieren
    token = secrets.token_hex(32)
    conn2 = get_db_connection()
    conn2.execute('INSERT OR REPLACE INTO auth_tokens (token, user_id) VALUES (?, ?)', (token, user['id']))
    conn2.commit()
    conn2.close()
    return jsonify({'success': True, 'username': user['username'], 'token': token, 'user_id': user['id']})

@app.route('/api/token-login', methods=['POST'])
def token_login():
    """Wechselt aktive Session zu einem gespeicherten Token (für Multi-Profile)"""
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
        # ISIN-Erkennung: 2 Buchstaben + 10 alphanumerische Zeichen
        import re
        is_isin = bool(re.match(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$', query.upper()))

        if is_isin:
            # Bei ISIN: direkt yfinance nach dem Symbol suchen
            # yfinance Search unterstützt ISIN-Suche
            results = yf.Search(query.upper(), max_results=8)
        else:
            results = yf.Search(query, max_results=8)

        quotes = results.quotes or []
        out = []
        for q in quotes:
            symbol = q.get('symbol', '')
            name   = q.get('longname') or q.get('shortname') or ''
            exch   = q.get('exchDisp') or q.get('exchange') or ''
            qtype  = q.get('quoteType', '')
            isin   = q.get('isin', '')
            if symbol and name and qtype in ('EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'):
                out.append({
                    'symbol':   symbol,
                    'name':     name,
                    'exchange': exch,
                    'type':     qtype,
                    'isin':     isin
                })
        return jsonify(out[:8])
    except Exception as e:
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
    c.execute('''INSERT INTO portfolio (user_id, name, isin, amount, priceUSD, rate, date, totalCHF, ticker, fee_stamp, fee_other, currency)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (user_id, data['name'], data['isin'], data['amount'], data['priceUSD'],
               data['rate'], data['date'], data['totalCHF'], data['ticker'],
               data.get('fee_stamp', 0), data.get('fee_other', 0), data.get('currency', 'USD')))
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
    conn.execute('''UPDATE portfolio SET name=?, isin=?, amount=?, priceUSD=?, rate=?, date=?, totalCHF=?, ticker=?, fee_stamp=?, fee_other=?, currency=?
                    WHERE id=? AND user_id=?''',
                 (data['name'], data['isin'], data['amount'], data['priceUSD'],
                  data['rate'], data['date'], data['totalCHF'], data['ticker'],
                  data.get('fee_stamp', 0), data.get('fee_other', 0),
                  data.get('currency', 'USD'), portfolio_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ── CASH ─────────────────────────────────────────────────

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