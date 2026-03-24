// ═══════════════════════════════════════════════════════════
//  Dario's Portfolio — script.js
// ═══════════════════════════════════════════════════════════

const FX_TICKER_MAP = {
    'USD': 'USDCHF=X', 'EUR': 'EURCHF=X', 'GBP': 'GBPCHF=X',
    'JPY': 'JPYCHF=X', 'CAD': 'CADCHF=X', 'AUD': 'AUDCHF=X', 'CHF': null
};

function getRequiredFxTickers() {
    const currencies = [...new Set(portfolio.map(i => i.currency || 'USD'))];
    return [...new Set(currencies.map(c => FX_TICKER_MAP[c]).filter(Boolean))];
}

function getFxRate(allData, currency, dateLabel) {
    if (!currency || currency === 'CHF') return 1;
    const fxTicker = FX_TICKER_MAP[currency];
    if (!fxTicker) return 1;
    const fxData = allData.find(d => d.ticker === fxTicker);
    if (!fxData) return 1;
    const entry = fxData.history.find(h => h.date === dateLabel);
    return entry?.price || fxData.history.at(-1)?.price || 1;
}

function getCurrentFxRate(allData, currency) {
    if (!currency || currency === 'CHF') return 1;
    const fxTicker = FX_TICKER_MAP[currency];
    if (!fxTicker) return 1;
    const fxData = allData.find(d => d.ticker === fxTicker);
    return fxData?.history?.at(-1)?.price || 1;
}

function getPriceForDate(tickerHistory, dateLabel, datePrefix) {
    if (!tickerHistory || !tickerHistory.length) return null;
    let entry = tickerHistory.find(h => h.date === dateLabel);
    if (entry) return entry.price;
    if (datePrefix) {
        entry = tickerHistory.find(h => (h.full_date || h.date).startsWith(datePrefix));
        if (entry) return entry.price;
    }
    return null;
}

// Liest CSS-Variablen zur Laufzeit aus — wichtig damit Charts mit Theme wechseln
function getVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function getChartColors() {
    return [getVar('--c1')||'#A9C9FF', getVar('--c2')||'#B8A9FF', getVar('--c3')||'#FFD6A9',
            getVar('--c4')||'#A9F2D4', getVar('--c5')||'#F2A9D4', getVar('--c6')||'#A9EEF2'];
}
function getTooltipDefaults() {
    return {
        backgroundColor: getVar('--surface') || '#ffffff',
        borderColor:     getVar('--border')  || '#e4eaf4',
        borderWidth: 1,
        titleColor:  getVar('--text2') || '#6B7A99',
        bodyColor:   getVar('--text')  || '#2F3A4A',
        padding: 10, cornerRadius: 6,
    };
}

let portfolio       = [];
let cashBalance     = 0;
let myDonutChart    = null;
let myLineChart     = null;
let currentPerfData = null;

// ─── THEME SYSTEM ────────────────────────────────────────

function setTheme(theme, btnEl) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dario_theme', theme);

    // Alle Theme-Buttons zurücksetzen
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    // Charts neu rendern mit neuen Theme-Farben
    if (myDonutChart || myLineChart) {
        renderDonut();
        if (currentPerfData) loadPerformanceChart('max');
    }
    if (analysisChart) {
        renderAnalysisChart(_getAnalysisNames());
    }
}

function loadSavedTheme() {
    const saved = localStorage.getItem('dario_theme') || 'hell';
    document.documentElement.setAttribute('data-theme', saved);
    // Richtigen Button als active markieren
    document.querySelectorAll('.theme-btn').forEach(btn => {
        const themeName = btn.getAttribute('onclick')?.match(/'(\w+)'/)?.[1];
        if (themeName === saved) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

// ─── TOOLTIP SYSTEM ──────────────────────────────────────

const TOOLTIPS = {
    'twr':         'Time-Weighted Return: Misst die reine Anlagerendite unabhängig vom Einzahlungszeitpunkt. Ideal zum Vergleich mit Benchmarks.',
    'simple-ret':  'Simple Return: (Aktueller Wert − Investiert) ÷ Investiert. Zeigt wie viel du persönlich gewonnen hast.',
    'kurseffekt':  'Kurseffekt: Gewinn/Verlust durch Kursveränderungen des Assets — gerechnet zum durchschnittlichen Kaufkurs.',
    'fx-effekt':   'Währungseffekt: Gewinn/Verlust durch Veränderung des Wechselkurses seit dem Kauf.',
    'gv-fees':     'G/V ohne Gebühren: Reiner Marktgewinn ohne Berücksichtigung von Stempelsteuer und sonstigen Kosten.',
    'fees':        'Gebühren: Summe aus Stempelsteuer und sonstigen Kosten (Kommission, Wechselspesen etc.) aller Käufe.',
    'investiert':  'Investiert: Summe aller Kaufbeträge in CHF (Anzahl × Kurs × FX-Rate zum Kaufzeitpunkt).',
    'akt-wert':    'Aktueller Wert: Anzahl Stück × aktueller Kurs × aktueller Wechselkurs in CHF.',
    'rendite-fees':'Rendite inkl. Gebühren: Simple Return abzüglich aller erfassten Gebühren.',
    'heatmap':     'Monatsrendite: (Letzter Wert des Monats − Erster Wert des Monats) ÷ Erster Wert. Berechnet aus täglichen Schlusskursen.',
    'stock-gain':  'Stock Gain: Kursgewinn in CHF zum durchschnittlichen Kaufkurs — isoliert vom Währungseffekt.',
    'fx-gain':     'FX Gain: Gewinn/Verlust durch Wechselkursveränderung seit Kauf.',
    'total-gain':  'Total Gain: Aktueller Wert minus Kaufpreis in CHF (inkl. FX-Effekt).',
};

function iBtn(key) {
    return `<span class="info-btn" onmouseenter="showTooltip(event,'${key}')" onmouseleave="hideTooltip()">i</span>`;
}

let _ttEl = null;
function showTooltip(e, key) {
    const text = TOOLTIPS[key]; if (!text) return;
    if (!_ttEl) { _ttEl = document.createElement('div'); _ttEl.className = 'info-tooltip'; document.body.appendChild(_ttEl); }
    _ttEl.textContent = text;
    _ttEl.classList.add('visible');
    const r = e.target.getBoundingClientRect();
    _ttEl.style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
    _ttEl.style.top  = (r.top - _ttEl.offsetHeight - 6) + 'px';
}
function hideTooltip() { _ttEl?.classList.remove('visible'); }

// ─── PROFILE MANAGEMENT ──────────────────────────────────

function getProfiles() {
    try { return JSON.parse(localStorage.getItem('dario_profiles') || '[]'); } catch { return []; }
}
function saveProfiles(p) { localStorage.setItem('dario_profiles', JSON.stringify(p)); }
function addProfile(username, token, userId) {
    const profiles = getProfiles();
    if (!profiles.find(p => p.userId === userId)) {
        profiles.push({ username, token, userId });
        saveProfiles(profiles);
    }
    renderProfileStrip();
}
function removeProfile(userId) {
    saveProfiles(getProfiles().filter(p => p.userId !== userId));
    renderProfileStrip();
}

function renderProfileStrip() {
    const strip = document.getElementById('profile-strip');
    if (!strip) return;
    const profiles = getProfiles();
    if (!profiles.length) { strip.innerHTML = ''; return; }
    strip.innerHTML = profiles.map(p => {
        const initials = p.username.slice(0, 2).toUpperCase();
        const isActive = p.userId === window._currentUserId;
        return `<div class="profile-avatar ${isActive ? 'active' : ''}"
                     onclick="switchProfile(${p.userId})"
                     title="${p.username}">
                    ${initials}
                    <span class="profile-tooltip">${p.username}</span>
                </div>`;
    }).join('') +
    `<div class="profile-add-btn" onclick="openProfileModal()" title="Profil hinzufügen">+</div>`;
}

async function switchProfile(userId) {
    const profiles = getProfiles();
    const profile  = profiles.find(p => p.userId === userId);
    if (!profile) return;
    try {
        const res = await fetch('/api/token-login', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: profile.token })
        });
        if (!res.ok) { removeProfile(userId); alert(`Session für "${profile.username}" abgelaufen.`); return; }
        const data = await res.json();
        window._currentUserId = userId;
        const el = document.getElementById('user-avatar');
        const nm = document.getElementById('user-name');
        if (el) el.textContent = data.username.slice(0, 2).toUpperCase();
        if (nm) nm.textContent = data.username;
        renderProfileStrip();
        await loadDataFromServer();
        renderPortfolio();
        showPage('page-dashboard');
    } catch(e) { alert('Fehler beim Profilwechsel.'); }
}

function openProfileModal() {
    const overlay = document.getElementById('profile-modal-overlay');
    if (overlay) { overlay.classList.add('open'); document.getElementById('profile-login-user')?.focus(); document.getElementById('profile-login-error').textContent = ''; }
}
function closeProfileModal() {
    document.getElementById('profile-modal-overlay')?.classList.remove('open');
    ['profile-login-user','profile-login-pass'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}
async function profileLogin() {
    const username = document.getElementById('profile-login-user')?.value?.trim().toLowerCase();
    const password = document.getElementById('profile-login-pass')?.value;
    const errEl    = document.getElementById('profile-login-error');
    if (!username || !password) { errEl.textContent = 'Bitte alle Felder ausfüllen.'; return; }
    try {
        const res  = await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Fehler beim Login.'; return; }
        addProfile(data.username, data.token, data.user_id);
        closeProfileModal();
    } catch(e) { document.getElementById('profile-login-error').textContent = 'Verbindungsfehler.'; }
}

// ─── INIT ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    loadSavedTheme();

    try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = '/login.html'; return; }
        const user = await res.json();
        const el = document.getElementById('user-avatar');
        const nm = document.getElementById('user-name');
        if (el) el.textContent = user.username.slice(0, 2).toUpperCase();
        if (nm) nm.textContent = user.username;
        window._currentUserId = user.user_id;
        const profiles = getProfiles();
        if (profiles.find(p => p.userId === user.user_id)) renderProfileStrip();
    } catch (e) { window.location.href = '/login.html'; return; }

    setGreeting();
    renderProfileStrip();
    await loadDataFromServer();
    renderPortfolio();
    showPage('page-dashboard');
    setupTransactionPreview();
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
            fetch('/api/portfolio', { credentials: 'include' }),
            fetch('/api/cash', { credentials: 'include' })
        ]);
        portfolio   = await portRes.json();
        const cd    = await cashRes.json();
        cashBalance = cd.balance || 0;
    } catch (e) { console.error('Fehler beim Laden:', e); }
}

async function doLogout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
}

