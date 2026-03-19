# Changelog

## v3.0.0 — März 2026

### Neu
- **3 Themes** — Hell, Dunkel, Girl — wählbar in der Sidebar, wird in localStorage gespeichert
  - Hell: Türkis → Cyan → Dunkelblau Töne
  - Dunkel: Neon-Farben (Magenta, Cyan, Grün, Lila, Gelb, Orange)
  - Girl: Pink → Violett → Gold Töne
- **Theme-aware Charts** — Donut, Vermögensverlauf und Analyse-Chart wechseln Farben + Tooltips automatisch mit dem Theme (CSS-Variablen werden zur Laufzeit aufgelöst)
- **Erweiterte Analyse-Zeiträume** — Kurs-Vergleich Chart neu mit 1W / 1M / 6M / YTD / 1J / 5J
- **Trendlinie Toggle** — Lineare Regressionslinie im Analyse-Vergleichs-Chart ein-/ausblendbar
- **Perioden-Performance im Analyse-Tab** — 1T / 1W / 1M / 1J KPIs oben im Analyse-Tab (vom Dashboard entfernt)
- **CHF-Portfolio Fix** — Performance-Chart funktioniert jetzt auch bei reinen CHF-Portfolios (kein FX-Ticker als Zeitachse nötig)

### Verbessert
- Donut-Chart: kein schwarzer Rand mehr, Farben wechseln mit Theme, Tooltips lesbar in allen Themes
- SIX-Ticker (.SW) Fallback: bei leerer Intraday-Antwort wird automatisch auf Tagesdaten zurückgefallen
- Preis-Lookup im Performance-Chart mit Datumsprefix-Fallback für SIX-Ticker
- Alle Chart-Tooltips (Vermögensverlauf, Analyse-Chart) verwenden jetzt korrekte Theme-Farben — kein unsichtbarer Text mehr im Dunkel-Theme
- Dashboard KPI-Strip auf 3 Kacheln reduziert (Perioden ausgelagert)
- Boy-Theme entfernt (war identisch mit Hell)

---

## v2.0.0 — März 2026

### Neu
- **Multi-User Authentication** — Login/Register mit sicheren Sessions
- **Multi-Profile Switching** — Mehrere Accounts, schnelles Wechseln per Sidebar
- **Multi-Currency Support** — CHF, USD, EUR, GBP, JPY, CAD, AUD pro Transaktion
- **Live Ticker-Suche** — Suche nach Name oder ISIN mit Yahoo Finance
- **Positions-Übersicht** — Tabelle mit Marktwert, Kursgewinn, FX-Gewinn, Gebühren
- **Performance Box** — Grosses Hauptprozent + 6-Kacheln-Grid
- **TWR Badge** — Time-Weighted Return direkt am Chart
- **ⓘ Tooltips** — Erklärungen für alle Performance-Kennzahlen
- **Gebühren-Felder** — Stempelsteuer + sonstige Gebühren erfassbar
- **Kurs-Vergleich Chart** — Indexierter Vergleich aller Positionen im Analyse-Tab

### Verbessert
- Heatmap filtert ab erstem Kaufdatum
- Performance-Berechnung trennt Kurseffekt und Währungseffekt
- Responsive Design verbessert

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