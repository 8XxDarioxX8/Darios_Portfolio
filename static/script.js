// ═══════════════════════════════════════════════════════════
//  Dario's Portfolio — script.js
// ═══════════════════════════════════════════════════════════

const TICKER_MAP = {
    "IE00B4L5Y983": "SWDA.SW",
    "IE00BKM4GZ66": "SEMA.SW",
    "IE00B4L5YC18": "SEMA.SW"
};

const CHART_COLORS = ['#A9C9FF', '#B8A9FF', '#FFD6A9', '#A9F2D4', '#F2A9D4', '#A9EEF2'];

let portfolio       = [];
let cashBalance     = 0;
let myDonutChart    = null;
let myLineChart     = null;
let currentPerfData = null;

// ─── INIT ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    setGreeting();
    await loadDataFromServer();
    renderPortfolio();
    showPage('page-dashboard');
    setupTransactionPreview();
    loadPeriodPerformance();
});

function setGreeting() {
    const el = document.getElementById('greeting');
    if (!el) return;
    const h = new Date().getHours();
    el.textContent = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
}

// ─── DATA LOADING ────────────────────────────────────────

async function loadDataFromServer() {
    try {
        const [portRes, cashRes] = await Promise.all([
            fetch('/api/portfolio'),
            fetch('/api/cash')
        ]);
        portfolio   = await portRes.json();
        const cd    = await cashRes.json();
        cashBalance = cd.balance || 0;
    } catch (e) {
        console.error('Fehler beim Laden:', e);
    }
}

// ─── PAGE NAVIGATION ─────────────────────────────────────

function showPage(pageId) {
    ['page-dashboard', 'page-investments', 'page-analysis'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === pageId ? 'block' : 'none';
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if ((item.getAttribute('onclick') || '').includes(pageId)) item.classList.add('active');
    });

    if (pageId === 'page-dashboard') {
        renderPortfolio();
        loadPerformanceChart('max');
        loadPeriodPerformance();
    } else if (pageId === 'page-analysis') {
        loadHeatmap();
    } else if (pageId === 'page-investments') {
        renderPortfolio();
    }

    if (window.innerWidth <= 768) closeMobileSidebar();
}

// ─── RENDER PORTFOLIO ────────────────────────────────────