async function doDeleteAccount() {
    if (!confirm('Konto wirklich löschen? Alle Daten werden unwiderruflich gelöscht!')) return;
    if (!confirm('Bist du sicher? Dies kann nicht rückgängig gemacht werden.')) return;
    try {
        await fetch('/api/delete-account', { method: 'DELETE', credentials: 'include' });
        window.location.href = '/login.html';
    } catch (e) { alert('Fehler beim Löschen.'); }
}

// ─── PAGE NAVIGATION ─────────────────────────────────────

function showPage(pageId) {
    ['page-dashboard', 'page-investments', 'page-analysis', 'page-rebalancing'].forEach(id => {
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
    } else if (pageId === 'page-analysis') {
        loadPeriodPerformance();
        loadAnalysisCharts();
        loadAssetOverview();
        loadHeatmap();
    } else if (pageId === 'page-investments') {
        renderPortfolio();
    } else if (pageId === 'page-rebalancing') {
        loadRebalancingPage();
    }
    if (window.innerWidth <= 768) closeMobileSidebar();
}

// ─── RENDER PORTFOLIO ────────────────────────────────────

// ─── SORT STATE ──────────────────────────────────────────
let _sortMode = 'name';   // 'name' | 'invested' | 'amount' | 'type' | 'date'
let _sortAsc  = true;

function setSortMode(mode, btnEl) {
    if (_sortMode === mode) {
        // Gleicher Modus → Richtung umkehren
        _sortAsc = !_sortAsc;
    } else {
        _sortMode = mode;
        _sortAsc  = true;
    }
    // Buttons updaten
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    document.getElementById('sort-dir-btn').textContent = _sortAsc ? '↓' : '↑';
    renderPortfolio();
}

function toggleSortDir() {
    _sortAsc = !_sortAsc;
    document.getElementById('sort-dir-btn').textContent = _sortAsc ? '↓' : '↑';
    renderPortfolio();
}

function sortGrouped(grouped) {
    const entries = Object.entries(grouped);
    entries.sort(([, a], [, b]) => {
        let va, vb;
        switch (_sortMode) {
            case 'invested':
                va = a.totalValue; vb = b.totalValue; break;
            case 'amount':
                va = a.totalAmount; vb = b.totalAmount; break;
            case 'type':
                va = a.asset_type || 'stock'; vb = b.asset_type || 'stock';
                return _sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            case 'date':
                // Frühestes Kaufdatum der Gruppe
                va = a.buys.map(x => x.date || '').sort()[0] || '';
                vb = b.buys.map(x => x.date || '').sort()[0] || '';
                return _sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            case 'name':
            default:
                va = a.name || ''; vb = b.name || '';
                return _sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return _sortAsc ? (vb - va) : (va - vb); // numeric: höchste oben bei asc
    });
    return Object.fromEntries(entries);
}

function renderPortfolio() {
    const list = document.getElementById('positions-list');
    if (!list) return;
    list.innerHTML = '';
    let investmentTotal = 0;

    const TYPE_BADGE = {
        stock:       '',
        bond:        '<span class="asset-type-badge badge-bond">Anleihe</span>',
        real_estate: '<span class="asset-type-badge badge-realestate">Immobilien</span>',
        other:       '<span class="asset-type-badge badge-other">Sonstiges</span>',
    };

    let grouped = portfolio.reduce((acc, item) => {
        const key = item.isin || item.name;
        if (!acc[key]) acc[key] = {
            name: item.name, isin: item.isin,
            totalValue: 0, totalAmount: 0, buys: [],
            asset_type: item.asset_type || 'stock',
            manual_price: item.manual_price
        };
        acc[key].buys.push(item);
        acc[key].totalValue  += item.totalCHF;
        acc[key].totalAmount += item.amount;
        // Use latest manual_price if set
        if (item.manual_price != null) acc[key].manual_price = item.manual_price;
        return acc;
    }, {});

    // Sortierung anwenden
    grouped = sortGrouped(grouped);

    for (const key in grouped) {
        const asset    = grouped[key];
        const atype    = asset.asset_type || 'stock';
        const noChart  = ['bond', 'real_estate', 'other'].includes(atype);
        investmentTotal += asset.totalValue;

        // Current value: use manual_price if set and no ticker
        const hasTicker    = asset.buys.some(b => b.ticker);
        const manualPrice  = asset.manual_price;
        const manualNote   = (!hasTicker && manualPrice != null)
            ? `<span style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-left:6px">Kurs: ${manualPrice.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${asset.buys[0]?.currency || 'CHF'}</span>`
            : '';
        const noChartNote  = noChart
            ? `<span style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-left:4px">· kein Chart</span>`
            : '';

        const el = document.createElement('div');
        el.className = 'asset-group';
        el.innerHTML = `
            <div class="asset-header" onclick="toggleAssetDetails(this)">
                <div>
                    <div class="asset-name">
                        ${asset.name}
                        ${TYPE_BADGE[atype] || ''}
                    </div>
                    <div class="asset-meta">${asset.isin || '—'}${manualNote}${noChartNote}</div>
                </div>
                <div class="asset-summary">
                    <span class="asset-amount">${asset.totalAmount.toFixed(4)} Stk.</span>
                    <span class="asset-value">${asset.totalValue.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} CHF</span>
                    <span class="asset-arrow">▼</span>
                </div>
            </div>
            <div class="asset-details">
                <table class="details-table">
                    <thead><tr><th>Datum</th><th>Stk.</th><th>Kaufkurs</th><th>Kurs/CHF</th><th>Total CHF</th><th>Stempelgebühr</th><th></th></tr></thead>
                    <tbody>
                        ${asset.buys.map(buy => `
                            <tr>
                                <td>${buy.date || '—'}</td>
                                <td>${(buy.amount || 0).toFixed(4)}</td>
                                <td>${(buy.priceUSD || 0).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${buy.currency || 'CHF'}</td>
                                <td>${buy.currency === 'CHF' ? '—' : (buy.rate || 0).toFixed(4)}</td>
                                <td>${(buy.totalCHF || 0).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td>${(buy.fee_stamp || 0).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td>
                                    <button class="action-btn edit" onclick="openEditModal(${buy.id})">✎</button>
                                    <button class="action-btn delete" onclick="deleteBuy(${buy.id})">✕</button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        list.appendChild(el);
    }

    const fmtCHF = v => v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    setEl('inv-total-all',    fmtCHF(investmentTotal + cashBalance));
    setEl('inv-total-stocks', fmtCHF(investmentTotal));
    setEl('inv-total-cash',   fmtCHF(cashBalance));
    renderDonut();
}

function toggleAssetDetails(header) {
    const details = header.nextElementSibling;
    if (!details) return;
    header.classList.toggle('open', details.classList.toggle('show'));
}

// ─── DONUT CHART ─────────────────────────────────────────

function renderDonut() {
    const canvas = document.getElementById('myDonutChart');
    if (!canvas) return;

    const grouped = portfolio.reduce((acc, item) => {
        const key = item.isin || item.name;
        if (!acc[key]) acc[key] = { label: item.name, value: 0 };
        acc[key].value += item.totalCHF;
        return acc;
    }, {});
    if (cashBalance > 0) grouped['__cash__'] = { label: 'Cash', value: cashBalance };

    const entries    = Object.values(grouped).sort((a, b) => b.value - a.value);  // grösste zuerst
    const grandTotal = entries.reduce((s, e) => s + e.value, 0);
    // Theme-Farben zur Laufzeit holen (wechseln mit Theme)
    const colors     = entries.map((_, i) => getChartColors()[i % 6]);

    if (myDonutChart) { myDonutChart.destroy(); myDonutChart = null; }
    if (!entries.length) return;

    // Border-Farbe = Surface (kein schwarzer Rand), zur Laufzeit aufgelöst
    const surfaceColor = getVar('--surface') || '#ffffff';
    const tt = getTooltipDefaults();

    myDonutChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: entries.map(e => e.label), datasets: [{ data: entries.map(e => e.value), backgroundColor: colors, borderWidth: 3, borderColor: surfaceColor, hoverBorderWidth: 4, hoverBorderColor: surfaceColor }] },
        options: {
            cutout: '70%', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { ...tt, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('de-CH', {minimumFractionDigits: 0})} CHF (${((ctx.parsed / grandTotal) * 100).toFixed(1)}%)` } }
            }
        }
    });

    const centerEl = document.getElementById('donut-center-text');
    if (centerEl) centerEl.innerHTML = `${grandTotal.toLocaleString('de-CH', {maximumFractionDigits: 0})}<br><span style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:0.1em">CHF</span>`;

    const legendEl = document.getElementById('donut-legend');
    // Legende neu aufbauen mit aktuellen Theme-Farben
    const freshColors = getChartColors();
    if (legendEl) legendEl.innerHTML = entries.map((e, i) => `
        <div class="legend-item">
            <div class="legend-left"><div class="legend-dot" style="background:${freshColors[i % 6]}"></div><span>${e.label}</span></div>
            <span class="legend-pct">${grandTotal > 0 ? ((e.value / grandTotal) * 100).toFixed(1) : '0.0'}%</span>
        </div>`).join('');
}

// ─── PERFORMANCE CHART ───────────────────────────────────

async function loadPerformanceChart(period = 'max') {
    const canvas = document.getElementById('lineChart');
    const loader = document.getElementById('chart-loader');
    if (!canvas) return;

    if (loader) loader.classList.remove('hidden');
    if (myLineChart) { myLineChart.destroy(); myLineChart = null; }
    const badge = document.getElementById('chart-return-badge');
    if (badge) badge.style.display = 'none';

    // Nur Chart-fähige Assets (Aktien/ETFs mit Ticker) für den Chart verwenden
    const CHART_TYPES = ['stock', null, undefined, ''];
    const chartAssets = portfolio.filter(i =>
        CHART_TYPES.includes(i.asset_type) && i.ticker
    );
    const tickers = [...new Set(chartAssets.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) { if (loader) loader.classList.add('hidden'); return; }

    try {
        const earliestDate = portfolio.reduce((earliest, item) => {
            const d = new Date(item.date);
            return !earliest || d < earliest ? d : earliest;
        }, null);

        const fxTickersA  = getRequiredFxTickers();
        const allTickersA = [...tickers, ...fxTickersA];
        const allData = await Promise.all(allTickersA.map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=${period}`, { credentials: 'include' });
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));

        const fxObjA = allData.find(d => fxTickersA.includes(d.ticker) && d.history.length > 0)
                    || allData.find(d => d.ticker === 'USDCHF=X')
                    || allData.find(d => tickers.includes(d.ticker) && d.history.length > 0);
        if (!fxObjA || !fxObjA.history.length) return;

        let fxHistory = fxObjA.history.filter(h => new Date(h.full_date) >= earliestDate);
        fxHistory = fxHistory.filter(h => {
            if (!h.full_date.includes(':')) return true;
            const [hour, min] = h.full_date.split(' ')[1].split(':').map(Number);
            const mins = hour * 60 + min;
            return mins >= 540 && mins <= 1050;
        });

        const labels = fxHistory.map(h => h.date);
        const portfolioValues = [], investedValues = [];
        let lastKnownPrices = {}, lastKnownFX = 0.88;

        labels.forEach(dateLabel => {
            const fxEntry = fxHistory.find(h => h.date === dateLabel);
            if (!fxEntry?.full_date) { portfolioValues.push(null); investedValues.push(null); return; }
            if (fxEntry.price) lastKnownFX = fxEntry.price;

            const datePrefix  = fxEntry.full_date.split(' ')[0];
            const currentTime = new Date(fxEntry.full_date).getTime();
            let marketVal = 0, investedVal = 0;

            portfolio.forEach(asset => {
                const buyTime = new Date(asset.date + ' 00:00:00').getTime();
                if (buyTime > currentTime) return;
                investedVal += asset.totalCHF;

                const atype   = asset.asset_type || 'stock';
                const inChart = ['stock', '', null, undefined].includes(atype) && asset.ticker;

                if (inChart) {
                    // Normal: Kurs von yfinance
                    const tickerData = allData.find(d => d.ticker === asset.ticker);
                    if (tickerData) {
                        const price = getPriceForDate(tickerData.history, dateLabel, datePrefix);
                        if (price != null) lastKnownPrices[asset.ticker] = price;
                        const assetFX = getFxRate(allData, asset.currency || 'USD', dateLabel);
                        if (assetFX) lastKnownFX = assetFX;
                        marketVal += asset.amount * (lastKnownPrices[asset.ticker] || 0) * assetFX;
                    }
                } else if (asset.manual_price != null) {
                    // Manueller Kurs: konstanter Wert (kein Verlauf verfügbar)
                    const fx = asset.currency === 'CHF' ? 1 : getFxRate(allData, asset.currency || 'CHF', dateLabel);
                    marketVal += asset.amount * asset.manual_price * fx;
                } else {
                    // Kein Ticker, kein manueller Kurs → Kaufwert als Näherung
                    marketVal += asset.totalCHF;
                }
            });

            portfolioValues.push(marketVal || null);
            investedValues.push(investedVal || null);
        });

        // Hole aktuelle Theme-Farben aus CSS-Variablen (zur Laufzeit aufgelöst)
        const lineColor = getVar('--chart-line') || '#5B8DEF';
        const fillColor = getVar('--chart-fill') || 'rgba(169,201,255,0.12)';
        const invColor  = getVar('--chart-inv')  || '#D0DAF0';
        const tickColor = getVar('--text3')      || '#A8B4CC';
        const tt        = getTooltipDefaults();

        myLineChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Marktwert', data: portfolioValues, borderColor: lineColor, backgroundColor: fillColor, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
                    { label: 'Investiert', data: investedValues, borderColor: invColor, borderDash: [5, 4], fill: false, tension: 0, pointRadius: 0, borderWidth: 1.5 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.15)', drawBorder: false }, ticks: { color: tickColor, font: { family: "'DM Mono', monospace", size: 10 }, maxTicksLimit: 8 } },
                    y: { grid: { color: 'rgba(128,128,128,0.15)', drawBorder: false }, ticks: { color: tickColor, font: { family: "'DM Mono', monospace", size: 10 }, callback: v => v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' CHF' } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tt, padding: 12,
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} CHF`,
                            afterBody: (items) => {
                                const market   = items.find(i => i.dataset.label === 'Marktwert')?.parsed.y;
                                const invested = items.find(i => i.dataset.label === 'Investiert')?.parsed.y;
                                if (market == null || invested == null || invested === 0) return [];
                                const gainCHF = market - invested;
                                const sign    = gainCHF >= 0 ? '+' : '';
                                return ['', ` Gewinn: ${sign}${gainCHF.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} CHF  (${sign}${(gainCHF / invested * 100).toFixed(2)}%)`];
                            }
                        }
                    }
                }
            }
        });

        const lastValid  = v => [...v].reverse().find(x => x != null) || 0;
        const currentVal = lastValid(portfolioValues);
        const invested   = lastValid(investedValues);
        const profitCHF  = currentVal - invested;
        const profitPct  = invested > 0 ? (profitCHF / invested * 100) : 0;

        let twr = 1.0, prevMarket = null, prevInvested = null;
        for (let i = 0; i < portfolioValues.length; i++) {
            const mkt = portfolioValues[i], inv = investedValues[i];
            if (mkt == null || inv == null) continue;
            if (prevMarket !== null && prevInvested !== null) {
                const basis = prevMarket + Math.max(0, inv - prevInvested);
                if (basis > 0) twr *= (mkt / basis);
            }
            prevMarket = mkt; prevInvested = inv;
        }
        const twrPct = (twr - 1) * 100;
        if (badge) {
            badge.style.display = 'block';
            badge.style.color   = twrPct >= 0 ? 'var(--green)' : 'var(--red)';
            badge.textContent   = (twrPct >= 0 ? '+' : '') + twrPct.toFixed(2) + '% TWR';
        }

        const nonChfAssets = portfolio.filter(p => (p.currency || 'USD') !== 'CHF');
        const avgFX = nonChfAssets.length > 0 ? nonChfAssets.reduce((s, p) => s + p.rate, 0) / nonChfAssets.length : 1;
        const fxChg = avgFX > 0 ? ((lastKnownFX - avgFX) / avgFX * 100) : 0;

        currentPerfData = { currentVal, invested, profitCHF, profitPct, fxEffect: fxChg };
        displayPerformance();

    } catch (e) { console.error('Chart-Fehler:', e); }
    finally { if (loader) loader.classList.add('hidden'); }
}

// ─── PERFORMANCE DISPLAY ─────────────────────────────────

function displayPerformance() {
    const box = document.getElementById('performance-display');
    if (!box || !currentPerfData) return;

    const p         = currentPerfData;
    const totalFees = portfolio.reduce((s, i) => s + (i.fee_stamp || 0) + (i.fee_other || 0), 0);
    const gvOhne    = p.profitCHF;
    const gvMit     = p.profitCHF - totalFees;
    const rendOhne  = p.invested > 0 ? (gvOhne / p.invested * 100) : 0;
    const rendMit   = p.invested > 0 ? (gvMit  / p.invested * 100) : 0;
    const stockGainPct = p.profitPct - p.fxEffect;
    const stockGainCHF = p.invested * stockGainPct / 100;
    const fxGainCHF    = p.invested * p.fxEffect   / 100;

    const col    = v => v >= 0 ? 'var(--green)' : 'var(--red)';
    const fmt    = v => (v >= 0 ? '+' : '') + v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

    setEl('kpi-total',    p.currentVal.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    setEl('kpi-invested', p.invested.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    const gainEl  = document.getElementById('kpi-gain');
    const badgeEl = document.getElementById('kpi-gain-badge');
    if (gainEl)  { gainEl.textContent = fmt(gvOhne); gainEl.style.color = col(gvOhne); }
    if (badgeEl) { badgeEl.textContent = fmtPct(rendOhne); badgeEl.className = 'kpi-badge ' + (gvOhne >= 0 ? 'pos' : 'neg'); }

    const card = (label, infoKey, main, sub, subColor) => `
        <div class="pg-card">
            <div class="pg-card-label">${label}${iBtn(infoKey)}</div>
            <div class="pg-card-value" style="color:${subColor}">${main}</div>
            <div class="pg-card-sub" style="color:${subColor}">${sub}</div>
        </div>`;

    box.innerHTML = `
        <div class="card-head"><span class="card-label">Performance</span></div>
        <div class="card-body" style="padding:18px 20px">
            <div style="margin-bottom:20px">
                <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
                    <div style="font-size:48px;font-weight:800;letter-spacing:-0.04em;line-height:1;color:${col(gvOhne)}">${fmtPct(rendOhne)}</div>
                    <div>
                        <div style="font-size:15px;font-weight:700;color:${col(gvOhne)}">${fmt(gvOhne)} CHF</div>
                        <div style="font-family:var(--mono);font-size:9px;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">
                            Gesamtrendite seit Kauf ${iBtn('simple-ret')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="pg-grid">
                ${card('Investiert',           'investiert',   p.invested.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}), 'CHF', 'var(--text2)')}
                ${card('Aktueller Wert',       'akt-wert',     p.currentVal.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}), 'CHF', 'var(--text2)')}
                ${card('G / V inkl. Gebühren', 'rendite-fees', fmt(gvMit) + ' CHF', fmtPct(rendMit), col(gvMit))}
                ${card('Kurseffekt',           'kurseffekt',   fmt(stockGainCHF) + ' CHF', fmtPct(stockGainPct), col(stockGainCHF))}
                ${card('Währungseffekt',       'fx-effekt',    fmt(fxGainCHF) + ' CHF', fmtPct(p.fxEffect), col(fxGainCHF))}
                ${card('Gebühren',             'fees',         '-' + totalFees.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' CHF', 'Stempel + Sonstige', 'var(--red)')}
            </div>
            <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;color:var(--text2);font-weight:600">G / V ohne Gebühren ${iBtn('gv-fees')}</span>
                <span style="font-family:var(--mono);font-size:13px;color:${col(gvOhne)};font-weight:700">
                    ${fmt(gvOhne)} CHF &nbsp;·&nbsp; ${fmtPct(rendOhne)}
                </span>
            </div>
        </div>`;
}

// ─── PERIOD PERFORMANCE ──────────────────────────────────

async function loadPeriodPerformance() {
    const tickers     = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) return;

    const periods     = [
        { id: 'pp-1d', api: '1d' }, { id: 'pp-1w', api: '5d' },
        { id: 'pp-1m', api: '1mo' }, { id: 'pp-1y', api: '1y' }
    ];
    const fxTickersB  = getRequiredFxTickers();
    const allTickersB = [...tickers, ...fxTickersB];

    for (const p of periods) {
        try {
            const allData = await Promise.all(allTickersB.map(async t => {
                const res  = await fetch(`/get_history?symbol=${t}&period=${p.api}`, { credentials: 'include' });
                const data = await res.json();
                return { ticker: t, history: Array.isArray(data) ? data : [] };
            }));
            let valStart = 0, valEnd = 0;
            portfolio.forEach(asset => {
                const td      = allData.find(d => d.ticker === asset.ticker);
                if (!td || !td.history.length) return;
                const currency = asset.currency || 'USD';
                const fxTicker = FX_TICKER_MAP[currency];
                const fxData   = fxTicker ? allData.find(d => d.ticker === fxTicker) : null;
                const fxFirst  = currency === 'CHF' ? 1 : (fxData?.history?.[0]?.price || 1);
                const fxLast   = currency === 'CHF' ? 1 : (fxData?.history?.at(-1)?.price || fxFirst);
                valStart += asset.amount * (td.history[0]?.price || 0)     * fxFirst;
                valEnd   += asset.amount * (td.history.at(-1)?.price || 0) * fxLast;
            });
            if (valStart <= 0) continue;
            const pct   = ((valEnd - valStart) / valStart * 100);
            const el    = document.getElementById(p.id);
            if (!el) continue;
            el.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
            el.style.color = pct >= 0 ? 'var(--green)' : 'var(--red)';
        } catch (e) {
            const el = document.getElementById(p.id);
            if (el) el.textContent = '—';
        }
    }
}

// ─── ASSET OVERVIEW TABLE ────────────────────────────────

async function loadAssetOverview() {
    const container = document.getElementById('asset-overview-container');
    if (!container) return;
    container.innerHTML = `<div class="card"><div class="card-head"><span class="card-label">Positions-Übersicht</span></div><div class="card-body" style="padding:0"><div style="text-align:center;padding:32px;font-family:'DM Mono',monospace;font-size:11px;color:var(--text3)">Lade Kursdaten…</div></div></div>`;

    const tickers = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) { container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:var(--text3);font-size:12px">Keine Positionen vorhanden</div></div>`; return; }

    try {
        const fxTickersC  = getRequiredFxTickers();
        const allData = await Promise.all([...tickers, ...fxTickersC].map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=max`, { credentials: 'include' });
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));

        const grouped = portfolio.reduce((acc, item) => {
            const key = item.isin || item.name;
            if (!acc[key]) acc[key] = {
                name: item.name, isin: item.isin, ticker: item.ticker,
                totalAmount: 0, totalInvested: 0, rateSum: 0, items: [],
                asset_type: item.asset_type || 'stock',
                manual_price: item.manual_price
            };
            acc[key].totalAmount   += item.amount;
            acc[key].totalInvested += item.totalCHF;
            acc[key].rateSum       += item.rate;
            acc[key].items.push(item);
            if (item.manual_price != null) acc[key].manual_price = item.manual_price;
            return acc;
        }, {});

        const rows = [];
        let totals = { invested: 0, wert: 0, stockGain: 0, fxGain: 0, totalGain: 0, fees: 0 };

        for (const key in grouped) {
            const g        = grouped[key];
            const currency = g.items[0]?.currency || 'USD';
            const currentFX = getCurrentFxRate(allData, currency);
            const avgBuyRate = currency === 'CHF' ? 1 : (g.rateSum / g.items.length);

            // Aktuellen Preis bestimmen: yfinance > manual_price > Kaufwert
            let currentPrice = 0;
            let priceSource  = 'none';
            if (g.ticker) {
                const tickerData = allData.find(d => d.ticker === g.ticker);
                currentPrice = tickerData?.history?.at(-1)?.price || 0;
                if (currentPrice > 0) priceSource = 'yfinance';
            }
            if (currentPrice === 0 && g.manual_price != null) {
                currentPrice = g.manual_price;
                priceSource  = 'manual';
            }

            const currentVal = currentPrice > 0
                ? g.totalAmount * currentPrice * currentFX
                : g.totalInvested; // Fallback: Kaufwert
            const invested   = g.totalInvested;
            const atBuyRate  = g.totalAmount * currentPrice * avgBuyRate;
            const stockGain  = currentPrice > 0 ? (atBuyRate - invested) : 0;
            const fxGain     = (currentPrice > 0 && currency !== 'CHF') ? (currentVal - atBuyRate) : 0;
            const totalGain  = currentVal - invested;
            const fees       = g.items.reduce((s, it) => s + (it.fees || 0), 0);
            const atype      = g.asset_type || 'stock';

            rows.push({
                name: g.name, ticker: g.ticker || '—', amount: g.totalAmount,
                wert: currentVal, invested, stockGain, fxGain, totalGain, fees,
                asset_type: atype, price_source: priceSource
            });
            totals.invested  += invested;
            totals.wert      += currentVal;
            totals.stockGain += stockGain;
            totals.fxGain    += fxGain;
            totals.totalGain += totalGain;
            totals.fees      += fees;
        }

        const TYPE_BADGE_OV = {
            bond:        '<span class="asset-type-badge badge-bond" style="font-size:9px;padding:1px 6px">Anleihe</span>',
            real_estate: '<span class="asset-type-badge badge-realestate" style="font-size:9px;padding:1px 6px">Immobilien</span>',
            other:       '<span class="asset-type-badge badge-other" style="font-size:9px;padding:1px 6px">Sonstiges</span>',
        };
        const fmtCHF  = v => v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const gainCell = v => `<td class="overview-td num ${v >= 0 ? 'gain-pos' : 'gain-neg'}">${v >= 0 ? '+' : ''}${fmtCHF(v)}</td>`;

        container.innerHTML = `
            <div class="card">
                <div class="card-head"><span class="card-label">Positions-Übersicht</span></div>
                <div style="overflow-x:auto">
                    <table class="overview-table">
                        <thead><tr>
                            <th class="overview-th idx">#</th>
                            <th class="overview-th">Name</th>
                            <th class="overview-th num">Stück</th>
                            <th class="overview-th num">Marktwert CHF</th>
                            <th class="overview-th num">Investiert CHF</th>
                            <th class="overview-th num">Total Gain ${iBtn('total-gain')}</th>
                            <th class="overview-th num">Kursgewinn ${iBtn('stock-gain')}</th>
                            <th class="overview-th num">FX-Gewinn ${iBtn('fx-gain')}</th>
                            <th class="overview-th num">Gebühren</th>
                        </tr></thead>
                        <tbody>
                            ${rows.map((r, i) => {
                                const typeBadge = TYPE_BADGE_OV[r.asset_type] || '';
                                const srcNote   = r.price_source === 'manual'
                                    ? '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-left:4px">manuell</span>'
                                    : r.price_source === 'none'
                                    ? '<span style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-left:4px">Kaufwert</span>'
                                    : '';
                                return `
                            <tr class="overview-row">
                                <td class="overview-td idx">${i + 1}</td>
                                <td class="overview-td">
                                    <span class="ov-name">${r.name}</span>
                                    ${typeBadge}
                                    <span class="ov-ticker">${r.ticker}</span>
                                    ${srcNote}
                                </td>
                                <td class="overview-td num">${r.amount.toFixed(4)}</td>
                                <td class="overview-td num">${fmtCHF(r.wert)}</td>
                                <td class="overview-td num">${fmtCHF(r.invested)}</td>
                                ${gainCell(r.totalGain)}${gainCell(r.stockGain)}${gainCell(r.fxGain)}
                                <td class="overview-td num" style="color:var(--red)">${r.fees > 0 ? '-' + fmtCHF(r.fees) : '—'}</td>
                            </tr>`;}).join('')}
                            <tr class="overview-total-row">
                                <td class="overview-td idx"></td>
                                <td class="overview-td"><span class="ov-name">Total</span></td>
                                <td class="overview-td num">—</td>
                                <td class="overview-td num">${fmtCHF(totals.wert)}</td>
                                <td class="overview-td num">${fmtCHF(totals.invested)}</td>
                                ${gainCell(totals.totalGain)}${gainCell(totals.stockGain)}${gainCell(totals.fxGain)}
                                <td class="overview-td num" style="color:var(--red)">${totals.fees > 0 ? '-' + fmtCHF(totals.fees) : '—'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch (e) {
        container.innerHTML = `<div class="card"><div class="card-body" style="color:var(--red);text-align:center;padding:32px;font-size:12px">Fehler beim Laden der Übersicht</div></div>`;
    }
}

// ─── HEATMAP ─────────────────────────────────────────────

async function loadHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;
    container.innerHTML = `<div class="heatmap-panel"><div class="card-label" style="margin-bottom:8px">Monatsrenditen Heatmap</div><div style="text-align:center;padding:40px;font-family:'DM Mono',monospace;font-size:11px;color:var(--text3)">Lade Daten…</div></div>`;

    const tickers = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) { container.innerHTML = `<div class="heatmap-panel"><p style="color:var(--text3);text-align:center;padding:40px;font-family:'DM Mono',monospace;font-size:11px">Keine Daten verfügbar</p></div>`; return; }

    try {
        const fxTickers = getRequiredFxTickers();
        const allData   = await Promise.all([...tickers, ...fxTickers].map(async t => {
            const res = await fetch(`/get_history?symbol=${t}&period=2y`, { credentials: 'include' });
            const d   = await res.json();
            return { ticker: t, history: Array.isArray(d) ? d : [] };
        }));

        const earliestPurchase = portfolio.reduce((e, item) => { const d = new Date(item.date); return !e || d < e ? d : e; }, null);
        const allDates = [...new Set(allData.flatMap(d => d.history.map(h => h.date)))]
            .filter(dk => !earliestPurchase || new Date(dk) >= earliestPurchase).sort();

        const dailyValues = {};
        allDates.forEach(dk => {
            let value = 0;
            portfolio.forEach(asset => {
                const td = allData.find(d => d.ticker === asset.ticker);
                if (!td) return;
                const pe = td.history.find(h => h.date === dk);
                if (!pe) return;
                value += asset.amount * pe.price * getFxRate(allData, asset.currency || 'USD', dk);
            });
            if (value > 0) {
                const ae = allData[0]?.history.find(h => h.date === dk);
                if (ae) dailyValues[dk] = { date: new Date(ae.full_date || dk), value };
            }
        });

        const monthly = {};
        Object.keys(dailyValues).sort().forEach(dk => {
            const { date, value } = dailyValues[dk];
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (!monthly[key]) monthly[key] = { year: date.getFullYear(), month: date.getMonth(), startValue: value, endValue: value, days: 1 };
            else { monthly[key].endValue = value; monthly[key].days++; }
        });

        const returns = Object.values(monthly).filter(m => m.days >= 1)
            .map(m => ({ year: m.year, month: m.month, return: m.startValue > 0 ? ((m.endValue - m.startValue) / m.startValue * 100) : 0 }));

        const years  = [...new Set(returns.map(r => r.year))].sort((a, b) => b - a);
        const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
        const allR   = returns.map(r => r.return);
        const maxR   = Math.max(...allR, 1), minR = Math.min(...allR, -1);

        function cellStyle(val) {
            if (val > 0) { const i = Math.min(val / maxR, 1); return `background:rgb(${Math.round(220 - i * 100)},${Math.round(200 + i * 55)},${Math.round(220 - i * 100)});color:${i > 0.4 ? '#1a4b1a' : '#2d6a4f'}`; }
            if (val < 0) { const i = Math.min(Math.abs(val) / Math.abs(minR), 1); return `background:rgb(${Math.round(200 + i * 55)},${Math.round(220 - i * 100)},${Math.round(220 - i * 100)});color:${i > 0.4 ? '#5a0a05' : '#c0392b'}`; }
            return `background:var(--surface2);color:var(--text3)`;
        }

        container.innerHTML = `
            <div class="heatmap-panel">
                <div class="card-label" style="margin-bottom:14px">Monatsrenditen Heatmap</div>
                <table class="heatmap-table">
                    <thead><tr><th>Jahr</th>${months.map(m => `<th>${m}</th>`).join('')}</tr></thead>
                    <tbody>${years.map(year => `<tr><td>${year}</td>${Array.from({length: 12}, (_, m) => {
                        const e = returns.find(r => r.year === year && r.month === m);
                        if (!e) return `<td style="background:var(--surface2);color:var(--border2)">—</td>`;
                        return `<td style="${cellStyle(e.return)}">${e.return >= 0 ? '+' : ''}${e.return.toFixed(1)}%</td>`;
                    }).join('')}</tr>`).join('')}</tbody>
                </table>
                <div class="heatmap-legend">
                    <div class="legend-box"><div class="legend-swatch" style="background:rgba(45,106,79,0.6)"></div>Positiv</div>
                    <div class="legend-box"><div class="legend-swatch" style="background:rgba(192,57,43,0.6)"></div>Negativ</div>
                    <div class="legend-box"><div class="legend-swatch" style="background:var(--surface2)"></div>Keine Daten</div>
                </div>
            </div>`;
    } catch (e) {
        container.innerHTML = `<div class="heatmap-panel"><p style="color:var(--red);text-align:center;padding:40px;font-family:'DM Mono',monospace">Fehler beim Laden</p></div>`;
    }
}

// ─── ANALYSE VERGLEICHS-CHART ────────────────────────────

let analysisChart   = null;
let _analysisData   = {};
let _activeSeries   = new Set();
let _showTrendline  = false;

const ANALYSIS_COLORS = ['#5B8DEF','#E07B39','#2ECC71','#9B59B6','#E74C3C','#F1C40F','#1ABC9C','#E91E63','#3498DB','#FF6B35'];

// Zeiträume für Analyse-Chart (erweitert)
const ANALYSIS_PERIODS = [
    ['5d',   '1W'],
    ['1mo',  '1M'],
    ['6mo',  '6M'],
    ['ytd',  'YTD'],
    ['1y',   '1J'],
    ['5y',   '5J'],
];

function _getAnalysisSymbols() {
    const tickers   = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    const fxTickers = getRequiredFxTickers();
    return { tickers, fxTickers, all: [...tickers, ...fxTickers] };
}

function _getAnalysisNames() {
    const names = {};
    portfolio.forEach(p => { if (p.ticker) names[p.ticker] = p.name; });
    getRequiredFxTickers().forEach(f => { names[f] = f.replace('=X', '').replace('CHF', '') + '/CHF'; });
    return names;
}

function toggleTrendline(btn) {
    _showTrendline = !_showTrendline;
    btn.style.background = _showTrendline ? 'var(--accent)' : 'var(--surface2)';
    btn.style.color      = _showTrendline ? 'white'         : 'var(--text2)';
    renderAnalysisChart(_getAnalysisNames());
}

async function loadAnalysisCharts() {
    const container = document.getElementById('analysis-chart-container');
    if (!container) return;
    _showTrendline = false;

    // Standard-Period ist '1y' (Index 4 in ANALYSIS_PERIODS)
    const defaultPeriodIdx = 4;

    container.innerHTML = `
      <div class="card">
        <div class="card-head" style="flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="card-label">Kurs-Vergleich</span>
            <span style="font-size:10px;color:var(--text3)">indexiert, Basis 100</span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center" id="analysis-period-btns">
            ${ANALYSIS_PERIODS.map(([api, label], i) =>
              `<button onclick="reloadAnalysisChart('${api}', this)"
                style="font-size:10px;font-family:var(--mono);padding:4px 10px;border-radius:99px;
                       border:1px solid var(--border);cursor:pointer;transition:all 0.15s;
                       background:${i === defaultPeriodIdx ? 'var(--accent)' : 'var(--surface2)'};
                       color:${i === defaultPeriodIdx ? 'white' : 'var(--text2)'}"
              >${label}</button>`
            ).join('')}
            <button id="trend-toggle-btn" onclick="toggleTrendline(this)"
              style="font-size:10px;font-family:var(--mono);padding:4px 10px;border-radius:99px;
                     border:1px solid var(--border);cursor:pointer;transition:all 0.15s;
                     background:var(--surface2);color:var(--text2);margin-left:4px">
              〜 Trend
            </button>
          </div>
        </div>
        <div class="card-body" style="padding:12px 16px 14px">
          <div id="analysis-checkboxes" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px"></div>
          <div style="position:relative;height:280px">
            <canvas id="analysis-chart-canvas"></canvas>
            <div id="analysis-chart-loader" style="position:absolute;inset:0;display:flex;align-items:center;
                 justify-content:center;font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);
                 background:var(--surface)">Lade Kursdaten…</div>
          </div>
          <div id="analysis-chart-legend" style="display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;
               font-size:11px;font-family:'DM Mono',monospace;color:var(--text2)"></div>
        </div>
      </div>`;

    _activeSeries = new Set();
    await reloadAnalysisChart(ANALYSIS_PERIODS[defaultPeriodIdx][0]);
}

async function reloadAnalysisChart(period, btnEl) {
    if (btnEl) {
        document.querySelectorAll('#analysis-period-btns button:not(#trend-toggle-btn)').forEach(b => {
            b.style.background = 'var(--surface2)'; b.style.color = 'var(--text2)';
        });
        btnEl.style.background = 'var(--accent)'; btnEl.style.color = 'white';
    }

    const loader = document.getElementById('analysis-chart-loader');
    if (loader) loader.style.display = 'flex';

    const { all } = _getAnalysisSymbols();
    const names   = _getAnalysisNames();

    const results = await Promise.all(all.map(async sym => {
        try {
            const res  = await fetch(`/get_history?symbol=${sym}&period=${period}`, { credentials: 'include' });
            const data = await res.json();
            return { symbol: sym, history: Array.isArray(data) ? data : [] };
        } catch { return { symbol: sym, history: [] }; }
    }));

    _analysisData = {};
    results.forEach(r => { _analysisData[r.symbol] = r.history; });

    if (_activeSeries.size === 0) all.forEach(s => { if (_analysisData[s]?.length) _activeSeries.add(s); });

    const cbBox = document.getElementById('analysis-checkboxes');
    if (cbBox) {
        cbBox.innerHTML = all.map((sym, i) => {
            const color   = ANALYSIS_COLORS[i % ANALYSIS_COLORS.length];
            const hasData = (_analysisData[sym]?.length || 0) > 0;
            const checked = _activeSeries.has(sym) && hasData;
            const label   = names[sym] || sym;
            return `
              <label style="display:flex;align-items:center;gap:5px;cursor:${hasData?'pointer':'default'};
                            opacity:${hasData?1:0.35};font-size:11px;font-family:'DM Mono',monospace;
                            color:var(--text2);background:var(--surface2);padding:4px 9px;
                            border-radius:99px;border:1px solid var(--border)">
                <input type="checkbox" ${checked?'checked':''} ${hasData?'':'disabled'}
                  style="accent-color:${color};width:12px;height:12px;cursor:pointer"
                  onchange="toggleAnalysisSeries('${sym}', this.checked)">
                <span style="display:inline-block;width:10px;height:2.5px;border-radius:2px;background:${color}"></span>
                ${label.length > 20 ? label.slice(0,18)+'…' : label}
                ${sym.includes('=X') ? '<span style="font-size:9px;color:var(--text3);margin-left:2px">FX</span>' : ''}
                ${!hasData ? '<span style="font-size:9px;color:var(--text3)"> n/a</span>' : ''}
              </label>`;
        }).join('');
    }

    if (loader) loader.style.display = 'none';
    renderAnalysisChart(names);
}

function toggleAnalysisSeries(sym, active) {
    if (active) _activeSeries.add(sym); else _activeSeries.delete(sym);
    renderAnalysisChart(_getAnalysisNames());
}

function renderAnalysisChart(names) {
    const canvas = document.getElementById('analysis-chart-canvas');
    if (!canvas) return;
    if (analysisChart) { analysisChart.destroy(); analysisChart = null; }

    const { all }      = _getAnalysisSymbols();
    const activeSorted = all.filter(s => _activeSeries.has(s) && _analysisData[s]?.length);
    if (!activeSorted.length) return;

    const dateAxis = activeSorted.map(s => _analysisData[s].map(h => h.date)).sort((a, b) => b.length - a.length)[0];

    const datasets = activeSorted.map(sym => {
        const color   = ANALYSIS_COLORS[all.indexOf(sym) % ANALYSIS_COLORS.length];
        const history = _analysisData[sym];
        const first   = history[0]?.price || 1;
        let lastVal   = null;
        const data    = dateAxis.map(dl => {
            const entry = history.find(h => h.date === dl);
            if (entry?.price != null) lastVal = (entry.price / first) * 100;
            return lastVal;
        });
        return { label: names[sym] || sym, data, borderColor: color, backgroundColor: 'transparent', tension: 0.2, pointRadius: 0, borderWidth: 2 };
    });

    // Trendlinie
    if (_showTrendline && activeSorted.length > 0) {
        const avgData = dateAxis.map((_, idx) => {
            const vals = datasets.map(ds => ds.data[idx]).filter(v => v != null);
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        });
        const validVals = avgData.filter(v => v != null);
        if (validVals.length > 1) {
            const n = validVals.length, xMean = (n - 1) / 2;
            const yMean = validVals.reduce((a, b) => a + b, 0) / n;
            let num = 0, den = 0;
            validVals.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
            const slope = den !== 0 ? num / den : 0;
            const intercept = yMean - slope * xMean;
            let xi = 0;
            datasets.push({
                label: 'Trend', data: avgData.map(v => v == null ? null : slope * xi++ + intercept),
                borderColor: 'var(--text3)', borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0,
            });
        }
    }

    const tickColor2 = getVar('--text3') || '#A8B4CC';
    analysisChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: dateAxis, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { color: 'rgba(128,128,128,0.12)', drawBorder: false }, ticks: { color: tickColor2, font: { family: "'DM Mono', monospace", size: 10 }, maxTicksLimit: 10, maxRotation: 0 } },
                y: { grid: { color: 'rgba(128,128,128,0.12)', drawBorder: false }, ticks: { color: tickColor2, font: { family: "'DM Mono', monospace", size: 10 }, callback: v => v.toFixed(0) } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getTooltipDefaults(),
                    callbacks: { label: ctx => { if (ctx.dataset.label === 'Trend') return null; const v = ctx.parsed.y; if (v == null) return null; return ` ${ctx.dataset.label}: ${(v - 100) >= 0 ? '+' : ''}${(v - 100).toFixed(2)}%`; } }
                }
            }
        }
    });

    const legendEl = document.getElementById('analysis-chart-legend');
    if (legendEl) {
        legendEl.innerHTML = activeSorted.map(sym => {
            const color   = ANALYSIS_COLORS[all.indexOf(sym) % ANALYSIS_COLORS.length];
            const history = _analysisData[sym];
            const first   = history[0]?.price || 1;
            const last    = history.at(-1)?.price || first;
            const pct     = ((last - first) / first * 100);
            return `<span>
                <span style="display:inline-block;width:18px;height:2.5px;border-radius:2px;background:${color};vertical-align:middle;margin-right:4px"></span>
                ${names[sym] || sym} <span style="color:${pct >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:600">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
            </span>`;
        }).join('');
    }
}

