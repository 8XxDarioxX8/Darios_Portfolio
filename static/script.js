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

const CHART_COLORS = ['#A9C9FF', '#B8A9FF', '#FFD6A9', '#A9F2D4', '#F2A9D4', '#A9EEF2'];

let portfolio       = [];
let cashBalance     = 0;
let myDonutChart    = null;
let myLineChart     = null;
let currentPerfData = null;


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
    'total-gain':  'Total Gain: Aktueller Wert minus Kaufpreis in CHF (inkl. Kurs- und Währungseffekt).',
};

let tooltipEl = null;

function initTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'info-tooltip';
    document.body.appendChild(tooltipEl);
}

function showTooltip(e, key) {
    if (!tooltipEl) initTooltip();
    const text = TOOLTIPS[key];
    if (!text) return;
    tooltipEl.textContent = text;
    tooltipEl.classList.add('visible');
    positionTooltip(e);
}

function positionTooltip(e) {
    if (!tooltipEl) return;
    const x = e.clientX + 12;
    const y = e.clientY - 8;
    const w = tooltipEl.offsetWidth || 240;
    const h = tooltipEl.offsetHeight || 60;
    tooltipEl.style.left = (x + w > window.innerWidth ? x - w - 20 : x) + 'px';
    tooltipEl.style.top  = (y + h > window.innerHeight ? y - h : y) + 'px';
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
}

function iBtn(key) {
    return `<span class="info-btn" onmouseenter="showTooltip(event,'${key}')" onmousemove="positionTooltip(event)" onmouseleave="hideTooltip()">i</span>`;
}

// ─── MULTI-PROFILE ───────────────────────────────────────

const PROFILES_KEY = 'dario_profiles';

function getProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); }
    catch { return []; }
}

function saveProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function addProfile(username, token, userId) {
    const profiles = getProfiles();
    // Kein Duplikat
    if (!profiles.find(p => p.userId === userId)) {
        profiles.push({ username, token, userId });
        saveProfiles(profiles);
    }
    renderProfileStrip();
}

function removeProfile(userId) {
    const profiles = getProfiles().filter(p => p.userId !== userId);
    saveProfiles(profiles);
    renderProfileStrip();
}

function renderProfileStrip() {
    const strip = document.getElementById('profile-strip');
    if (!strip) return;
    const profiles = getProfiles();
    if (profiles.length <= 1) { strip.innerHTML = ''; return; }

    const currentId = window._currentUserId;
    strip.innerHTML = profiles.map(p => {
        const initials = p.username.slice(0, 2).toUpperCase();
        const isActive = p.userId === currentId;
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
    const profile = profiles.find(p => p.userId === userId);
    if (!profile) return;
    try {
        const res = await fetch('/api/token-login', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: profile.token })
        });
        if (!res.ok) {
            // Token abgelaufen — Profil entfernen
            removeProfile(userId);
            alert(`Session für "${profile.username}" abgelaufen. Bitte erneut einloggen.`);
            return;
        }
        const data = await res.json();
        window._currentUserId = userId;
        // UI updaten
        const el = document.getElementById('user-avatar');
        const nm = document.getElementById('user-name');
        if (el) el.textContent = data.username.slice(0, 2).toUpperCase();
        if (nm) nm.textContent = data.username;
        renderProfileStrip();
        // Daten neu laden
        await loadDataFromServer();
        renderPortfolio();
        showPage('page-dashboard');
    } catch(e) {
        alert('Fehler beim Profilwechsel.');
    }
}

function openProfileModal() {
    const overlay = document.getElementById('profile-modal-overlay');
    if (overlay) {
        overlay.classList.add('open');
        document.getElementById('profile-login-user')?.focus();
        document.getElementById('profile-login-error').textContent = '';
    }
}

