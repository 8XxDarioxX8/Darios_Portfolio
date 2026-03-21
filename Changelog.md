# Changelog

## v3.1.0 — März 2026

### Neu
- **Rebalancing Tab** — Ziel-Allokation pro ISIN definieren, Ist- vs. Soll-Vergleich als Balkendiagramm, Massnahmen-Tabelle mit konkreten Kauf-/Verkaufsempfehlungen
- **CSV Export** — Alle Transaktionen als semikolon-getrenntes CSV herunterladen
- **PDF Report** — Professioneller mehrseitiger Report mit Navy-Header, 8 KPI-Kacheln, Vermögensverlauf-Chart (Matplotlib, grün/rote Füllfläche), Holdings-Tabelle, Top & Worst Performers, Monatsrenditen-Heatmap, Transaktionshistorie
- **Export-Buttons** in der Sidebar (CSV + PDF)

### Verbessert
- PDF-Fehlerbehandlung gibt JSON mit vollständigem Traceback zurück statt HTML-500
- Alle Tabellenspalten auf exakte Seitenbreite (18.0 cm) normiert um ReportLab-Crashs zu vermeiden

---

## v3.0.0 — März 2026

### Neu
- **3 Themes** — Hell (Standard), Dunkel (Neon), Girl (Rosa/Violett), umschaltbar per Sidebar
- **Theme-aware Charts** — Donut, Performance-Chart und Analyse-Chart lesen Farben live aus CSS-Variablen
- **Tooltip-Farben** — Chart-Tooltips passen sich dem aktiven Theme an (kein weisser Text auf weissem Hintergrund im Hell-Theme mehr)
- **Analyse-Zeiträume** — Zeitfilter (1M / 3M / 6M / 1J / ALL) im Analyse-Tab
- **Trendlinie** — Lineare Regressionslinie im Analyse-Chart

### Verbessert
- CHF-Positionen werden korrekt ohne FX-Effekt berechnet
- `getVar()` / `getChartColors()` / `getTooltipDefaults()` als zentrale Helfer-Funktionen

---

## v2.0.0 — März 2026

### Neu
- **Multi-User Authentication** — Login/Register mit sicheren Sessions (Werkzeug Password Hashing)
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