// ─── TIME FILTER (Dashboard) ──────────────────────────────

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

function toggleModal(show) { const m = document.getElementById('transaction-modal'); if (!m) return; m.classList.toggle('open', show); if (!show) clearTransactionForm(); }
function handleModalBackdrop(e) { if (e.target === document.getElementById('transaction-modal')) toggleModal(false); }
function toggleEditModal(show) { document.getElementById('edit-modal')?.classList.toggle('open', show); }
function handleEditModalBackdrop(e) { if (e.target === document.getElementById('edit-modal')) toggleEditModal(false); }

function clearTransactionForm() {
    ['asset-name','isin','ticker','amount','price','exchange-rate','purchase-date','fee-stamp','fee-other','manual-price']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const curr = document.getElementById('currency');
    if (curr) { curr.value = 'USD'; updateCurrencyFields(); }
    const type = document.getElementById('asset-type');
    if (type) { type.value = 'stock'; updateAssetTypeFields(); }
    const preview = document.getElementById('transaction-preview');
    if (preview) preview.style.display = 'none';
}

// Asset-Typ Felder ein-/ausblenden
function updateAssetTypeFields() {
    const type        = document.getElementById('asset-type')?.value || 'stock';
    const tickerField = document.getElementById('ticker-field');
    const manualField = document.getElementById('manual-price-field');
    // Bei Anleihen/Immobilien/Sonstiges: Ticker ausblenden, manueller Kurs einblenden
    const noTicker = ['bond', 'real_estate', 'other'].includes(type);
    if (tickerField) tickerField.style.display = noTicker ? 'none' : '';
    if (manualField) manualField.style.display  = noTicker ? 'flex' : 'none';
    if (noTicker) {
        const tickerEl = document.getElementById('ticker');
        if (tickerEl) tickerEl.value = '';
    }
}