function renderPortfolio() {
    const list = document.getElementById('positions-list');
    if (!list) return;

    list.innerHTML = '';
    let investmentTotal = 0;

    const grouped = portfolio.reduce((acc, item) => {
        const key = item.isin || item.name;
        if (!acc[key]) acc[key] = { name: item.name, isin: item.isin, totalValue: 0, totalAmount: 0, buys: [] };
        acc[key].buys.push(item);
        acc[key].totalValue  += item.totalCHF;
        acc[key].totalAmount += item.amount;
        return acc;
    }, {});

    for (const key in grouped) {
        const asset = grouped[key];
        investmentTotal += asset.totalValue;

        const el = document.createElement('div');
        el.className = 'asset-group';
        el.innerHTML = `
            <div class="asset-header" onclick="toggleAssetDetails(this)">
                <div>
                    <div class="asset-name">${asset.name}</div>
                    <div class="asset-meta">${asset.isin || '—'}</div>
                </div>
                <div class="asset-summary">
                    <span class="asset-amount">${asset.totalAmount.toFixed(4)} Stk.</span>
                    <span class="asset-value">${asset.totalValue.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} CHF</span>
                    <span class="asset-arrow">▼</span>
                </div>
            </div>
            <div class="asset-details">
                <table class="details-table">
                    <thead>
                        <tr><th>Datum</th><th>Stk.</th><th>Kurs USD</th><th>USD/CHF</th><th>Total CHF</th><th></th></tr>
                    </thead>
                    <tbody>
                        ${asset.buys.map(buy => `
                            <tr>
                                <td>${buy.date ? new Date(buy.date + 'T00:00:00').toLocaleDateString('de-CH') : '—'}</td>
                                <td>${parseFloat(buy.amount).toFixed(4)}</td>
                                <td>${parseFloat(buy.priceUSD).toFixed(2)}</td>
                                <td>${parseFloat(buy.rate).toFixed(4)}</td>
                                <td>${parseFloat(buy.totalCHF).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td>
                                    <button class="action-btn edit"   onclick="openEditModal(${buy.id})" title="Bearbeiten">✎</button>
                                    <button class="action-btn delete" onclick="deleteBuy(${buy.id})"     title="Löschen">✕</button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        list.appendChild(el);
    }

    const cashVal    = parseFloat(cashBalance) || 0;
    const grandTotal = investmentTotal + cashVal;

    setEl('inv-total-stocks', investmentTotal.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    setEl('inv-total-cash',   cashVal.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    setEl('inv-total-all',    grandTotal.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));

    updateDonutChart(investmentTotal, cashVal);
    if (currentPerfData) displayPerformance();
}

function toggleAssetDetails(header) {
    const details = header.nextElementSibling;
    if (!details) return;
    header.classList.toggle('open', details.classList.toggle('show'));
}

// ─── DONUT CHART ─────────────────────────────────────────

function updateDonutChart(investmentTotal, cash) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas) return;

    const grandTotal = investmentTotal + cash;

    const grouped = portfolio.reduce((acc, item) => {
        const key = item.isin || item.name;
        if (!acc[key]) acc[key] = { label: item.name, value: 0 };
        acc[key].value += item.totalCHF;
        return acc;
    }, {});

    const entries = Object.values(grouped);
    if (cash > 0) entries.push({ label: 'Cash', value: cash });

    const labels = entries.map(e => e.label);
    const values = entries.map(e => e.value);
    const colors = entries.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

    if (myDonutChart) { myDonutChart.destroy(); myDonutChart = null; }

    myDonutChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#ffffff', hoverBorderWidth: 3 }]
        },
        options: {
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const pct = ((ctx.parsed / grandTotal) * 100).toFixed(1);
                            return ` ${ctx.label}: ${ctx.parsed.toLocaleString('de-CH', {minimumFractionDigits: 0})} CHF (${pct}%)`;
                        }
                    },
                    backgroundColor: '#ffffff',
                    borderColor: '#e8e3dc',
                    borderWidth: 1,
                    titleColor: '#9e9891',
                    bodyColor: '#1a1714',
                    padding: 10,
                    cornerRadius: 6
                }
            }
        }
    });

    const centerEl = document.getElementById('donut-center-text');
    if (centerEl) {
        centerEl.innerHTML = `${grandTotal.toLocaleString('de-CH', {maximumFractionDigits: 0})}<br><span style="font-size:9px;color:#9e9891;font-family:'DM Mono',monospace;letter-spacing:0.1em">CHF</span>`;
    }

    const legendEl = document.getElementById('donut-legend');
    if (legendEl) {
        legendEl.innerHTML = entries.map((e, i) => {
            const pct = grandTotal > 0 ? ((e.value / grandTotal) * 100).toFixed(1) : '0.0';
            return `
                <div class="legend-item">
                    <div class="legend-left">
                        <div class="legend-dot" style="background:${colors[i]}"></div>
                        <span>${e.label}</span>
                    </div>
                    <span class="legend-pct">${pct}%</span>
                </div>`;
        }).join('');
    }
}

