from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import yfinance as yf
import sqlite3
import os

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
                  fees REAL DEFAULT 0)''')

    # Migrations
    for col in ['user_id INTEGER DEFAULT 1', 'fees REAL DEFAULT 0']:
        try:
            c.execute(f'ALTER TABLE portfolio ADD COLUMN {col}')
        except sqlite3.OperationalError:
            pass

    # Cash Tabelle mit user_id
    c.execute('''CREATE TABLE IF NOT EXISTS cash
                 (user_id INTEGER PRIMARY KEY,
                  balance REAL DEFAULT 0)''')

    c.execute('''CREATE TABLE IF NOT EXISTS cash
             (user_id INTEGER PRIMARY KEY,
              balance REAL DEFAULT 0)''')

    conn.commit()
    conn.close()

init_db()

def require_login():
    return session.get('user_id')

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
    return jsonify({'success': True, 'username': username})

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
    return jsonify({'success': True, 'username': user['username']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/me')
def me():
    user_id = require_login()
    if not user_id:
        return jsonify({'logged_in': False}), 401
    return jsonify({'logged_in': True, 'username': session.get('username'), 'user_id': user_id})

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
    c.execute('''INSERT INTO portfolio (user_id, name, isin, amount, priceUSD, rate, date, totalCHF, ticker, fees)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (user_id, data['name'], data['isin'], data['amount'], data['priceUSD'],
               data['rate'], data['date'], data['totalCHF'], data['ticker'], data.get('fees', 0)))
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
    conn.execute('''UPDATE portfolio SET name=?, isin=?, amount=?, priceUSD=?, rate=?, date=?, totalCHF=?, ticker=?, fees=?
                    WHERE id=? AND user_id=?''',
                 (data['name'], data['isin'], data['amount'], data['priceUSD'],
                  data['rate'], data['date'], data['totalCHF'], data['ticker'],
                  data.get('fees', 0), portfolio_id, user_id))
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