function updateEditAssetTypeFields() {
    const type        = document.getElementById('edit-asset-type')?.value || 'stock';
    const manualField = document.getElementById('edit-manual-price-field');
    // Manueller Kurs immer sichtbar im Edit (auch für Aktien kann man überschreiben)
    if (manualField) manualField.style.display = 'flex';
}

function setupTransactionPreview() {
    ['amount','price','exchange-rate'].forEach(id => { document.getElementById(id)?.addEventListener('input', updateTransactionPreview); });
}

function updateTransactionPreview() {
    const currency = document.getElementById('currency')?.value || 'USD';
    const amount   = parseFloat(document.getElementById('amount')?.value) || 0;
    const price    = parseFloat(document.getElementById('price')?.value) || 0;
    const rate     = currency === 'CHF' ? 1 : (parseFloat(document.getElementById('exchange-rate')?.value) || 0);
    const preview  = document.getElementById('transaction-preview');
    const total    = document.getElementById('preview-total');
    if (!preview || !total) return;
    if (amount > 0 && price > 0 && (currency === 'CHF' || rate > 0)) {
        total.textContent = (amount * price * (currency === 'CHF' ? 1 : rate)).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        preview.style.display = 'flex';
    } else { preview.style.display = 'none'; }
}

function updateCurrencyFields() {
    const currency  = document.getElementById('currency')?.value;
    const rateField = document.getElementById('rate-field');
    if (document.getElementById('price-label')) document.getElementById('price-label').textContent = `Kurs (${currency})`;
    if (document.getElementById('rate-label'))  document.getElementById('rate-label').textContent  = `Wechselkurs (${currency}/CHF)`;
    if (rateField) rateField.style.display = currency === 'CHF' ? 'none' : 'flex';
}