async function loadPerformanceChart(period = 'max') {
    const canvas = document.getElementById('lineChart');
    const loader = document.getElementById('chart-loader');
    if (!canvas) return;

    if (loader) loader.classList.remove('hidden');
    if (myLineChart) { myLineChart.destroy(); myLineChart = null; }
    const badge = document.getElementById('chart-return-badge');
    if (badge) badge.style.display = 'none';

    const tickers = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) { if (loader) loader.classList.add('hidden'); return; }

    try {
        const earliestDate = portfolio.reduce((earliest, item) => {
            const d = new Date(item.date);
            return !earliest || d < earliest ? d : earliest;
        }, null);

        const allTickers = [...tickers, 'USDCHF=X'];
        const allData = await Promise.all(allTickers.map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=${period}`);
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));

        const fxObj = allData.find(d => d.ticker === 'USDCHF=X');
        if (!fxObj || !fxObj.history.length) return;

        // Filter to dates after first purchase
        let fxHistory = fxObj.history.filter(h => new Date(h.full_date) >= earliestDate);

        // For intraday: filter to market hours only
        fxHistory = fxHistory.filter(h => {
            if (!h.full_date.includes(':')) return true;
            const [hour, min] = h.full_date.split(' ')[1].split(':').map(Number);
            const mins = hour * 60 + min;
            return mins >= 540 && mins <= 1050;
        });

        const labels          = fxHistory.map(h => h.date);
        const portfolioValues = [];
        const investedValues  = [];
        let lastKnownPrices   = {};
        let lastKnownFX       = 0.88;

        labels.forEach(dateLabel => {
            const fxEntry = fxHistory.find(h => h.date === dateLabel);
            if (!fxEntry?.full_date) { portfolioValues.push(null); investedValues.push(null); return; }
            if (fxEntry.price) lastKnownFX = fxEntry.price;

            const currentTime = new Date(fxEntry.full_date).getTime();
            let marketVal   = 0;
            let investedVal = 0;

            portfolio.forEach(asset => {
                const buyTime = new Date(asset.date + ' 00:00:00').getTime();
                if (buyTime > currentTime) return;

                // Investiert-Linie: exakter Kaufbetrag (priceUSD am Kauftag × rate am Kauftag × anzahl)
                investedVal += asset.totalCHF;

                // Marktwert: aktueller Kurs × aktueller FX-Kurs × anzahl
                const tickerData = allData.find(d => d.ticker === asset.ticker);
                if (tickerData) {
                    const priceEntry = tickerData.history.find(h => h.date === dateLabel);
                    if (priceEntry?.price) lastKnownPrices[asset.ticker] = priceEntry.price;
                    const priceUSD = lastKnownPrices[asset.ticker] || 0;
                    marketVal += asset.amount * priceUSD * lastKnownFX;
                }
            });

            portfolioValues.push(marketVal || null);
            investedValues.push(investedVal || null);
        });

        const ctx = canvas.getContext('2d');
        myLineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Marktwert',
                        data: portfolioValues,
                        borderColor: '#5B8DEF',
                        backgroundColor: 'rgba(169,201,255,0.12)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                        borderWidth: 2
                    },
                    {
                        label: 'Investiert',
                        data: investedValues,
                        borderColor: '#D0DAF0',
                        borderDash: [5, 4],
                        fill: false,
                        tension: 0,
                        pointRadius: 0,
                        borderWidth: 1.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid: { color: 'rgba(232,227,220,0.7)', drawBorder: false },
                        ticks: { color: '#9e9891', font: { family: "'DM Mono', monospace", size: 10 }, maxTicksLimit: 8 }
                    },
                    y: {
                        grid: { color: 'rgba(232,227,220,0.7)', drawBorder: false },
                        ticks: { color: '#9e9891', font: { family: "'DM Mono', monospace", size: 10 }, callback: v => v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' CHF' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#ffffff',
                        borderColor: '#e8e3dc',
                        borderWidth: 1,
                        titleColor: '#9e9891',
                        bodyColor: '#1a1714',
                        padding: 12,
                        cornerRadius: 6,
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} CHF`,
                            afterBody: (items) => {
                                const market   = items.find(i => i.dataset.label === 'Marktwert')?.parsed.y;
                                const invested = items.find(i => i.dataset.label === 'Investiert')?.parsed.y;
                                if (market == null || invested == null || invested === 0) return [];
                                const gainCHF = market - invested;
                                const gainPct = (gainCHF / invested * 100);
                                const sign    = gainCHF >= 0 ? '+' : '';
                                return [
                                    '',
                                    ` Gewinn: ${sign}${gainCHF.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} CHF  (${sign}${gainPct.toFixed(2)}%)`
                                ];
                            }
                        }
                    }
                }
            }
        });

        // Performance stats (für Performance-Box): letzter Marktwert vs letztes Investiert
        const lastValid  = v => [...v].reverse().find(x => x != null) || 0;
        const currentVal = lastValid(portfolioValues);
        const invested   = lastValid(investedValues);
        const profitCHF  = currentVal - invested;
        const profitPct  = invested > 0 ? (profitCHF / invested * 100) : 0;

        // TWR (Time-Weighted Return) für Badge
        // Für jeden Tag: tagesr = Marktwert_Ende / (Marktwert_Vordag + neue_Einzahlungen_heute)
        // Neue Einzahlungen = Anstieg der investedValues-Linie von Tag zu Tag
        let twr = 1.0;
        let prevMarket   = null;
        let prevInvested = null;

        for (let i = 0; i < portfolioValues.length; i++) {
            const mkt = portfolioValues[i];
            const inv = investedValues[i];
            if (mkt == null || inv == null) continue;

            if (prevMarket !== null && prevInvested !== null) {
                // Neue Einzahlung an diesem Tag
                const cashflow = Math.max(0, inv - prevInvested);
                // Basis = gestriger Marktwert + heutige Einzahlung
                const basis = prevMarket + cashflow;
                if (basis > 0) {
                    twr *= (mkt / basis);
                }
            }
            prevMarket   = mkt;
            prevInvested = inv;
        }

        const twrPct = (twr - 1) * 100;

        // Badge anzeigen
        const badge = document.getElementById('chart-return-badge');
        if (badge) {
            const isPos = twrPct >= 0;
            const sign  = isPos ? '+' : '';
            badge.style.display = 'block';
            badge.style.color   = isPos ? '#2d6a4f' : '#c0392b';
            badge.textContent   = `${sign}${twrPct.toFixed(2)}%`;
        }

        const avgFX = portfolio.reduce((s, p) => s + p.rate, 0) / (portfolio.length || 1);
        const fxChg = ((lastKnownFX - avgFX) / avgFX * 100);

        currentPerfData = { currentVal, invested, profitCHF, profitPct, fxEffect: fxChg };
        displayPerformance();

    } catch (e) {
        console.error('Chart-Fehler:', e);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

// ─── PERFORMANCE DISPLAY ─────────────────────────────────

function displayPerformance() {
    const box = document.getElementById('performance-display');
    if (!box || !currentPerfData) return;

    const p         = currentPerfData;
    const isPos     = p.profitCHF >= 0;
    const color     = isPos ? 'var(--green)' : 'var(--red)';
    const sign      = isPos ? '+' : '';

    const stockGainPct = p.profitPct - p.fxEffect;
    const stockGainCHF = p.invested * stockGainPct / 100;
    const fxGainCHF    = p.invested * p.fxEffect / 100;

    const fmtCHF = v => (v >= 0 ? '+' : '') + v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' CHF';
    const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    const col    = v => v >= 0 ? 'var(--green)' : 'var(--red)';

    // Update KPI strip
    setEl('kpi-total',    p.currentVal.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    setEl('kpi-invested', p.invested.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    const gainEl  = document.getElementById('kpi-gain');
    const badgeEl = document.getElementById('kpi-gain-badge');
    if (gainEl)  { gainEl.textContent = (sign) + p.profitCHF.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}); gainEl.style.color = color; }
    if (badgeEl) { badgeEl.textContent = sign + p.profitPct.toFixed(2) + '%'; badgeEl.className = 'kpi-badge ' + (isPos ? 'pos' : 'neg'); }

    box.innerHTML = `
        <div class="card-head"><span class="card-label">Performance</span></div>
        <div class="card-body">
            <div class="perf-main-return" style="color:${color}">${sign}${p.profitPct.toFixed(2)}%</div>
            <div class="perf-period-label">Gesamtrendite seit Kauf</div>
            <div class="perf-grid">
                <div class="perf-tile">
                    <span class="perf-tile-label">Holdings</span>
                    <div class="perf-tile-value">${p.currentVal.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="perf-tile-sub neutral">CHF</div>
                </div>
                <div class="perf-tile">
                    <span class="perf-tile-label">Investiert</span>
                    <div class="perf-tile-value">${p.invested.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="perf-tile-sub neutral">CHF</div>
                </div>
                <div class="perf-tile">
                    <span class="perf-tile-label">Kursgewinn</span>
                    <div class="perf-tile-value" style="color:${col(stockGainCHF)};font-size:13px">${fmtCHF(stockGainCHF)}</div>
                    <div class="perf-tile-sub" style="color:${col(stockGainPct)}">${fmtPct(stockGainPct)}</div>
                </div>
                <div class="perf-tile">
                    <span class="perf-tile-label">Währungseffekt</span>
                    <div class="perf-tile-value" style="color:${col(fxGainCHF)};font-size:13px">${fmtCHF(fxGainCHF)}</div>
                    <div class="perf-tile-sub" style="color:${col(p.fxEffect)}">${fmtPct(p.fxEffect)}</div>
                </div>
            </div>
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
                <span class="perf-tile-label">Total Gain</span>
                <div style="font-family:var(--display);font-size:22px;font-weight:700;color:${color};letter-spacing:-0.03em;margin-top:3px">
                    ${sign}${p.profitCHF.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} CHF
                </div>
            </div>
        </div>`;
}

// ─── PERIOD PERFORMANCE ──────────────────────────────────

async function loadPeriodPerformance() {
    const tickers = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) return;

    const periods = [
        { id: 'pp-1d', api: '1d',  label: '1T' },
        { id: 'pp-1w', api: '5d',  label: '1W' },
        { id: 'pp-1m', api: '1mo', label: '1M' },
        { id: 'pp-1y', api: '1y',  label: '1J' }
    ];

    // Load all data in parallel
    const allTickers = [...tickers, 'USDCHF=X'];

    for (const p of periods) {
        try {
            const allData = await Promise.all(allTickers.map(async t => {
                const res  = await fetch(`/get_history?symbol=${t}&period=${p.api}`);
                const data = await res.json();
                return { ticker: t, history: Array.isArray(data) ? data : [] };
            }));

            const fxObj = allData.find(d => d.ticker === 'USDCHF=X');
            if (!fxObj || !fxObj.history.length) continue;

            // Get first and last FX
            const fxFirst = fxObj.history[0]?.price || 0.88;
            const fxLast  = fxObj.history.at(-1)?.price || fxFirst;

            // Compute portfolio value at start and end of period
            let valStart = 0, valEnd = 0;

            portfolio.forEach(asset => {
                const td = allData.find(d => d.ticker === asset.ticker);
                if (!td || !td.history.length) return;
                const priceStart = td.history[0]?.price || 0;
                const priceEnd   = td.history.at(-1)?.price || 0;
                valStart += asset.amount * priceStart * fxFirst;
                valEnd   += asset.amount * priceEnd   * fxLast;
            });

            if (valStart <= 0) continue;

            const pct = ((valEnd - valStart) / valStart * 100);
            const el  = document.getElementById(p.id);
            if (!el) continue;

            const isPos = pct >= 0;
            el.textContent = (isPos ? '+' : '') + pct.toFixed(2) + '%';
            el.style.color = isPos ? 'var(--green)' : 'var(--red)';
            el.classList.remove('period-loading');

        } catch (e) {
            const el = document.getElementById(p.id);
            if (el) el.textContent = '—';
        }
    }
}

