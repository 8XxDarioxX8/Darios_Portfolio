# Changelog

## v2.0.0 — März 2026

### Neu
- **Multi-User Authentication** — Login/Register mit sicheren Sessions (werkzeug password hashing)
- **Multi-Profile Switching** — Mehrere Accounts gleichzeitig, schnelles Wechseln per Sidebar
- **Multi-Currency Support** — CHF, USD, EUR, GBP, JPY, CAD, AUD pro Transaktion wählbar
- **Live Ticker-Suche** — Suche nach Name oder ISIN, Dropdown mit Yahoo Finance Daten
- **Positions-Übersicht** (Analyse Tab) — Tabelle mit aktuellem Kurs, Marktwert, Kursgewinn, FX-Gewinn, Gebühren
- **Performance Box Redesign** — Grosses Hauptprozent + 6-Kacheln-Grid (Investiert, Aktueller Wert, G/V inkl. Gebühren, Kurseffekt, Währungseffekt, Gebühren)
- **TWR Badge** — Time-Weighted Return direkt am Chart
- **ⓘ Tooltips** — Erklärungen für alle Performance-Kennzahlen
- **Gebühren-Felder** — Stempelsteuer + sonstige Gebühren (Kommission, Wechselkosten) manuell erfassbar

### Verbessert
- Heatmap filtert ab erstem Kaufdatum
- Performance-Berechnung trennt Kurseffekt und Währungseffekt sauber
- Responsive Design verbessert (Mobile Sidebar, Modal)
- Chart zeigt gestaffelte Einzahlungen korrekt

---

## v1.0.0 — 2024

### Initial Release
- Portfolio-Tracker mit Flask + SQLite
- Dashboard mit Donut-Chart und Vermögensverlauf
- Investments-Tab mit Positionen nach ISIN gruppiert
- Analyse-Tab mit Monatsrenditen-Heatmap
- Cash-Verwaltung
- Zeitfilter (1T / 1W / 1M / YTD / 1J / ALL)
- Mobile-responsive Sidebar
- Deployment auf Render