function updateEditCurrencyFields() {
    const currency  = document.getElementById('edit-currency')?.value;
    const rateField = document.getElementById('edit-rate-field');
    if (document.getElementById('edit-price-label')) document.getElementById('edit-price-label').textContent = `Kaufkurs (${currency})`;
    if (document.getElementById('edit-rate-label'))  document.getElementById('edit-rate-label').textContent  = `Wechselkurs (${currency}/CHF)`;
    if (rateField) rateField.style.display = currency === 'CHF' ? 'none' : 'flex';
}

// Asset-Typ Label
const ASSET_TYPE_LABELS = {
    stock: 'Aktie/ETF', bond: 'Anleihe',
    real_estate: 'Immobilien', other: 'Sonstiges'
};

// ─── CRUD ────────────────────────────────────────────────

async function calculate() {
    const name        = document.getElementById('asset-name')?.value?.trim();
    const isin        = document.getElementById('isin')?.value?.trim().toUpperCase();
    const assetType   = document.getElementById('asset-type')?.value || 'stock';
    const noTicker    = ['bond', 'real_estate', 'other'].includes(assetType);
    const ticker      = noTicker ? '' : (document.getElementById('ticker')?.value?.trim().toUpperCase() || '');
    const currency    = document.getElementById('currency')?.value || 'USD';
    const amount      = parseFloat(document.getElementById('amount')?.value);
    const price       = parseFloat(document.getElementById('price')?.value);
    const rate        = currency === 'CHF' ? 1 : (parseFloat(document.getElementById('exchange-rate')?.value) || 0);
    const date        = document.getElementById('purchase-date')?.value;
    const feeStamp    = parseFloat(document.getElementById('fee-stamp')?.value) || 0;
    const feeOther    = parseFloat(document.getElementById('fee-other')?.value) || 0;
    const manualPrice = noTicker ? (parseFloat(document.getElementById('manual-price')?.value) || null) : null;

    if (!name || !isin || isNaN(amount) || amount <= 0) { alert('Bitte Name, ISIN und Anzahl angeben.'); return; }

    const totalCHF = amount * (isNaN(price) ? 0 : price) * (currency === 'CHF' ? 1 : rate);

    try {
        const res = await fetch('/api/portfolio', { credentials: 'include', method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, isin, amount, currency,
                priceUSD: isNaN(price) ? 0 : price,
                rate, date, totalCHF,
                ticker,
                fee_stamp: feeStamp, fee_other: feeOther,
                asset_type: assetType,
                manual_price: manualPrice
            })
        });
        if (!res.ok) throw new Error();
        await loadDataFromServer(); renderPortfolio(); toggleModal(false);
    } catch (e) { alert('Fehler beim Speichern.'); }
}