// ─── HEATMAP ─────────────────────────────────────────────

async function loadHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;

    container.innerHTML = `<div class="heatmap-panel"><div class="card-label" style="margin-bottom:8px">Monatsrenditen Heatmap</div><div style="text-align:center;padding:40px;font-family:'DM Mono',monospace;font-size:11px;color:var(--text3)">Lade Daten…</div></div>`;

    const tickers = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) {
        container.innerHTML = `<div class="heatmap-panel"><p style="color:var(--text3);text-align:center;padding:40px;font-family:'DM Mono',monospace;font-size:11px">Keine Daten verfügbar</p></div>`;
        return;
    }

    try {
        const allTickers = [...tickers, 'USDCHF=X'];
        const allData = await Promise.all(allTickers.map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=2y`);
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));

        const fxObj = allData.find(d => d.ticker === 'USDCHF=X');
        if (!fxObj) return;

        const dailyValues = {};
        fxObj.history.forEach(fxEntry => {
            const dateKey = fxEntry.date;
            let value     = 0;
            const curTime = new Date(fxEntry.full_date).getTime();
            portfolio.forEach(asset => {
                if (new Date(asset.date + ' 00:00:00').getTime() > curTime) return;
                const td = allData.find(d => d.ticker === asset.ticker);
                if (!td) return;
                const pe = td.history.find(h => h.date === dateKey);
                if (pe) value += asset.amount * pe.price * fxEntry.price;
            });
            if (value > 0) dailyValues[dateKey] = { date: new Date(fxEntry.full_date), value };
        });

        const monthly = {};
        Object.keys(dailyValues).sort().forEach(dk => {
            const { date, value } = dailyValues[dk];
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (!monthly[key]) {
                monthly[key] = { year: date.getFullYear(), month: date.getMonth(), startValue: value, endValue: value, days: 1 };
            } else {
                monthly[key].endValue = value;
                monthly[key].days++;
            }
        });

        const returns = Object.values(monthly)
            .filter(m => m.days >= 1)
            .map(m => ({ year: m.year, month: m.month, return: m.startValue > 0 ? ((m.endValue - m.startValue) / m.startValue * 100) : 0 }));

        renderHeatmap(returns);

    } catch (e) {
        console.error('Heatmap-Fehler:', e);
        container.innerHTML = `<div class="heatmap-panel"><p style="color:var(--red);text-align:center;padding:40px;font-family:'DM Mono',monospace">Fehler beim Laden</p></div>`;
    }
}

function renderHeatmap(returns) {
    const container = document.getElementById('heatmap-container');
    if (!container) return;

    const years  = [...new Set(returns.map(r => r.year))].sort((a, b) => b - a);
    const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

    const allR = returns.map(r => r.return);
    const maxR = Math.max(...allR, 1);
    const minR = Math.min(...allR, -1);

    function cellStyle(val) {
        if (val > 0) {
            const i = Math.min(val / maxR, 1);
            const g = Math.round(200 + i * 55);
            const r = Math.round(220 - i * 100);
            return `background:rgb(${r},${g},${r});color:${i > 0.4 ? '#1a4b1a' : '#2d6a4f'}`;
        } else if (val < 0) {
            const i = Math.min(Math.abs(val) / Math.abs(minR), 1);
            const r = Math.round(200 + i * 55);
            const g = Math.round(220 - i * 100);
            return `background:rgb(${r},${g},${g});color:${i > 0.4 ? '#5a0a05' : '#c0392b'}`;
        }
        return `background:var(--surface2);color:var(--text3)`;
    }

    const rows = years.map(year => {
        const cells = Array.from({length: 12}, (_, m) => {
            const entry = returns.find(r => r.year === year && r.month === m);
            if (!entry) return `<td style="background:var(--surface2);color:var(--border2)">—</td>`;
            const v = entry.return;
            return `<td style="${cellStyle(v)}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</td>`;
        }).join('');
        return `<tr><td>${year}</td>${cells}</tr>`;
    }).join('');

    container.innerHTML = `
        <div class="heatmap-panel">
            <div class="card-label" style="margin-bottom:14px">Monatsrenditen Heatmap</div>
            <table class="heatmap-table">
                <thead><tr><th>Jahr</th>${months.map(m => `<th>${m}</th>`).join('')}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="heatmap-legend">
                <div class="legend-box"><div class="legend-swatch" style="background:rgba(45,106,79,0.6)"></div>Positiv</div>
                <div class="legend-box"><div class="legend-swatch" style="background:rgba(192,57,43,0.6)"></div>Negativ</div>
                <div class="legend-box"><div class="legend-swatch" style="background:var(--surface2)"></div>Keine Daten</div>
            </div>
        </div>`;
}