function closeProfileModal() {
    document.getElementById('profile-modal-overlay')?.classList.remove('open');
    ['profile-login-user','profile-login-pass'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function profileLogin() {
    const username = document.getElementById('profile-login-user')?.value?.trim().toLowerCase();
    const password = document.getElementById('profile-login-pass')?.value;
    const errEl    = document.getElementById('profile-login-error');
    if (!username || !password) { errEl.textContent = 'Bitte alle Felder ausfüllen.'; return; }

    try {
        const res = await fetch('/api/login', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Fehler beim Login.'; return; }

        addProfile(data.username, data.token, data.user_id);
        closeProfileModal();
        // Sofort zu neuem Profil wechseln? Nein — nur hinzufügen
        // Kleines Feedback
        const strip = document.getElementById('profile-strip');
        if (strip) {
            strip.style.background = 'var(--accent-bg)';
            setTimeout(() => strip.style.background = '', 600);
        }
    } catch(e) {
        document.getElementById('profile-login-error').textContent = 'Verbindungsfehler.';
    }
}

// ─── INIT ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // Auth-Check
    try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = '/login.html'; return; }
        const user = await res.json();
        const initials = user.username.slice(0, 2).toUpperCase();
        const el = document.getElementById('user-avatar');
        const nm = document.getElementById('user-name');
        if (el) el.textContent = initials;
        if (nm) nm.textContent = user.username;
        window._currentUserId = user.user_id;
    } catch (e) {
        window.location.href = '/login.html';
        return;
    }

    setGreeting();
    renderProfileStrip();
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
            fetch('/api/portfolio', { credentials: 'include' }),
            fetch('/api/cash', { credentials: 'include' })
        ]);
        portfolio   = await portRes.json();
        const cd    = await cashRes.json();
        cashBalance = cd.balance || 0;
    } catch (e) {
        console.error('Fehler beim Laden:', e);
    }
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
    } catch (e) {
        alert('Fehler beim Löschen.');
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
        loadAssetOverview();
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
                        <tr><th>Datum</th><th>Stk.</th><th>Kurs USD</th><th>USD/CHF</th><th>Total CHF</th><th>Stempelgebühr</th><th></th></tr>
                    </thead>
                    <tbody>
                        ${asset.buys.map(buy => `
                            <tr>
                                <td>${buy.date ? new Date(buy.date + 'T00:00:00').toLocaleDateString('de-CH') : '—'}</td>
                                <td>${parseFloat(buy.amount).toFixed(4)}</td>
                                <td>${parseFloat(buy.priceUSD).toFixed(2)}</td>
                                <td>${parseFloat(buy.rate).toFixed(4)}</td>
                                <td>${parseFloat(buy.totalCHF).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td style="color:var(--text3)">${((buy.fee_stamp || 0) + (buy.fee_other || 0)).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
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

        const fxTickersA = getRequiredFxTickers();
        const allTickersA = [...tickers, ...fxTickersA];
        const allData = await Promise.all(allTickersA.map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=${period}`, { credentials: 'include' });
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));

        // Zeitachse: erster verfügbarer FX-Ticker (oder USDCHF als Fallback)
        const fxObjA = allData.find(d => fxTickersA.includes(d.ticker) && d.history.length > 0)
                    || allData.find(d => d.ticker === 'USDCHF=X');
        if (!fxObjA || !fxObjA.history.length) return;
        const fxObj = fxObjA;

        let fxHistory = fxObj.history.filter(h => new Date(h.full_date) >= earliestDate);

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

                investedVal += asset.totalCHF;

                const tickerData = allData.find(d => d.ticker === asset.ticker);
                if (tickerData) {
                    const priceEntry = tickerData.history.find(h => h.date === dateLabel);
                    if (priceEntry?.price) lastKnownPrices[asset.ticker] = priceEntry.price;
                    const assetPrice = lastKnownPrices[asset.ticker] || 0;
                    const assetFX    = getFxRate(allData, asset.currency || 'USD', dateLabel);
                    if (assetFX) lastKnownFX = assetFX; // keep for TWR fallback
                    marketVal += asset.amount * assetPrice * assetFX;
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

        const lastValid  = v => [...v].reverse().find(x => x != null) || 0;
        const currentVal = lastValid(portfolioValues);
        const invested   = lastValid(investedValues);
        const profitCHF  = currentVal - invested;
        const profitPct  = invested > 0 ? (profitCHF / invested * 100) : 0;

        // TWR (Time-Weighted Return) für Graph-Badge
        let twr = 1.0;
        let prevMarket   = null;
        let prevInvested = null;
        for (let i = 0; i < portfolioValues.length; i++) {
            const mkt = portfolioValues[i];
            const inv = investedValues[i];
            if (mkt == null || inv == null) continue;
            if (prevMarket !== null && prevInvested !== null) {
                const cashflow = Math.max(0, inv - prevInvested);
                const basis = prevMarket + cashflow;
                if (basis > 0) twr *= (mkt / basis);
            }
            prevMarket   = mkt;
            prevInvested = inv;
        }
        const twrPct = (twr - 1) * 100;
        const badge = document.getElementById('chart-return-badge');
        if (badge) {
            badge.style.display = 'block';
            badge.style.color   = twrPct >= 0 ? '#2d6a4f' : '#c0392b';
            badge.textContent   = (twrPct >= 0 ? '+' : '') + twrPct.toFixed(2) + '% TWR';
        }

        // FX-Effekt: nur für Nicht-CHF Assets berechnen
        const nonChfAssets = portfolio.filter(p => (p.currency || 'USD') !== 'CHF');
        const avgFX = nonChfAssets.length > 0 ? nonChfAssets.reduce((s, p) => s + p.rate, 0) / nonChfAssets.length : 1;
        const fxChg = avgFX > 0 ? ((lastKnownFX - avgFX) / avgFX * 100) : 0;

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

    const p = currentPerfData;

    // Gebühren aus Portfolio summieren
    const totalFeeStamp = portfolio.reduce((s, i) => s + (i.fee_stamp || 0), 0);
    const totalFeeOther = portfolio.reduce((s, i) => s + (i.fee_other || 0), 0);
    const totalFees     = totalFeeStamp + totalFeeOther;

    // G/V ohne und mit Gebühren
    const gvOhne   = p.profitCHF;
    const gvMit    = p.profitCHF - totalFees;
    const rendOhne = p.invested > 0 ? (gvOhne / p.invested * 100) : 0;
    const rendMit  = p.invested > 0 ? (gvMit  / p.invested * 100) : 0;

    // Kurseffekt / Währungseffekt
    const stockGainPct = p.profitPct - p.fxEffect;
    const stockGainCHF = p.invested * stockGainPct / 100;
    const fxGainCHF    = p.invested * p.fxEffect   / 100;

    const col    = v => v >= 0 ? 'var(--green)' : 'var(--red)';
    const fmt    = v => (v >= 0 ? '+' : '') + v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    const chf    = v => `<span style="font-size:10px;color:var(--text3);font-family:var(--mono)"> CHF</span>`;

    // KPI-Strip updaten
    setEl('kpi-total',    p.currentVal.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    setEl('kpi-invested', p.invested.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    const gainEl  = document.getElementById('kpi-gain');
    const badgeEl = document.getElementById('kpi-gain-badge');
    if (gainEl)  { gainEl.textContent = fmt(gvOhne); gainEl.style.color = col(gvOhne); }
    if (badgeEl) { badgeEl.textContent = fmtPct(rendOhne); badgeEl.className = 'kpi-badge ' + (gvOhne >= 0 ? 'pos' : 'neg'); }

    // Graph-Badge wird separat via TWR in loadPerformanceChart gesetzt

    const card = (label, infoKey, main, sub, subColor) => `
        <div class="pg-card">
            <div class="pg-card-label">${label}${iBtn(infoKey)}</div>
            <div class="pg-card-value" style="color:${subColor}">${main}</div>
            <div class="pg-card-sub" style="color:${subColor}">${sub}</div>
        </div>`;

    box.innerHTML = `
        <div class="card-head"><span class="card-label">Performance</span></div>
        <div class="card-body" style="padding:18px 20px">

            <!-- Hauptzahl -->
            <div style="margin-bottom:20px">
                <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
                    <div style="font-size:48px;font-weight:800;letter-spacing:-0.04em;line-height:1;color:${col(gvOhne)}">
                        ${fmtPct(rendOhne)}
                    </div>
                    <div>
                        <div style="font-size:15px;font-weight:700;color:${col(gvOhne)}">${fmt(gvOhne)} CHF</div>
                        <div style="font-family:var(--mono);font-size:9px;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">
                            Gesamtrendite seit Kauf ${iBtn('simple-ret')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Grid Cards -->
            <div class="pg-grid">
                ${card('Investiert',        'investiert',   p.invested.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}), 'CHF', 'var(--text2)')}
                ${card('Aktueller Wert',    'akt-wert',     p.currentVal.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}), 'CHF', 'var(--text2)')}
                ${card('G / V inkl. Gebühren', 'rendite-fees', fmt(gvMit) + ' CHF', fmtPct(rendMit), col(gvMit))}
                ${card('Kurseffekt',        'kurseffekt',   fmt(stockGainCHF) + ' CHF', fmtPct(stockGainPct), col(stockGainCHF))}
                ${card('Währungseffekt',    'fx-effekt',    fmt(fxGainCHF) + ' CHF', fmtPct(p.fxEffect), col(fxGainCHF))}
                ${card('Gebühren',          'fees',         '-' + totalFees.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' CHF', 'Stempel + Sonstige', 'var(--red)')}
            </div>

            <!-- G/V ohne Gebühren (klein) -->
            <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;color:var(--text2);font-weight:600">
                    G / V ohne Gebühren ${iBtn('gv-fees')}
                </span>
                <span style="font-family:var(--mono);font-size:13px;color:${col(gvOhne)};font-weight:700">
                    ${fmt(gvOhne)} CHF &nbsp;·&nbsp; ${fmtPct(rendOhne)}
                </span>
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

    const fxTickersB = getRequiredFxTickers();
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
                const td = allData.find(d => d.ticker === asset.ticker);
                if (!td || !td.history.length) return;
                const currency   = asset.currency || 'USD';
                const fxTicker   = FX_TICKER_MAP[currency];
                const fxData     = fxTicker ? allData.find(d => d.ticker === fxTicker) : null;
                const fxFirst    = currency === 'CHF' ? 1 : (fxData?.history?.[0]?.price || 1);
                const fxLast     = currency === 'CHF' ? 1 : (fxData?.history?.at(-1)?.price || fxFirst);
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

// ─── ASSET OVERVIEW TABLE ────────────────────────────────

async function loadAssetOverview() {
    const container = document.getElementById('asset-overview-container');
    if (!container) return;

    container.innerHTML = `
        <div class="card">
            <div class="card-head"><span class="card-label">Positions-Übersicht</span></div>
            <div class="card-body" style="padding:0">
                <div style="text-align:center;padding:32px;font-family:'DM Mono',monospace;font-size:11px;color:var(--text3)">Lade Kursdaten…</div>
            </div>
        </div>`;

    const tickers = [...new Set(portfolio.map(i => i.ticker))].filter(Boolean);
    if (!tickers.length) {
        container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:var(--text3);font-size:12px">Keine Positionen vorhanden</div></div>`;
        return;
    }

    try {
        const fxTickersC = getRequiredFxTickers();
        const allTickersC = [...tickers, ...fxTickersC];
        const allData = await Promise.all(allTickersC.map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=max`, { credentials: 'include' });
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));
        // FX rates werden per-asset über getCurrentFxRate() geholt

        // Group portfolio by ISIN
        const grouped = portfolio.reduce((acc, item) => {
            const key = item.isin || item.name;
            if (!acc[key]) acc[key] = {
                name: item.name,
                isin: item.isin,
                ticker: item.ticker,
                totalAmount: 0,
                totalInvested: 0,
                totalFees: 0,
                avgRate: 0,
                rateSum: 0,
                items: []
            };
            acc[key].totalAmount   += item.amount;
            acc[key].totalInvested += item.totalCHF;
            acc[key].rateSum       += item.rate;
            acc[key].items.push(item);
            return acc;
        }, {});

        // Compute current prices and gains per group
        const rows = [];
        let totals = { invested: 0, wert: 0, stockGain: 0, fxGain: 0, totalGain: 0, fees: 0 };

        for (const key in grouped) {
            const g = grouped[key];
            const tickerData = allData.find(d => d.ticker === g.ticker);
            const currentPrice = tickerData?.history?.at(-1)?.price || 0;
            const currency     = g.items[0]?.currency || 'USD';
            const currentFX    = getCurrentFxRate(allData, currency);

            // Weighted avg buy rate
            const avgBuyRate = currency === 'CHF' ? 1 : (g.rateSum / g.items.length);

            // Current value in CHF
            const currentValueCHF = g.totalAmount * currentPrice * currentFX;

            // Invested: sum of (amount × price_at_buy × rate_at_buy)
            const investedCHF = g.totalInvested;

            // Stock gain: value at current price but avg buy FX rate
            const valueAtBuyRate = g.totalAmount * currentPrice * avgBuyRate;
            const stockGainCHF   = valueAtBuyRate - investedCHF;

            // FX gain: difference from using current FX vs buy FX
            const fxGainCHF = currency === 'CHF' ? 0 : (currentValueCHF - valueAtBuyRate);

            // Total gain
            const totalGainCHF = currentValueCHF - investedCHF;

            // Fees: sum from individual buys
            const feesCHF = g.items.reduce((s, it) => s + (it.fees || 0), 0);

            rows.push({ name: g.name, ticker: g.ticker || '—', amount: g.totalAmount, wert: currentValueCHF, invested: investedCHF, stockGain: stockGainCHF, fxGain: fxGainCHF, totalGain: totalGainCHF, fees: feesCHF });

            totals.invested  += investedCHF;
            totals.wert      += currentValueCHF;
            totals.stockGain += stockGainCHF;
            totals.fxGain    += fxGainCHF;
            totals.totalGain += totalGainCHF;
            totals.fees      += feesCHF;
        }

        const fmtCHF = v => v.toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const gainCell = (v) => {
            const cls = v >= 0 ? 'gain-pos' : 'gain-neg';
            const sign = v >= 0 ? '+' : '';
            return `<td class="overview-td num ${cls}">${sign}${fmtCHF(v)}</td>`;
        };

        const rowsHtml = rows.map((r, i) => `
            <tr class="overview-row">
                <td class="overview-td idx">${i}</td>
                <td class="overview-td"><span class="ov-name">${r.name}</span></td>
                <td class="overview-td"><span class="ov-ticker">${r.ticker}</span></td>
                <td class="overview-td num">${r.amount.toLocaleString('de-CH', {minimumFractionDigits: 0, maximumFractionDigits: 4})}</td>
                <td class="overview-td num">${fmtCHF(r.wert)}</td>
                <td class="overview-td num">${fmtCHF(r.invested)}</td>
                ${gainCell(r.stockGain)}
                ${gainCell(r.fxGain)}
                ${gainCell(r.totalGain)}
                <td class="overview-td num neutral-val">${fmtCHF(r.fees)}</td>
            </tr>`).join('');

        const totalRowHtml = `
            <tr class="overview-total-row">
                <td class="overview-td idx"></td>
                <td class="overview-td" colspan="2"><span class="ov-name">Total</span></td>
                <td class="overview-td num">—</td>
                <td class="overview-td num">${fmtCHF(totals.wert)}</td>
                <td class="overview-td num">${fmtCHF(totals.invested)}</td>
                ${gainCell(totals.stockGain)}
                ${gainCell(totals.fxGain)}
                ${gainCell(totals.totalGain)}
                <td class="overview-td num neutral-val">${fmtCHF(totals.fees)}</td>
            </tr>`;

        container.innerHTML = `
            <div class="card">
                <div class="card-head"><span class="card-label">Positions-Übersicht</span></div>
                <div style="overflow-x:auto">
                    <table class="overview-table">
                        <thead>
                            <tr>
                                <th class="overview-th idx"></th>
                                <th class="overview-th">Name</th>
                                <th class="overview-th">Ticker</th>
                                <th class="overview-th num">Menge</th>
                                <th class="overview-th num">Wert (CHF)</th>
                                <th class="overview-th num">Investiert (CHF)</th>
                                <th class="overview-th num">Stock Gain</th>
                                <th class="overview-th num">FX Gain</th>
                                <th class="overview-th num">Total Gain</th>
                                <th class="overview-th num">Gebühren</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                            ${totalRowHtml}
                        </tbody>
                    </table>
                </div>
            </div>`;

    } catch (e) {
        console.error('Asset-Overview-Fehler:', e);
        container.innerHTML = `<div class="card"><div class="card-body" style="color:var(--red);text-align:center;padding:32px;font-size:12px">Fehler beim Laden der Übersicht</div></div>`;
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
        const fxTickers = getRequiredFxTickers();
        const allTickers = [...tickers, ...fxTickers];
        const allData = await Promise.all(allTickers.map(async t => {
            const res  = await fetch(`/get_history?symbol=${t}&period=2y`, { credentials: 'include' });
            const data = await res.json();
            return { ticker: t, history: Array.isArray(data) ? data : [] };
        }));

        // Zeitachse: alle verfügbaren Daten ab erstem Kaufdatum
        const earliestPurchase = portfolio.reduce((earliest, item) => {
            const d = new Date(item.date);
            return !earliest || d < earliest ? d : earliest;
        }, null);

        const allDates = [...new Set(allData.flatMap(d => d.history.map(h => h.date)))]
            .filter(dk => !earliestPurchase || new Date(dk) >= earliestPurchase)
            .sort();

        const dailyValues = {};
        allDates.forEach(dateKey => {
            let value     = 0;
            portfolio.forEach(asset => {
                const td = allData.find(d => d.ticker === asset.ticker);
                if (!td) return;
                const pe = td.history.find(h => h.date === dateKey);
                if (!pe) return;
                const currency = asset.currency || 'USD';
                const fxRate   = getFxRate(allData, currency, dateKey);
                value += asset.amount * pe.price * fxRate;
            });
            if (value > 0) {
                // Datum aus irgendeinem FX-Eintrag holen
                const anyEntry = allData[0]?.history.find(h => h.date === dateKey);
                if (anyEntry) dailyValues[dateKey] = { date: new Date(anyEntry.full_date || dateKey), value };
            }
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
    ['asset-name','isin','ticker','amount','price','exchange-rate','purchase-date','fee-stamp','fee-other']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const curr = document.getElementById('currency');
    if (curr) { curr.value = 'USD'; updateCurrencyFields(); }
    const preview = document.getElementById('transaction-preview');
    if (preview) preview.style.display = 'none';
}

function setupTransactionPreview() {
    ['amount','price','exchange-rate'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateTransactionPreview);
    });
}

function updateTransactionPreview() {
    const currency = document.getElementById('currency')?.value || 'USD';
    const amount = parseFloat(document.getElementById('amount')?.value) || 0;
    const price  = parseFloat(document.getElementById('price')?.value) || 0;
    const rate   = currency === 'CHF' ? 1 : (parseFloat(document.getElementById('exchange-rate')?.value) || 0);
    const preview = document.getElementById('transaction-preview');
    const totalEl = document.getElementById('preview-total');
    if (amount > 0 && price > 0 && (currency === 'CHF' || rate > 0)) {
        if (totalEl) totalEl.textContent = (amount * price * rate).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' CHF';
        if (preview) preview.style.display = 'flex';
    } else {
        if (preview) preview.style.display = 'none';
    }
}

// ─── TICKER SUCHE ────────────────────────────────────────

let tickerSearchTimeout = null;

async function searchTicker(query) {
    const dropdown = document.getElementById('ticker-dropdown');
    if (!dropdown) return;

    clearTimeout(tickerSearchTimeout);
    if (!query || query.length < 2) { dropdown.style.display = 'none'; return; }

    dropdown.style.display = 'block';
    dropdown.innerHTML = '<div class="ticker-loading">Suche…</div>';

    tickerSearchTimeout = setTimeout(async () => {
        try {
            const res  = await fetch(`/api/search_ticker?q=${encodeURIComponent(query)}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.length) {
                dropdown.innerHTML = '<div class="ticker-loading">Keine Ergebnisse</div>';
                return;
            }
            dropdown.innerHTML = data.map(r => `
                <div class="ticker-item" onclick="selectTicker('${r.symbol}', '${r.name.replace(/'/g, "\'")}', '${r.isin || ''}')">
                    <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span class="ticker-symbol">${r.symbol}</span>
                            <span class="ticker-name">${r.name}</span>
                        </div>
                        ${r.isin ? `<span style="font-family:var(--mono);font-size:9px;color:var(--text3);letter-spacing:0.05em">${r.isin}</span>` : ''}
                    </div>
                    <span class="ticker-exch">${r.exchange}</span>
                </div>`).join('');
        } catch(e) {
            dropdown.style.display = 'none';
        }
    }, 350);
}