async function deleteBuy(dbId) {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return;
    try {
        await fetch(`/api/portfolio/${dbId}`, { method: 'DELETE', credentials: 'include' });
        await loadDataFromServer(); renderPortfolio();
    } catch (e) { alert('Fehler beim Löschen.'); }
}

function openEditModal(dbId) {
    const item = portfolio.find(p => p.id === dbId);
    if (!item) return;
    document.getElementById('edit-id').value           = dbId;
    document.getElementById('edit-asset-name').value   = item.name        || '';
    document.getElementById('edit-isin').value          = item.isin        || '';
    document.getElementById('edit-ticker').value        = item.ticker      || '';
    document.getElementById('edit-currency').value      = item.currency    || 'USD';
    document.getElementById('edit-amount').value        = item.amount      || '';
    document.getElementById('edit-price').value         = item.priceUSD    || '';
    document.getElementById('edit-rate').value          = item.rate        || '';
    document.getElementById('edit-date').value          = item.date        || '';
    document.getElementById('edit-fee-stamp').value     = item.fee_stamp   || '';
    document.getElementById('edit-fee-other').value     = item.fee_other   || '';
    document.getElementById('edit-asset-type').value    = item.asset_type  || 'stock';
    document.getElementById('edit-manual-price').value  = item.manual_price != null ? item.manual_price : '';
    updateEditCurrencyFields();
    updateEditAssetTypeFields();
    toggleEditModal(true);
}

async function saveEdit() {
    const dbId        = parseInt(document.getElementById('edit-id')?.value);
    const item        = portfolio.find(p => p.id === dbId);
    if (!item) return;
    const name        = document.getElementById('edit-asset-name')?.value?.trim();
    const isin        = document.getElementById('edit-isin')?.value?.trim().toUpperCase();
    const ticker      = document.getElementById('edit-ticker')?.value?.trim().toUpperCase();
    const currency    = document.getElementById('edit-currency')?.value || 'USD';
    const amount      = parseFloat(document.getElementById('edit-amount')?.value);
    const price       = parseFloat(document.getElementById('edit-price')?.value) || 0;
    const rate        = currency === 'CHF' ? 1 : (parseFloat(document.getElementById('edit-rate')?.value) || 1);
    const date        = document.getElementById('edit-date')?.value;
    const feeStamp    = parseFloat(document.getElementById('edit-fee-stamp')?.value) || 0;
    const feeOther    = parseFloat(document.getElementById('edit-fee-other')?.value) || 0;
    const assetType   = document.getElementById('edit-asset-type')?.value || 'stock';
    const manualRaw   = document.getElementById('edit-manual-price')?.value;
    const manualPrice = manualRaw !== '' ? (parseFloat(manualRaw) || null) : null;

    try {
        await fetch(`/api/portfolio/${dbId}`, { credentials: 'include', method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...item, name, isin, ticker, currency, amount,
                priceUSD: price, rate, date,
                totalCHF: amount * price * rate,
                fee_stamp: feeStamp, fee_other: feeOther,
                asset_type: assetType,
                manual_price: manualPrice
            })
        });
        await loadDataFromServer(); renderPortfolio(); toggleEditModal(false);
    } catch (e) { alert('Fehler beim Speichern.'); }
}

// Nur den manuellen Kurs aktualisieren (ohne den Rest zu überschreiben)
async function updateManualPriceOnly() {
    const dbId  = parseInt(document.getElementById('edit-id')?.value);
    const price = parseFloat(document.getElementById('edit-manual-price')?.value);
    if (!dbId || isNaN(price) || price <= 0) { alert('Bitte einen gültigen Kurs eingeben.'); return; }
    try {
        await fetch(`/api/portfolio/${dbId}/price`, { credentials: 'include', method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manual_price: price })
        });
        // Local update ohne Server-Reload
        portfolio.forEach(p => { if (p.id === dbId) p.manual_price = price; });
        renderPortfolio();
        // Kleines visuelles Feedback
        const btn = document.querySelector('#edit-modal [onclick="updateManualPriceOnly()"]');
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = '✓ Gespeichert';
            btn.style.background = 'var(--green)';
            setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1800);
        }
    } catch (e) { alert('Fehler beim Speichern.'); }
}

