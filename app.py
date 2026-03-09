from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import yfinance as yf
import sqlite3
import os


app = Flask(__name__, static_folder='static')
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "portfolio.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Portfolio Tabelle
    c.execute('''CREATE TABLE IF NOT EXISTS portfolio
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT, isin TEXT, amount REAL, priceUSD REAL,
                  rate REAL, date TEXT, totalCHF REAL, ticker TEXT,
                  fees REAL DEFAULT 0)''')

    # Migration: fees-Spalte hinzufügen falls sie noch nicht existiert
    try:
        c.execute('ALTER TABLE portfolio ADD COLUMN fees REAL DEFAULT 0')
    except sqlite3.OperationalError:
        pass  # Spalte existiert bereits

    # Migration: Stempelgebühr (0.15%) für bestehende Einträge ohne Gebühren nachberechnen
    c.execute('UPDATE portfolio SET fees = totalCHF * 0.0015 WHERE fees IS NULL OR fees = 0')

    # Cash Tabelle
    c.execute('''CREATE TABLE IF NOT EXISTS cash
                 (id INTEGER PRIMARY KEY, balance REAL)''')
    c.execute('SELECT * FROM cash WHERE id = 1')
    if not c.fetchone():
        c.execute('INSERT INTO cash (id, balance) VALUES (1, 0)')

    conn.commit()
    conn.close()

init_db()

# --- API ROUTEN ---

@app.route('/get_history')
def get_history():
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
            history.append({
                "date": date_label,
                "full_date": full_date_str,
                "price": round(float(row['Close']), 2)
            })
        return jsonify(history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/portfolio', methods=['GET'])
def get_portfolio():
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM portfolio').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in rows])

@app.route('/api/portfolio', methods=['POST'])
def add_portfolio():
    data = request.json
    fees = data.get('fees', 0) or 0
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''INSERT INTO portfolio (name, isin, amount, priceUSD, rate, date, totalCHF, ticker, fees)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (data['name'], data['isin'], data['amount'], data['priceUSD'],
               data['rate'], data['date'], data['totalCHF'], data['ticker'], fees))
    conn.commit()
    new_id = c.lastrowid
    conn.close()
    return jsonify({'id': new_id, 'success': True})

@app.route('/api/portfolio/<int:portfolio_id>', methods=['DELETE'])
def delete_portfolio(portfolio_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM portfolio WHERE id = ?', (portfolio_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/portfolio/<int:portfolio_id>', methods=['PUT'])
def update_portfolio(portfolio_id):
    data = request.json
    fees = data.get('fees', 0) or 0
    conn = get_db_connection()
    conn.execute('''UPDATE portfolio
                    SET name=?, isin=?, amount=?, priceUSD=?, rate=?, date=?, totalCHF=?, ticker=?, fees=?
                    WHERE id=?''',
                 (data['name'], data['isin'], data['amount'], data['priceUSD'],
                  data['rate'], data['date'], data['totalCHF'], data['ticker'], fees, portfolio_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/cash', methods=['GET'])
def get_cash():
    conn = get_db_connection()
    row = conn.execute('SELECT balance FROM cash WHERE id = 1').fetchone()
    conn.close()
    return jsonify({'balance': row['balance'] if row else 0})

@app.route('/api/cash', methods=['POST'])
def set_cash():
    data = request.json
    conn = get_db_connection()
    conn.execute('UPDATE cash SET balance = ? WHERE id = 1', (data['balance'],))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# --- STATISCHE DATEIEN ---

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)