function selectTicker(symbol, name, isin) {
    const tickerInput = document.getElementById('ticker');
    const nameInput   = document.getElementById('asset-name');
    const isinInput   = document.getElementById('isin');
    if (tickerInput) tickerInput.value = symbol;
    if (nameInput)   nameInput.value   = name;
    if (isinInput && isin) isinInput.value = isin;
    const dropdown = document.getElementById('ticker-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Dropdown schliessen wenn ausserhalb geklickt
document.addEventListener('click', e => {
    if (!e.target.closest('#ticker') && !e.target.closest('#ticker-dropdown')) {
        const d = document.getElementById('ticker-dropdown');
        if (d) d.style.display = 'none';
    }
});

// ─── CURRENCY HELPERS ────────────────────────────────────

// Yahoo Finance FX ticker für jede Währung → CHF
const FX_TICKERS = {
    'USD': 'USDCHF=X',
    'EUR': 'EURCHF=X',
    'GBP': 'GBPCHF=X',
    'JPY': 'JPYCHF=X',
    'CAD': 'CADCHF=X',
    'AUD': 'AUDCHF=X',
    'CHF': null  // kein FX nötig
};

function updateCurrencyFields() {
    const currency = document.getElementById('currency')?.value;
    const rateField = document.getElementById('rate-field');
    const priceLabel = document.getElementById('price-label');
    const rateLabel = document.getElementById('rate-label');
    if (priceLabel) priceLabel.textContent = currency;
    if (rateLabel)  rateLabel.textContent  = currency;
    if (rateField) rateField.style.display = currency === 'CHF' ? 'none' : 'flex';
    updateTransactionPreview();
}

function updateEditCurrencyFields() {
    const currency = document.getElementById('edit-currency')?.value;
    const rateField = document.getElementById('edit-rate-field');
    const priceLabel = document.getElementById('edit-price-label');
    const rateLabel = document.getElementById('edit-rate-label');
    if (priceLabel) priceLabel.textContent = currency;
    if (rateLabel)  rateLabel.textContent  = currency;
    if (rateField) rateField.style.display = currency === 'CHF' ? 'none' : 'flex';
}

// ─── CRUD ────────────────────────────────────────────────

async function calculate() {
    const name      = document.getElementById('asset-name')?.value?.trim();
    const isin      = document.getElementById('isin')?.value?.trim().toUpperCase();
    const ticker    = document.getElementById('ticker')?.value?.trim().toUpperCase();
    const currency  = document.getElementById('currency')?.value || 'USD';
    const amount    = parseFloat(document.getElementById('amount')?.value);
    const price     = parseFloat(document.getElementById('price')?.value);
    const rate      = currency === 'CHF' ? 1 : (parseFloat(document.getElementById('exchange-rate')?.value) || 0);
    const date      = document.getElementById('purchase-date')?.value;
    const feeStamp  = parseFloat(document.getElementById('fee-stamp')?.value)  || 0;
    const feeOther  = parseFloat(document.getElementById('fee-other')?.value)  || 0;

    if (!name || !isin || isNaN(amount) || amount <= 0) {
        alert('Bitte Name, ISIN und Anzahl angeben.');
        return;
    }

    const totalCHF = amount * (isNaN(price) ? 0 : price) * rate;

    const item = {
        name, isin, amount, currency,
        priceUSD: isNaN(price) ? 0 : price,
        rate,
        date,
        totalCHF,
        ticker:    ticker || '',
        fee_stamp: feeStamp,
        fee_other: feeOther
    };

    try {
        const res = await fetch('/api/portfolio', { credentials: 'include',
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
        await fetch(`/api/portfolio/${dbId}`, { method: 'DELETE', credentials: 'include' });
        await loadDataFromServer();
        renderPortfolio();
    } catch (e) {
        alert('Fehler beim Löschen.');
    }
}

function openEditModal(dbId) {
    const item = portfolio.find(p => p.id === dbId);
    if (!item) return;
    document.getElementById('edit-id').value           = dbId;
    document.getElementById('edit-asset-name').value   = item.name      || '';
    document.getElementById('edit-isin').value          = item.isin      || '';
    document.getElementById('edit-ticker').value        = item.ticker    || '';
    document.getElementById('edit-currency').value      = item.currency  || 'USD';
    document.getElementById('edit-amount').value        = item.amount    || '';
    document.getElementById('edit-price').value         = item.priceUSD  || '';
    document.getElementById('edit-rate').value          = item.rate      || '';
    document.getElementById('edit-date').value          = item.date      || '';
    document.getElementById('edit-fee-stamp').value     = item.fee_stamp || '';
    document.getElementById('edit-fee-other').value     = item.fee_other || '';
    updateEditCurrencyFields();
    toggleEditModal(true);
}

async function saveEdit() {
    const dbId   = parseInt(document.getElementById('edit-id')?.value);
    const item   = portfolio.find(p => p.id === dbId);
    if (!item) return;

    const name     = document.getElementById('edit-asset-name')?.value?.trim();
    const isin     = document.getElementById('edit-isin')?.value?.trim().toUpperCase();
    const ticker   = document.getElementById('edit-ticker')?.value?.trim().toUpperCase();
    const currency = document.getElementById('edit-currency')?.value || 'USD';
    const amount   = parseFloat(document.getElementById('edit-amount')?.value);
    const price    = parseFloat(document.getElementById('edit-price')?.value) || 0;
    const rate     = currency === 'CHF' ? 1 : (parseFloat(document.getElementById('edit-rate')?.value) || 1);
    const date     = document.getElementById('edit-date')?.value;
    const feeStamp = parseFloat(document.getElementById('edit-fee-stamp')?.value) || 0;
    const feeOther = parseFloat(document.getElementById('edit-fee-other')?.value) || 0;
    const updated  = { ...item, name, isin, ticker, currency, amount, priceUSD: price, rate, date,
                        totalCHF: amount * price * rate, fee_stamp: feeStamp, fee_other: feeOther };

    try {
        await fetch(`/api/portfolio/${dbId}`, { credentials: 'include',
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
        await fetch('/api/cash', { credentials: 'include',
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