// ─── TICKER SEARCH ───────────────────────────────────────

let _searchTimer = null;
function searchTicker(val) {
    clearTimeout(_searchTimer);
    const dropdown = document.getElementById('ticker-dropdown');
    if (!dropdown) return;
    if (!val || val.length < 2) { dropdown.style.display = 'none'; return; }
    dropdown.style.display = 'block';
    dropdown.innerHTML = `<div class="ticker-loading">Suche…</div>`;
    _searchTimer = setTimeout(async () => {
        try {
            const res  = await fetch(`/api/search_ticker?q=${encodeURIComponent(val)}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.length) { dropdown.innerHTML = `<div class="ticker-loading">Keine Ergebnisse</div>`; return; }
            dropdown.innerHTML = data.map(t => `
                <div class="ticker-item" onclick="selectTicker('${t.symbol}','${t.name.replace(/'/g,"\\'")}','${t.isin||''}')">
                    <span class="ticker-symbol">${t.symbol}</span>
                    <span class="ticker-name">${t.name}</span>
                    <span class="ticker-exch">${t.exchange}</span>
                </div>`).join('');
        } catch { dropdown.innerHTML = `<div class="ticker-loading">Fehler bei der Suche</div>`; }
    }, 300);
}

function selectTicker(symbol, name, isin) {
    const tickerEl = document.getElementById('ticker');
    const nameEl   = document.getElementById('asset-name');
    const isinEl   = document.getElementById('isin');
    const dropdown = document.getElementById('ticker-dropdown');
    if (tickerEl) tickerEl.value = symbol;
    if (nameEl && !nameEl.value) nameEl.value = name;
    if (isinEl && !isinEl.value && isin) isinEl.value = isin;
    if (dropdown) dropdown.style.display = 'none';
}

document.addEventListener('click', e => {
    if (!e.target.closest('#ticker') && !e.target.closest('#ticker-dropdown')) {
        const dd = document.getElementById('ticker-dropdown');
        if (dd) dd.style.display = 'none';
    }
});

// ─── CASH ────────────────────────────────────────────────

async function editCash() {
    const n = prompt('Cash-Bestand in CHF:', cashBalance);
    if (n === null) return;
    cashBalance = parseFloat(n) || 0;
    try {
        await fetch('/api/cash', { credentials: 'include', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance: cashBalance }) });
        renderPortfolio();
    } catch (e) { alert('Fehler beim Speichern.'); }
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

// ─── REBALANCING ──────────────────────────────────────────

let _targets       = [];   // [{isin, name, target_pct}]
let _rebChart      = null;
let _currentPrices = {};   // {isin: currentValueCHF}

async function loadRebalancingPage() {
    // Ziel-Allokationen laden
    try {
        const res = await fetch('/api/targets', { credentials: 'include' });
        _targets = await res.json();
    } catch(e) { _targets = []; }

    renderTargetEditor();
    await computeAndRenderRebalancing();
}

function renderTargetEditor() {
    const container = document.getElementById('target-editor');
    if (!container) return;

    // Alle einzigartigen Positionen aus Portfolio
    const positions = Object.values(portfolio.reduce((acc, item) => {
        const key = item.isin || item.name;
        if (!acc[key]) acc[key] = { name: item.name, isin: item.isin || item.name };
        return acc;
    }, {}));

    if (!positions.length) {
        container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px;font-family:'DM Mono',monospace">Keine Positionen vorhanden</div>`;
        return;
    }

    container.innerHTML = positions.map(pos => {
        const existing = _targets.find(t => t.isin === pos.isin);
        const pct      = existing ? existing.target_pct : 0;
        return `
            <div class="target-row" data-isin="${pos.isin}">
                <div style="flex:1;min-width:140px">
                    <div class="target-name">${pos.name}</div>
                    <span class="target-isin">${pos.isin}</span>
                </div>
                <div class="target-bar-wrap">
                    <div class="target-bar-fill" id="bar-${pos.isin.replace(/\./g,'_')}" style="width:${pct}%"></div>
                </div>
                <div class="target-input-wrap">
                    <input type="number" class="target-input" min="0" max="100" step="0.1"
                        value="${pct}" data-isin="${pos.isin}" data-name="${pos.name}"
                        oninput="onTargetInput(this)">
                    <span class="target-pct-label">%</span>
                </div>
            </div>`;
    }).join('');

    updateTargetSum();
}

function onTargetInput(input) {
    const val   = Math.max(0, Math.min(100, parseFloat(input.value) || 0));
    const isin  = input.dataset.isin;
    const barId = 'bar-' + isin.replace(/\./g,'_');
    const bar   = document.getElementById(barId);
    if (bar) bar.style.width = val + '%';
    updateTargetSum();
}

function updateTargetSum() {
    const inputs = document.querySelectorAll('.target-input');
    const total  = [...inputs].reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
    const el     = document.getElementById('target-sum-display');
    if (!el) return;
    const rounded = Math.round(total * 10) / 10;
    el.textContent = `Total: ${rounded}%`;
    el.style.color = Math.abs(rounded - 100) < 0.1 ? 'var(--green)' : rounded > 100 ? 'var(--red)' : 'var(--text3)';
}

async function saveTargets() {
    const inputs = document.querySelectorAll('.target-input');
    const data   = [...inputs].map(el => ({
        isin:       el.dataset.isin,
        name:       el.dataset.name,
        target_pct: parseFloat(el.value) || 0
    })).filter(d => d.target_pct > 0);

    const total = data.reduce((s, d) => s + d.target_pct, 0);
    if (Math.abs(total - 100) > 0.5 && total > 0) {
        alert(`Total ist ${total.toFixed(1)}% — muss 100% ergeben.`);
        return;
    }

    try {
        await fetch('/api/targets', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        _targets = data;
        await computeAndRenderRebalancing();
    } catch(e) { alert('Fehler beim Speichern.'); }
}

async function computeAndRenderRebalancing() {
    if (!_targets.length) {
        renderRebalancingEmpty();
        return;
    }

    // Aktuelle Marktwerte via yfinance holen
    const tickers    = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    const fxTickers  = getRequiredFxTickers();
    const allTickers = [...tickers, ...fxTickers];

    let allData = [];
    try {
        allData = await Promise.all(allTickers.map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=5d`, { credentials: 'include' });
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));
    } catch(e) {}

    // Aktuelle Werte pro ISIN berechnen
    const grouped = portfolio.reduce((acc, item) => {
        const key = item.isin || item.name;
        if (!acc[key]) acc[key] = { name: item.name, isin: item.isin || item.name, ticker: item.ticker, totalAmount: 0, totalInvested: 0, items: [] };
        acc[key].totalAmount   += item.amount;
        acc[key].totalInvested += item.totalCHF;
        acc[key].items.push(item);
        return acc;
    }, {});

    let totalCurrentCHF = 0;
    const positionValues = {};

    for (const key in grouped) {
        const g          = grouped[key];
        const tickerData = allData.find(d => d.ticker === g.ticker);
        const price      = tickerData?.history?.at(-1)?.price || 0;
        const currency   = g.items[0]?.currency || 'USD';
        const fx         = getCurrentFxRate(allData, currency);
        const valueCHF   = g.totalAmount * price * fx || g.totalInvested;
        positionValues[g.isin] = { name: g.name, isin: g.isin, valueCHF, ticker: g.ticker };
        totalCurrentCHF += valueCHF;
    }

    // Cash dazurechnen
    totalCurrentCHF += cashBalance;

    // Rebalancing berechnen
    const rows = _targets.map(t => {
        const pos        = positionValues[t.isin] || { valueCHF: 0, name: t.name };
        const istCHF     = pos.valueCHF;
        const istPct     = totalCurrentCHF > 0 ? (istCHF / totalCurrentCHF * 100) : 0;
        const sollCHF    = totalCurrentCHF * t.target_pct / 100;
        const diffCHF    = sollCHF - istCHF;
        const diffPct    = istPct - t.target_pct;
        return { name: t.name, isin: t.isin, istCHF, istPct, sollCHF, sollPct: t.target_pct, diffCHF, diffPct };
    });

    renderRebalancingChart(rows);
    renderRebalancingTable(rows, totalCurrentCHF);
}

function renderRebalancingEmpty() {
    const tbl = document.getElementById('rebalancing-table');
    if (tbl) tbl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3);font-size:12px;font-family:'DM Mono',monospace">Bitte zuerst Ziel-Allokation definieren und speichern.</div>`;
    if (_rebChart) { _rebChart.destroy(); _rebChart = null; }
}

function renderRebalancingChart(rows) {
    const canvas = document.getElementById('rebalancing-chart');
    if (!canvas) return;
    if (_rebChart) { _rebChart.destroy(); _rebChart = null; }

    const labels  = rows.map(r => r.name.length > 16 ? r.name.slice(0,14)+'…' : r.name);
    const istData = rows.map(r => Math.round(r.istPct * 10) / 10);
    const solData = rows.map(r => r.sollPct);
    const tickColor = getVar('--text3') || '#A8B4CC';
    const tt        = getTooltipDefaults();

    _rebChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Ist %',  data: istData, backgroundColor: getVar('--accent')     || '#5B8DEF', borderRadius: 4, barPercentage: 0.4 },
                { label: 'Soll %', data: solData, backgroundColor: getVar('--accent-soft') || '#A9C9FF', borderRadius: 4, barPercentage: 0.4 },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false }, ticks: { color: tickColor, font: { family: "'DM Mono', monospace", size: 10 } } },
                y: { grid: { color: 'rgba(128,128,128,0.12)', drawBorder: false }, ticks: { color: tickColor, font: { family: "'DM Mono', monospace", size: 10 }, callback: v => v + '%' } }
            },
            plugins: {
                legend: { labels: { color: getVar('--text2'), font: { family: "'DM Mono', monospace", size: 11 }, boxWidth: 12, padding: 16 } },
                tooltip: { ...tt, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } }
            }
        }
    });
}