// ─── TIME FILTER ─────────────────────────────────────────

function updateTimeFilter(type) {
    const map = { 1:'1d', 7:'5d', 30:'1mo', ytd:'ytd', 365:'1y', all:'max' };
    const period = map[type] || 'max';
    const btn = document.activeElement;
    if (btn) {
        btn.closest('.time-filters')?.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    loadPerformanceChart(period);
}

// ─── MODALS ──────────────────────────────────────────────

function toggleModal(show) {
    const m = document.getElementById('transaction-modal');
    if (!m) return;
    m.classList.toggle('open', show);
    if (!show) clearTransactionForm();
}

function handleModalBackdrop(e) {
    if (e.target === document.getElementById('transaction-modal')) toggleModal(false);
}

function toggleEditModal(show) {
    const m = document.getElementById('edit-modal');
    if (!m) return;
    m.classList.toggle('open', show);
}

function handleEditModalBackdrop(e) {
    if (e.target === document.getElementById('edit-modal')) toggleEditModal(false);
}

function clearTransactionForm() {
    ['asset-name','isin','amount','price','exchange-rate','purchase-date','fee-commission','fee-stempel']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const preview = document.getElementById('transaction-preview');
    if (preview) preview.style.display = 'none';
}

function setupTransactionPreview() {
    ['amount','price','exchange-rate'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateTransactionPreview);
    });
}

function updateTransactionPreview() {
    const amount = parseFloat(document.getElementById('amount')?.value) || 0;
    const price  = parseFloat(document.getElementById('price')?.value) || 0;
    const rate   = parseFloat(document.getElementById('exchange-rate')?.value) || 0;
    const preview = document.getElementById('transaction-preview');
    const totalEl = document.getElementById('preview-total');
    if (amount > 0 && price > 0 && rate > 0) {
        if (totalEl) totalEl.textContent = (amount * price * rate).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' CHF';
        if (preview)  preview.style.display = 'flex';
    } else {
        if (preview) preview.style.display = 'none';
    }
}

// ─── CRUD ────────────────────────────────────────────────

async function calculate() {
    const name   = document.getElementById('asset-name')?.value?.trim();
    const isin   = document.getElementById('isin')?.value?.trim().toUpperCase();
    const amount = parseFloat(document.getElementById('amount')?.value);
    const price  = parseFloat(document.getElementById('price')?.value);
    const rate   = parseFloat(document.getElementById('exchange-rate')?.value);
    const date   = document.getElementById('purchase-date')?.value;

    if (!name || !isin || isNaN(amount) || amount <= 0) {
        alert('Bitte Name, ISIN und Anzahl angeben.');
        return;
    }

    const item = {
        name, isin, amount,
        priceUSD: isNaN(price) ? 0 : price,
        rate:     isNaN(rate)  ? 1 : rate,
        date,
        totalCHF: amount * (isNaN(price) ? 0 : price) * (isNaN(rate) ? 1 : rate),
        ticker:   TICKER_MAP[isin] || ''
    };

    try {
        const res = await fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        if (!res.ok) throw new Error();
        await loadDataFromServer();
        renderPortfolio();
        toggleModal(false);
    } catch (e) {
        alert('Fehler beim Speichern.');
    }
}