function renderRebalancingTable(rows, totalCHF) {
    const container = document.getElementById('rebalancing-table');
    if (!container) return;

    const fmtCHF = v => v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    const bodyRows = rows.map(r => {
        const action = Math.abs(r.diffCHF) < 10
            ? `<span class="reb-badge reb-ok">✓ OK</span>`
            : r.diffCHF > 0
                ? `<span class="reb-badge reb-buy">↑ Kaufen</span>`
                : `<span class="reb-badge reb-sell">↓ Verkaufen</span>`;

        const diffColor = Math.abs(r.diffCHF) < 10 ? 'var(--text3)' : r.diffCHF > 0 ? 'var(--green)' : 'var(--red)';
        const sign      = r.diffCHF >= 0 ? '+' : '';

        return `<tr class="reb-row">
            <td class="reb-td"><strong style="color:var(--text);font-family:var(--body)">${r.name}</strong><br><span style="font-size:10px;color:var(--text3)">${r.isin}</span></td>
            <td class="reb-td num">${fmtCHF(r.istCHF)}</td>
            <td class="reb-td num">${r.istPct.toFixed(1)}%</td>
            <td class="reb-td num">${r.sollPct.toFixed(1)}%</td>
            <td class="reb-td num" style="color:${diffColor};font-weight:600">${sign}${fmtCHF(r.diffCHF)}</td>
            <td class="reb-td num" style="color:${diffColor}">${sign}${r.diffPct.toFixed(1) * -1}%</td>
            <td class="reb-td">${action}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="reb-table">
            <thead><tr>
                <th class="reb-th">Position</th>
                <th class="reb-th num">Ist (CHF)</th>
                <th class="reb-th num">Ist %</th>
                <th class="reb-th num">Soll %</th>
                <th class="reb-th num">Differenz CHF</th>
                <th class="reb-th num">Differenz %</th>
                <th class="reb-th">Aktion</th>
            </tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>`;
}

// ─── EXPORT ───────────────────────────────────────────────

function getAuthToken() {
    // Token aus den gespeicherten Profilen holen
    try {
        const profiles = JSON.parse(localStorage.getItem('dario_profiles') || '[]');
        const current  = profiles.find(p => p.userId === window._currentUserId);
        return current?.token || null;
    } catch { return null; }
}

function exportCSV() {
    const token = getAuthToken();
    window.location.href = '/api/export/csv' + (token ? `?token=${token}` : '');
}

function exportPDF() {
    const token = getAuthToken();
    window.location.href = '/api/export/pdf' + (token ? `?token=${token}` : '');
}

// ─── CSV IMPORT ──────────────────────────────────────────

let _importRows = [];   // Parsed rows ready to send

function openImportModal() {
    document.getElementById('import-modal').classList.add('open');
    resetImport();
    if (window.innerWidth <= 768) closeMobileSidebar();
}

function closeImportModal() {
    document.getElementById('import-modal').classList.remove('open');
    resetImport();
}

function resetImport() {
    _importRows = [];
    document.getElementById('import-step-1').style.display = '';
    document.getElementById('import-step-2').style.display = 'none';
    document.getElementById('import-step-3').style.display = 'none';
    document.getElementById('import-file-error').style.display = 'none';
    document.getElementById('import-file-input').value = '';
    document.getElementById('import-dropzone').style.borderColor = '';
}

function handleImportDrop(e) {
    e.preventDefault();
    document.getElementById('import-dropzone').style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
}

function handleImportFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(csv|txt)$/i)) {
        showImportError('Bitte eine .csv oder .txt Datei auswählen.');
        return;
    }
    const reader = new FileReader();
    reader.onload = e => parseImportCSV(e.target.result);
    reader.onerror = () => showImportError('Datei konnte nicht gelesen werden.');
    reader.readAsText(file, 'UTF-8');
}

function showImportError(msg) {
    const el = document.getElementById('import-file-error');
    el.textContent = msg;
    el.style.display = 'block';
}

// Column name aliases — maps various header names → our internal key
const COL_MAP = {
    // Our own export format
    'datum':               'date',
    'name':                'name',
    'isin':                'isin',
    'ticker':              'ticker',
    'währung':             'currency',
    'waehrung':            'currency',
    'currency':            'currency',
    'anzahl':              'amount',
    'amount':              'amount',
    'kurs':                'priceUSD',
    'preis':               'priceUSD',
    'price':               'priceUSD',
    'priceusd':            'priceUSD',
    'wechselkurs':         'rate',
    'rate':                'rate',
    'exchange rate':       'rate',
    'total chf':           'totalCHF',
    'totalchf':            'totalCHF',
    'total':               'totalCHF',
    'stempelsteuer chf':   'fee_stamp',
    'stempelsteuer':       'fee_stamp',
    'fee_stamp':           'fee_stamp',
    'sonstige kosten chf': 'fee_other',
    'sonstige kosten':     'fee_other',
    'fee_other':           'fee_other',
    'fees':                'fee_other',
    'asset-typ':           'asset_type',
    'asset_type':          'asset_type',
    'assettyp':            'asset_type',
    'typ':                 'asset_type',
    'manueller kurs':      'manual_price',
    'manual_price':        'manual_price',
    'manuellerkurs':       'manual_price',
};

function parseImportCSV(text) {
    // Detect delimiter: ; or ,
    const firstLine = text.split('\n')[0];
    const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { showImportError('CSV hat zu wenige Zeilen.'); return; }

    // Parse header
    const headers = lines[0].split(delim).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const colIdx  = {};
    headers.forEach((h, i) => {
        const mapped = COL_MAP[h];
        if (mapped) colIdx[mapped] = i;
    });

    const required = ['name', 'isin'];
    const missing  = required.filter(k => colIdx[k] === undefined);
    if (missing.length) {
        showImportError(`Pflicht-Spalten fehlen: ${missing.join(', ')}. Erste Zeile der CSV: "${lines[0]}"`);
        return;
    }

    const warnings = [];
    _importRows = [];

    for (let li = 1; li < lines.length; li++) {
        const line = lines[li];
        if (!line.trim()) continue;

        // Respect quoted fields
        const cells = splitCSVLine(line, delim);

        const get = key => {
            const idx = colIdx[key];
            return idx !== undefined ? (cells[idx] || '').trim().replace(/^["']|["']$/g, '') : '';
        };

        const name   = get('name');
        const isin   = get('isin').toUpperCase();
        if (!name || !isin) { warnings.push(`Zeile ${li+1}: Name oder ISIN leer — übersprungen`); continue; }

        const amount   = parseFloat(get('amount'))   || 0;
        const priceUSD = parseFloat(get('priceUSD')) || 0;
        const rate     = parseFloat(get('rate'))     || (get('currency').toUpperCase() === 'CHF' ? 1 : 1);
        let   totalCHF = parseFloat(get('totalCHF')) || 0;
        if (totalCHF === 0 && amount > 0 && priceUSD > 0) totalCHF = amount * priceUSD * rate;

        const assetType = get('asset_type') || 'stock';
        const manualRaw = get('manual_price');
        const manualPrice = manualRaw !== '' ? (parseFloat(manualRaw) || null) : null;

        _importRows.push({
            name, isin,
            ticker:    get('ticker').toUpperCase(),
            currency:  get('currency').toUpperCase() || 'CHF',
            amount, priceUSD, rate, totalCHF,
            date:      get('date'),
            fee_stamp: parseFloat(get('fee_stamp')) || 0,
            fee_other: parseFloat(get('fee_other')) || 0,
            asset_type: assetType,
            manual_price: manualPrice,
        });
    }

    if (!_importRows.length) { showImportError('Keine gültigen Zeilen gefunden.'); return; }

    showImportPreview(warnings);
}

function splitCSVLine(line, delim) {
    const result = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && !inQuote) { inQuote = true; }
        else if (ch === '"' && inQuote) { inQuote = false; }
        else if (ch === delim && !inQuote) { result.push(cur); cur = ''; }
        else { cur += ch; }
    }
    result.push(cur);
    return result;
}

function showImportPreview(warnings) {
    document.getElementById('import-step-1').style.display = 'none';
    document.getElementById('import-step-2').style.display = '';

    document.getElementById('import-preview-count').textContent =
        `${_importRows.length} Transaktion${_importRows.length !== 1 ? 'en' : ''} erkannt`;

    // Warn box
    const warnEl = document.getElementById('import-warn');
    if (warnings.length) {
        warnEl.style.display = '';
        warnEl.innerHTML = warnings.map(w => `<div>⚠ ${w}</div>`).join('');
    } else {
        warnEl.style.display = 'none';
    }

    // Preview table (max 5 rows)
    const preview = _importRows.slice(0, 5);
    const cols    = ['date', 'name', 'isin', 'ticker', 'currency', 'amount', 'priceUSD', 'asset_type'];
    const labels  = ['Datum', 'Name', 'ISIN', 'Ticker', 'Währung', 'Anzahl', 'Kurs', 'Typ'];

    const thead = `<thead><tr>${labels.map(l =>
        `<th style="padding:7px 10px;font-size:10px;font-weight:600;color:var(--text3);
                    letter-spacing:0.04em;text-transform:uppercase;border-bottom:1px solid var(--border);
                    white-space:nowrap;background:var(--surface2)">${l}</th>`
    ).join('')}</tr></thead>`;

    const tbody = `<tbody>${preview.map(r =>
        `<tr>${cols.map(c =>
            `<td style="padding:7px 10px;font-family:var(--mono);font-size:11px;
                        color:var(--text2);border-bottom:1px solid var(--border);
                        white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis">
                ${r[c] != null && r[c] !== '' ? r[c] : '<span style="color:var(--text3)">—</span>'}
             </td>`
        ).join('')}</tr>`
    ).join('')}${_importRows.length > 5
        ? `<tr><td colspan="${cols.length}" style="padding:8px 10px;font-size:11px;color:var(--text3);text-align:center;font-family:var(--mono)">
               … und ${_importRows.length - 5} weitere
           </td></tr>` : ''
    }</tbody>`;

    document.getElementById('import-preview-table').innerHTML = thead + tbody;
}

async function confirmImport() {
    if (!_importRows.length) return;
    const btn = document.getElementById('import-confirm-btn');
    btn.textContent = 'Importiere…';
    btn.disabled    = true;

    try {
        const res  = await fetch('/api/import/csv', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: _importRows })
        });
        const data = await res.json();

        document.getElementById('import-step-2').style.display = 'none';
        document.getElementById('import-step-3').style.display = '';

        if (data.imported > 0) {
            document.getElementById('import-result-icon').textContent = '✓';
            document.getElementById('import-result-text').textContent =
                `${data.imported} Transaktion${data.imported !== 1 ? 'en' : ''} erfolgreich importiert${data.skipped ? `, ${data.skipped} übersprungen` : ''}.`;
            document.getElementById('import-result-text').style.color = 'var(--green)';
            // Reload portfolio data
            await loadDataFromServer();
            renderPortfolio();
        } else {
            document.getElementById('import-result-icon').textContent = '⚠';
            document.getElementById('import-result-text').textContent = 'Keine Transaktionen importiert.';
            document.getElementById('import-result-text').style.color = 'var(--red)';
        }

        if (data.errors?.length) {
            document.getElementById('import-result-errors').innerHTML =
                data.errors.map(e => `<div style="margin-bottom:3px">• ${e}</div>`).join('');
        }
    } catch(e) {
        btn.textContent = 'Importieren';
        btn.disabled    = false;
        alert('Fehler beim Import: ' + e.message);
    }
}