async function deleteBuy(dbId) {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return;
    try {
        await fetch(`/api/portfolio/${dbId}`, { method: 'DELETE' });
        await loadDataFromServer();
        renderPortfolio();
    } catch (e) {
        alert('Fehler beim Löschen.');
    }
}

function openEditModal(dbId) {
    const item = portfolio.find(p => p.id === dbId);
    if (!item) return;
    document.getElementById('edit-id').value         = dbId;
    document.getElementById('edit-asset-name').value = item.name     || '';
    document.getElementById('edit-isin').value        = item.isin     || '';
    document.getElementById('edit-amount').value      = item.amount   || '';
    document.getElementById('edit-price').value       = item.priceUSD || '';
    document.getElementById('edit-rate').value        = item.rate     || '';
    document.getElementById('edit-date').value        = item.date     || '';
    toggleEditModal(true);
}

async function saveEdit() {
    const dbId   = parseInt(document.getElementById('edit-id')?.value);
    const item   = portfolio.find(p => p.id === dbId);
    if (!item) return;

    const name   = document.getElementById('edit-asset-name')?.value?.trim();
    const isin   = document.getElementById('edit-isin')?.value?.trim().toUpperCase();
    const amount = parseFloat(document.getElementById('edit-amount')?.value);
    const price  = parseFloat(document.getElementById('edit-price')?.value) || 0;
    const rate   = parseFloat(document.getElementById('edit-rate')?.value)  || 1;
    const date   = document.getElementById('edit-date')?.value;
    const updated = { ...item, name, isin, amount, priceUSD: price, rate, date, totalCHF: amount * price * rate };

    try {
        await fetch(`/api/portfolio/${dbId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        await loadDataFromServer();
        renderPortfolio();
        toggleEditModal(false);
    } catch (e) {
        alert('Fehler beim Speichern.');
    }
}

async function editCash() {
    const n = prompt('Cash-Bestand in CHF:', cashBalance);
    if (n === null) return;
    cashBalance = parseFloat(n) || 0;
    try {
        await fetch('/api/cash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balance: cashBalance })
        });
        renderPortfolio();
    } catch (e) {
        alert('Fehler beim Speichern.');
    }
}

// ─── MOBILE ──────────────────────────────────────────────

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = getOrCreateOverlay();
    overlay.classList.toggle('visible', sidebar.classList.toggle('mobile-open'));
}

function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
}

function getOrCreateOverlay() {
    let o = document.getElementById('sidebar-overlay');
    if (!o) { o = document.createElement('div'); o.id = 'sidebar-overlay'; o.className = 'sidebar-overlay'; o.onclick = closeMobileSidebar; document.body.appendChild(o); }
    return o;
}

// ─── HELPERS ─────────────────────────────────────────────

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}