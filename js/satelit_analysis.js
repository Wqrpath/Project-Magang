// ============================================================
// ============================================================

// ===== KOORDINAT BATAS GAMBAR SATELIT EH =====
const SAT_BOUNDS = {
    north: 20.0,
    south: -20.0,
    west:  90.0,
    east:  150.0,
};
const SAT_LON_SPAN = SAT_BOUNDS.east - SAT_BOUNDS.west;   // 60 derajat
const SAT_LAT_SPAN = SAT_BOUNDS.north - SAT_BOUNDS.south; // 40 derajat

// ===== THRESHOLD PIXEL (ANALISIS WARNA RGB CITRA EH) =====

function classifyPixel(r, g, b, a) {
    if (a < 30) return 'transparent';

    // ----- MERAH (BAHAYA): pixel sangat merah, atau merah muda/pink -----
    if (r >= 180 && g < 80 && b < 100) return 'merah';
    if (r >= 160 && g < 60 && b >= 100) return 'merah';
    if (r >= 220 && g >= 200 && b < 80) return 'merah';
    if (r >= 230 && g >= 220 && b >= 160 && b < 230) return 'merah';

    // ----- KUNING/ORANYE (WASPADA) -----
    if (r >= 200 && g >= 80 && g < 200 && b < 80) return 'kuning';
    if (r >= 160 && g >= 60 && g < 140 && b < 60) return 'kuning';
    if (r >= 210 && g >= 140 && g < 210 && b < 60) return 'kuning';
    if (r >= 180 && g >= 180 && b < 100) return 'kuning'; // tambahan kuning murni

    // ----- HIJAU -----
    if (g >= 120 && r < 120 && b < 120) return 'hijau';
    if (g >= 140 && r < 140) return 'hijau';

    // ----- BIRU -----
    if (b >= 100 && r < 100) return 'biru';
    if (b >= 100 && g >= 100 && r < 100) return 'biru'; // cyan/biru muda

    return 'aman';
}

// ===== KONVERSI KOORDINAT GEO → PIXEL GAMBAR =====
function geoToPixel(lat, lon, imgW, imgH) {
    const px = ((lon - SAT_BOUNDS.west) / SAT_LON_SPAN) * imgW;
    const py = ((SAT_BOUNDS.north - lat) / SAT_LAT_SPAN) * imgH;
    return { x: Math.round(px), y: Math.round(py) };
}

// ===== POINT-IN-POLYGON (RAY CASTING) =====
function pointInPolygon(px, py, polyPixels) {
    let inside = false;
    const n = polyPixels.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polyPixels[i].x, yi = polyPixels[i].y;
        const xj = polyPixels[j].x, yj = polyPixels[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// ===== KONVERSI RING KOORDINAT GEO → ARRAY PIXEL =====
function ringToPixels(ring, imgW, imgH) {
    return ring.map(([lon, lat]) => geoToPixel(lat, lon, imgW, imgH));
}

// ===== ANALISIS SATU FEATURE WILMETOS =====
function analyzeFeature(feature, imageData, imgW, imgH) {
    const geom = feature.geometry;
    const prop = feature.properties || {};
    const namaPerairan = prop.perairan || prop.PERAIRAN || 'Wilayah Perairan';
    const idMar = prop.ID_MAR || '';

    let rings = [];
    if (geom.type === 'Polygon') {
        rings = [geom.coordinates[0]]; // Hanya outer ring
    } else if (geom.type === 'MultiPolygon') {
        rings = geom.coordinates.map(poly => poly[0]);
    } else {
        return null;
    }

    let totalPixel = 0;
    let merahPixel = 0;
    let kuningPixel = 0;
    let hijauPixel = 0;
    let biruPixel = 0;

    for (const ring of rings) {
        const polyPx = ringToPixels(ring, imgW, imgH);

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of polyPx) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }

        minX = Math.max(0, minX);
        maxX = Math.min(imgW - 1, maxX);
        minY = Math.max(0, minY);
        maxY = Math.min(imgH - 1, maxY);

        const step = 2;
        for (let py = minY; py <= maxY; py += step) {
            for (let px = minX; px <= maxX; px += step) {
                if (!pointInPolygon(px, py, polyPx)) continue;

                totalPixel++; // Hitung semua pixel sebagai 100% luas wilayah

                const idx = (py * imgW + px) * 4;
                const r = imageData.data[idx];
                const g = imageData.data[idx + 1];
                const b = imageData.data[idx + 2];
                const a = imageData.data[idx + 3];

                const cls = classifyPixel(r, g, b, a);
                
                if (cls === 'merah' || cls === 'bahaya') merahPixel++;
                else if (cls === 'kuning' || cls === 'waspada') kuningPixel++;
                else if (cls === 'hijau') hijauPixel++;
                else if (cls === 'biru') biruPixel++;
            }
        }
    }

    if (totalPixel === 0) {
        return {
            namaPerairan, idMar,
            total: 0, merah: 0, kuning: 0, hijau: 0, biru: 0,
            pctMerah: 0, pctKuning: 0, pctHijau: 0, pctBiru: 0,
            waspada: 0, bahaya: 0, pctWaspada: 0, pctBahaya: 0,
            level: 'aman',
        };
    }

    const pctMerah = (merahPixel / totalPixel) * 100;
    const pctKuning = (kuningPixel / totalPixel) * 100;
    const pctHijau = (hijauPixel / totalPixel) * 100;
    const pctBiru = (biruPixel / totalPixel) * 100;

    const pctBahaya = pctMerah;
    const pctWaspada = pctKuning;

    let level = 'aman';
    if (pctBahaya > 0.1) level = 'bahaya';
    else if (pctWaspada > 0.5) level = 'waspada';

    return { 
        namaPerairan, idMar, total: totalPixel, 
        merah: merahPixel, kuning: kuningPixel, hijau: hijauPixel, biru: biruPixel,
        pctMerah, pctKuning, pctHijau, pctBiru,
        waspada: kuningPixel, bahaya: merahPixel, pctWaspada, pctBahaya, level 
    };
}

// ===== STATE ANALISIS SATELIT =====
let _satAnalysisResults = [];
let _satAnalysisRunning = false;
let _satCanvas = null;
let _satCtx   = null;
let _lastAlarmLevelSat = null;

// ===== LOAD GAMBAR SATELIT KE CANVAS OFFSCREEN =====
function loadSatImageToCanvas(imageUrl) {
    return new Promise((resolve, reject) => {
        const drawToCanvas = (imgEl) => {
            if (!_satCanvas) {
                _satCanvas = document.createElement('canvas');
                _satCtx = _satCanvas.getContext('2d', { willReadFrequently: true });
            }
            _satCanvas.width  = imgEl.naturalWidth  || imgEl.width;
            _satCanvas.height = imgEl.naturalHeight || imgEl.height;
            _satCtx.clearRect(0, 0, _satCanvas.width, _satCanvas.height);
            _satCtx.drawImage(imgEl, 0, 0);
            resolve({ ctx: _satCtx, w: _satCanvas.width, h: _satCanvas.height });
        };

        fetch(imageUrl + '?t=' + Date.now())
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.blob();
            })
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    drawToCanvas(img);
                    URL.revokeObjectURL(blobUrl);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(blobUrl);
                    reject(new Error('Gagal load blob URL gambar satelit'));
                };
                img.src = blobUrl;
            })
            .catch(fetchErr => {
                console.warn('[SatAnalysis] fetch gagal, mencoba Image langsung:', fetchErr.message);
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        drawToCanvas(img);
                    } catch (e) {
                        reject(new Error('Canvas tainted (CORS). Buka via HTTP server, bukan file://.'));
                    }
                };
                img.onerror = () => reject(new Error('Gagal load gambar satelit: ' + imageUrl));
                img.src = imageUrl + '?t=' + Date.now();
            });
    });
}

// ===== JALANKAN ANALISIS SEMUA WILMETOS =====
async function runSatelliteAnalysis() {
    if (_satAnalysisRunning) return;
    if (typeof WILMETOS_JATIM_DATA === 'undefined') {
        console.warn('[SatAnalysis] Data wilmetos belum tersedia.');
        return;
    }

    _satAnalysisRunning = true;
    console.log('[SatAnalysis] Memulai analisis pixel citra satelit EH...');

    try {
        const { ctx, w, h } = await loadSatImageToCanvas('EH_latest.png');
        const imageData = ctx.getImageData(0, 0, w, h);

        const results = [];
        for (const feature of WILMETOS_JATIM_DATA.features) {
            const res = analyzeFeature(feature, imageData, w, h);
            if (res) {
                results.push({ ...res, feature });
            }
        }

        _satAnalysisResults = results;
        console.log(`[SatAnalysis] Selesai. ${results.length} wilayah dianalisis.`);

        const timeEl = document.getElementById('satAnalysisTime');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = '✓ ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
        }

        renderSatAnalysisPanel(results);
        renderWilmotosAlerts(results);
        (window.triggerSatAlarm || triggerSatAlarm)(results);

    } catch (e) {
        console.error('[SatAnalysis] Error:', e.message);
        const panel = document.getElementById('satPerairanContent');
        if (panel) {
            panel.innerHTML = `<div style="font-size:11px; color:#ff5252; padding:10px; text-align:center;">⚠️ Gagal membaca pixel gambar satelit.<br><span style="font-size:9px; color:#888;">Pastikan file EH_latest.png ada dan server lokal berjalan (CORS).</span></div>`;
        }
    } finally {
        _satAnalysisRunning = false;
    }
}

// ===== HELPER: INFO LEVEL =====
function getSatLevelInfo(level) {
    if (level === 'bahaya') return {
        label: 'BAHAYA', icon: '🔴', color: '#ff1744', bg: 'rgba(255,23,68,0.15)',
        borderColor: '#ff1744', suhu: '< -69°C',
    };
    if (level === 'waspada') return {
        label: 'WASPADA', icon: '🟠', color: '#ff9800', bg: 'rgba(255,152,0,0.13)',
        borderColor: '#ff9800', suhu: '-41 s.d. -69°C',
    };
    return {
        label: 'AMAN', icon: '🟢', color: '#00e676', bg: 'rgba(0,230,118,0.08)',
        borderColor: '#00e676', suhu: '> -41°C',
    };
}

// ===== RENDER PANEL SIDEBAR (STATUS PERAIRAN SATELIT) =====
function renderSatAnalysisPanel(results) {
    const panel = document.getElementById('satPerairanContent');
    const badge = document.getElementById('satPerairanBadge');
    if (!panel) return;

    const alertCount = results.filter(r => r.level === 'waspada' || r.level === 'bahaya').length;
    if (badge) {
        badge.textContent = alertCount;
        badge.style.display = alertCount > 0 ? 'inline-flex' : 'none';
    }

    if (results.length === 0) {
        panel.innerHTML = `<div style="font-size:11px; color:var(--text-sub); text-align:center; padding:12px;">🔄 Menunggu data analisis...</div>`;
        return;
    }

    const sorted = [...results].sort((a, b) => {
        const order = { bahaya: 0, waspada: 1, aman: 2 };
        return (order[a.level] ?? 9) - (order[b.level] ?? 9);
    });

    const bahayaList  = sorted.filter(r => r.level === 'bahaya');
    const waspadaList = sorted.filter(r => r.level === 'waspada');

    let summaryHtml = '';
    if (bahayaList.length === 0 && waspadaList.length === 0) {
        summaryHtml = `
        <div style="text-align:center; padding:10px 0 6px;">
            <div style="font-size:28px; margin-bottom:4px;">☁️</div>
            <div style="font-size:12px; font-weight:700; color:#00e676;">Langit Bersih</div>
            <div style="font-size:10px; color:var(--text-sub); margin-top:2px;">Tidak ada awan konvektif terdeteksi</div>
        </div>`;
    } else {
        const top = bahayaList[0] || waspadaList[0];
        const info = getSatLevelInfo(top.level);
        summaryHtml = `
        <div style="background:${info.bg}; border:1px solid ${info.borderColor}; border-radius:8px; padding:8px 10px; margin-bottom:8px; display:flex; gap:10px; align-items:center;">
            <div style="font-size:24px;">${info.icon}</div>
            <div>
                <div style="font-size:12px; font-weight:800; color:${info.color};">${info.label} — ${alertCount} Perairan Terdampak</div>
                <div style="font-size:10px; color:var(--text-sub); margin-top:2px;">Ada awan konvektif aktif di ${alertCount} wilayah kerja</div>
            </div>
        </div>`;
    }

    const itemsHtml = sorted.map(r => {
        const info = getSatLevelInfo(r.level);
        const pctB = r.pctBahaya.toFixed(1);
        const pctW = r.pctWaspada.toFixed(1);

        const barHtml = (r.level !== 'aman') ? `
            <div style="margin-top:3px; display:flex; gap:3px; align-items:center;">
                ${r.pctBahaya > 0 ? `<div style="height:4px; width:${Math.min(r.pctBahaya * 5, 60)}px; background:#ff1744; border-radius:2px; flex-shrink:0;"></div>` : ''}
                ${r.pctWaspada > 0 ? `<div style="height:4px; width:${Math.min(r.pctWaspada * 2, 60)}px; background:#ff9800; border-radius:2px; flex-shrink:0;"></div>` : ''}
                <span style="font-size:9px; color:var(--text-sub); margin-left:3px;">
                    ${r.pctBahaya > 0 ? `🔴${pctB}%` : ''}${r.pctBahaya > 0 && r.pctWaspada > 0 ? ' ' : ''}${r.pctWaspada > 0 ? `🟠${pctW}%` : ''}
                </span>
            </div>` : '';

        return `
        <div class="sat-perairan-item" onclick="focusSatItem('${r.idMar}')" style="
            display:flex; align-items:center; gap:6px;
            padding:5px 8px; border-radius:6px; margin-bottom:3px;
            cursor:pointer; background:rgba(255,255,255,0.03);
            border-left:3px solid ${info.borderColor};
            border-top:1px solid rgba(255,255,255,0.04);
            transition:background 0.15s;
        " onmouseover="this.style.background='rgba(0,229,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <div style="font-size:11px; flex-shrink:0;">${info.icon}</div>
            <div style="flex:1; min-width:0;">
                <div style="font-size:10px; font-weight:700; color:#f0f6fc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.namaPerairan}</div>
                <div style="font-size:9px; color:var(--text-sub);">${r.idMar}</div>
                ${barHtml}
            </div>
            <div style="
                background:${info.color}; color:white; font-size:7px; font-weight:900;
                padding:2px 5px; border-radius:3px; white-space:nowrap; flex-shrink:0;
            ">${info.label}</div>
        </div>`;
    }).join('');

    panel.innerHTML = summaryHtml + itemsHtml;
}

// ===== RENDER HIGHLIGHT POLYGON DAN MARKER DI PETA =====
let _wilmetosAlertLayerGroup = null;

function renderWilmotosAlerts(results) {
    if (!_wilmetosAlertLayerGroup) {
        _wilmetosAlertLayerGroup = L.layerGroup().addTo(map);
    }
    _wilmetosAlertLayerGroup.clearLayers();


    const resultMap = {};
    for (const r of results) {
        if (r.idMar) resultMap[r.idMar] = r;
    }

    if (typeof WILMETOS_JATIM_DATA !== 'undefined') {
        L.geoJSON(WILMETOS_JATIM_DATA, {
            style: (feature) => {
                const id = feature.properties?.ID_MAR || '';
                const r = resultMap[id];
                if (!r) return {
                    color: '#00e5ff', weight: 2, dashArray: '6,4',
                    fillColor: '#00bcd4', fillOpacity: 0.12, opacity: 0.9,
                };
                if (r.level === 'bahaya') return {
                    color: '#ff1744', weight: 3, dashArray: null,
                    fillColor: '#ff1744', fillOpacity: 0.22, opacity: 1,
                };
                if (r.level === 'waspada') return {
                    color: '#ff9800', weight: 2.5, dashArray: '4,3',
                    fillColor: '#ff9800', fillOpacity: 0.15, opacity: 1,
                };
                return {
                    color: '#00e5ff', weight: 1.5, dashArray: '6,4',
                    fillColor: '#00bcd4', fillOpacity: 0.08, opacity: 0.7,
                };
            },
            onEachFeature: (feature, layer) => {
                const id = feature.properties?.ID_MAR || '';
                const r = resultMap[id];
                const namaPerairan = feature.properties?.perairan || 'Wilayah Perairan';

                if (!r) {
                    layer.bindTooltip(
                        `<div style="font-family:'Segoe UI',sans-serif; font-size:11px; font-weight:700; color:#00e5ff;">🌊 ${namaPerairan}${id ? `<br><span style="font-size:9px;opacity:0.7;">${id}</span>` : ''}</div>`,
                        { sticky: true, className: 'wilmetos-tooltip', opacity: 0.95 }
                    );
                    return;
                }

                const info = getSatLevelInfo(r.level);
                const pctBStr = r.pctBahaya.toFixed(1);
                const pctWStr = r.pctWaspada.toFixed(1);
                const pctHStr = (r.pctHijau || 0).toFixed(1);
                const pctBiruStr = (r.pctBiru || 0).toFixed(1);

                layer.bindTooltip(
                    `<div style="font-family:'Segoe UI',sans-serif; font-size:11px;">
                        <b style="color:${info.color};">${info.icon} ${r.namaPerairan}</b>
                        <br><span style="font-size:9px; color:#aaa;">${id}</span>
                        <div style="font-size:10px; margin-top:5px; display:grid; grid-template-columns:1fr 1fr; gap:3px;">
                            <span style="color:#ff1744;">🔴 Merah: ${pctBStr}%</span>
                            <span style="color:#ff9800;">🟠 Kuning: ${pctWStr}%</span>
                            <span style="color:#00e676;">🟢 Hijau: ${pctHStr}%</span>
                            <span style="color:#00b0ff;">🔵 Biru: ${pctBiruStr}%</span>
                        </div>
                    </div>`,
                    { sticky: true, className: 'wilmetos-alert-tooltip', opacity: 0.97 }
                );

                layer.bindPopup(`
                    <div style="font-family:'Segoe UI',sans-serif; min-width:260px;">
                        <div style="background:${info.color}; color:${r.level === 'aman' ? '#000' : 'white'}; padding:7px 10px; border-radius:4px 4px 0 0; margin:-12px -12px 10px; font-weight:800; font-size:13px;">
                            ${info.icon} ${info.label} — ${namaPerairan}
                        </div>
                        <div style="font-size:11px; color:#555; margin-bottom:6px;">${id} · Analisis Pixel Citra EH</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px;">
                            <div style="background:rgba(255,23,68,0.1); border:1px solid rgba(255,23,68,0.4); border-radius:6px; padding:6px; text-align:center;">
                                <div style="font-size:16px; font-weight:900; color:#ff1744;">${pctBStr}%</div>
                                <div style="font-size:9px; color:#888;">Merah/Putih<br>(&lt; -69°C)</div>
                            </div>
                            <div style="background:rgba(255,152,0,0.1); border:1px solid rgba(255,152,0,0.4); border-radius:6px; padding:6px; text-align:center;">
                                <div style="font-size:16px; font-weight:900; color:#ff9800;">${pctWStr}%</div>
                                <div style="font-size:9px; color:#888;">Kuning/Oranye<br>(-41 s.d -69°C)</div>
                            </div>
                            <div style="background:rgba(0,230,118,0.1); border:1px solid rgba(0,230,118,0.4); border-radius:6px; padding:6px; text-align:center;">
                                <div style="font-size:16px; font-weight:900; color:#00e676;">${pctHStr}%</div>
                                <div style="font-size:9px; color:#888;">Hijau<br>(&gt; -41°C)</div>
                            </div>
                            <div style="background:rgba(0,176,255,0.1); border:1px solid rgba(0,176,255,0.4); border-radius:6px; padding:6px; text-align:center;">
                                <div style="font-size:16px; font-weight:900; color:#00b0ff;">${pctBiruStr}%</div>
                                <div style="font-size:9px; color:#888;">Biru<br>(Awan Tipis)</div>
                            </div>
                        </div>
                        ${r.level !== 'aman' ? `
                        <div style="margin-top:8px; padding:6px; background:${info.bg}; border-radius:5px; font-size:10px; color:${info.color}; font-weight:700; text-align:center; border:1px solid ${info.borderColor};">
                            ${info.icon} ${info.label} — Suhu Puncak Awan ${info.suhu}
                        </div>` : ''}
                        <div style="font-size:9px; color:#aaa; margin-top:6px; text-align:center;">Sumber: Citra Satelit Himawari EH · BMKG</div>
                    </div>`, { maxWidth: 280 });

                layer.on('mouseover', function () {
                    this.setStyle({ fillOpacity: r.level === 'bahaya' ? 0.38 : r.level === 'waspada' ? 0.28 : 0.2 });
                });
                layer.on('mouseout', function () {
                    if (r.level === 'bahaya') this.setStyle({ fillOpacity: 0.22, weight: 3 });
                    else if (r.level === 'waspada') this.setStyle({ fillOpacity: 0.15, weight: 2.5 });
                    else this.setStyle({ fillOpacity: 0.08, weight: 1.5 });
                });
            }
        }).addTo(_wilmetosAlertLayerGroup);
    }

    for (const r of results) {
        if (r.level === 'aman') continue;

        const feature = r.feature;
        if (!feature || !feature.geometry) continue;

        let centroidLat = 0, centroidLon = 0, pointCount = 0;
        const geom = feature.geometry;
        const firstRing = geom.type === 'Polygon' ? geom.coordinates[0]
                        : geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : null;
        if (!firstRing) continue;

        for (const [lon, lat] of firstRing) {
            centroidLon += lon;
            centroidLat += lat;
            pointCount++;
        }
        if (pointCount === 0) continue;
        centroidLat /= pointCount;
        centroidLon /= pointCount;

        const info = getSatLevelInfo(r.level);
        const pctB = r.pctBahaya.toFixed(1);
        const pctW = r.pctWaspada.toFixed(1);

        const labelIcon = L.divIcon({
            className: '',
            html: `
            <div class="sat-wilmetos-label sat-label-${r.level}" style="
                background: ${info.bg};
                border: 1.5px solid ${info.borderColor};
                color: ${info.color};
                border-radius: 8px;
                padding: 4px 8px;
                font-family: 'Segoe UI', sans-serif;
                font-size: 10px;
                font-weight: 700;
                white-space: nowrap;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
                backdrop-filter: blur(4px);
                text-align: center;
                pointer-events: none;
            ">
                <div style="font-size:9px; font-weight:900; letter-spacing:0.5px;">${r.namaPerairan.replace('Perairan ', '')}</div>
                <div style="font-size:11px; margin-top:1px;">
                    ${r.pctBahaya > 0 ? `🔴 ${pctB}%` : ''} ${r.pctWaspada > 0.5 ? `🟠 ${pctW}%` : ''}
                </div>
                <div style="font-size:9px; opacity:0.85;">${info.label}</div>
            </div>`,
            iconAnchor: [60, 20],
        });

        const labelMarker = L.marker([centroidLat, centroidLon], { icon: labelIcon, interactive: false });
        labelMarker.addTo(_wilmetosAlertLayerGroup);
    }
}

// ===== FOKUS PETA KE WILAYAH BERDASARKAN ID =====
function focusSatItem(idMar) {
    if (typeof WILMETOS_JATIM_DATA === 'undefined') return;
    const feature = WILMETOS_JATIM_DATA.features.find(f => f.properties?.ID_MAR === idMar);
    if (!feature) return;

    const geom = feature.geometry;
    const firstRing = geom.type === 'Polygon' ? geom.coordinates[0]
                    : geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : null;
    if (!firstRing) return;

    const latlngs = firstRing.map(([lon, lat]) => [lat, lon]);
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9, animate: true, duration: 0.9 });
}

// ===== TRIGGER ALARM AUDIO BERBASIS ANALISIS SATELIT =====
function triggerSatAlarm(results) {
    const bahayaItems  = results.filter(r => r.level === 'bahaya');
    const waspadaItems = results.filter(r => r.level === 'waspada');

    const triggerBahaya  = bahayaItems.some(r => r.pctBahaya  > 5);
    const triggerWaspada = waspadaItems.some(r => r.pctWaspada > 20);

    let levelTerparah = null;
    if (triggerBahaya)  levelTerparah = 'BAHAYA';
    else if (triggerWaspada) levelTerparah = 'WASPADA';

    renderSatStatusBar(results, bahayaItems, waspadaItems);

    if (!levelTerparah) {
        _lastAlarmLevelSat = null;
        return;
    }

    if (_lastAlarmLevelSat === levelTerparah) return;
    _lastAlarmLevelSat = levelTerparah;

    const topWilayah = (triggerBahaya ? bahayaItems : waspadaItems)[0]?.namaPerairan || 'perairan Jawa Timur';
    const countAlert = triggerBahaya ? bahayaItems.length : waspadaItems.length;

    // Teks TTS — ringkas tanpa nama wilayah
    let teksTTS;
    if (typeof _isDemoActive !== 'undefined' && _isDemoActive) {
        // Mode demo: 1 kalimat singkat ~2 detik speech → total 5 detik
        teksTTS = levelTerparah === 'BAHAYA'
            ? `Perhatian, terjadi cuaca ekstrim, status bahaya.`
            : `Perhatian, terjadi cuaca ekstrim, status waspada.`;
    } else {
        teksTTS = levelTerparah === 'BAHAYA'
            ? `Perhatian, terjadi cuaca ekstrim, status bahaya.`
            : `Perhatian, terjadi cuaca ekstrim, status waspada.`;
    }

    const levelNumMap = { 'BAHAYA': 2, 'WASPADA': 1 };
    const lvlNum = levelNumMap[levelTerparah];

    const isDemo = (typeof _isDemoActive !== 'undefined' && _isDemoActive);
    if (typeof speakAndBroadcastNotification === 'function') {
        speakAndBroadcastNotification(teksTTS, lvlNum, [], isDemo);
    }
}

// ===== RENDER STATUS BAR ATAS (OVERRIDE DARI CUACA.JS) =====
function renderSatStatusBar(results, bahayaItems, waspadaItems) {
    const bar = document.getElementById('cuacaStatusBar');
    if (!bar) return;

    const triggerBahaya  = bahayaItems.some(r => r.pctBahaya  > 5);
    const triggerWaspada = waspadaItems.some(r => r.pctWaspada > 20);

    if (!triggerBahaya && !triggerWaspada) {
        return;
    }

    const levelTerparah = triggerBahaya ? 'BAHAYA' : 'WASPADA';
    const count = triggerBahaya ? bahayaItems.length : waspadaItems.length;
    const muteIcon = (typeof alarmMuted !== 'undefined' && alarmMuted) ? '🔇' : '🔔';

    bar.style.display = 'flex';
    bar.style.background = triggerBahaya
        ? 'linear-gradient(135deg, #b71c1c, #d32f2f)'
        : 'linear-gradient(135deg, #e65100, #f57c00)';

    bar.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <span style="font-size:16px; ${triggerBahaya ? 'animation:reko-flash 0.8s infinite;' : ''}">🛰️</span>
            <span style="font-size:12px; font-weight:700;">
                PERINGATAN AWAN — ${count} Perairan Terdampak (${levelTerparah})
            </span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">

            <button id="muteAlarmBtn" onclick="toggleMuteAlarm && toggleMuteAlarm()" style="
                background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3);
                color:white; border-radius:6px; padding:4px 8px; cursor:pointer;
                font-size:11px; font-weight:600; display:flex; align-items:center; gap:4px;
            ">${muteIcon} ${(typeof alarmMuted !== 'undefined' && alarmMuted) ? 'Unmute' : 'Mute'}</button>
        </div>`;
}

// ===== INISIALISASI & JADWAL ANALISIS =====
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .sat-wilmetos-label {
            transition: opacity 0.3s;
            min-width: 80px;
            max-width: 140px;
        }
        .sat-label-bahaya {
            animation: sat-label-pulse 1.5s ease-in-out infinite;
        }
        @keyframes sat-label-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255,23,68,0.4); }
            50% { box-shadow: 0 0 0 8px rgba(255,23,68,0); }
        }
        .wilmetos-alert-tooltip {
            background: rgba(0, 10, 20, 0.92) !important;
            border: 1px solid rgba(255,120,0,0.6) !important;
            border-radius: 8px !important;
            color: #fff !important;
            font-family: 'Segoe UI', sans-serif !important;
            padding: 6px 10px !important;
        }
        .sat-perairan-item:hover {
            background: rgba(0,229,255,0.08) !important;
        }
        #satPerairanContent::-webkit-scrollbar { width: 3px; }
        #satPerairanContent::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        #satPerairanContent::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.3); border-radius:2px; }
        
        /* Modal Riwayat Peringatan */
        #satRiwayatModal {
            position: fixed; top:0; left:0; width:100vw; height:100vh;
            background: rgba(3,7,18,0.80); backdrop-filter:blur(8px);
            z-index: 10001; display:none; align-items:center; justify-content:center;
        }
        #satRiwayatModal.active { display:flex; }
        .sat-riwayat-card {
            background: rgba(11,19,41,0.96);
            border: 1px solid rgba(0,229,255,0.35);
            border-radius: 14px; width: 92%; max-width: 720px;
            max-height: 80vh; display:flex; flex-direction:column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 20px rgba(0,229,255,0.15);
            color: #f0f6fc; overflow: hidden;
            animation: modal-fade 0.25s ease-out;
        }
        @keyframes modal-fade {
            from { opacity:0; transform:scale(0.95); }
            to   { opacity:1; transform:scale(1); }
        }
        .sat-riwayat-body { overflow-y:auto; flex:1; padding:10px 16px 16px; }
        .sat-riwayat-body::-webkit-scrollbar { width:4px; }
        .sat-riwayat-body::-webkit-scrollbar-thumb { background:rgba(0,229,255,0.3); border-radius:2px; }
        
        /* Demo mode badge */
        .demo-mode-badge {
            position: fixed; bottom: 70px; right: 15px;
            background: linear-gradient(135deg, #7b2ff7, #a855f7);
            color: white; border-radius: 20px; padding: 5px 12px;
            font-size: 11px; font-weight: 800; z-index: 1002;
            box-shadow: 0 0 15px rgba(123,47,247,0.5);
            animation: reko-flash 1.5s ease-in-out infinite;
            border: 1px solid rgba(168,85,247,0.5);
            letter-spacing: 0.5px;
        }
    `;
    document.head.appendChild(style);

    // Analisis awal saat halaman pertama dibuka (beri waktu 3.5 detik untuk load)
    // Analisis berikutnya akan dipicu otomatis oleh refreshSatelitImage() di satelit.js
    // setiap kali gambar satelit baru berhasil diunduh dan dimuat.
    setTimeout(runSatelliteAnalysis, 3500);
});

// ============================================================
// ===== SISTEM RIWAYAT PERINGATAN =====
// ============================================================

const RIWAYAT_KEY = 'sat_peringatan_riwayat';
const RIWAYAT_MAX = 200;

function simpanRiwayatPeringatan(results) {
    const alertResults = results.filter(r => r.level !== 'aman');
    if (alertResults.length === 0) return;

    let riwayat = [];
    try {
        riwayat = JSON.parse(localStorage.getItem(RIWAYAT_KEY) || '[]');
    } catch(e) { riwayat = []; }

    const now = new Date();
    const entry = {
        waktu: now.toISOString(),
        waktu_lokal: now.toLocaleString('id-ID', {
            day:'2-digit', month:'short', year:'numeric',
            hour:'2-digit', minute:'2-digit', second:'2-digit',
            timeZoneName:'short'
        }),
        sat_time: window.METADATA_SAT_DATA?.sat_time || null,
        peringatan: alertResults.map(r => ({
            id_mar: r.idMar,
            nama_perairan: r.namaPerairan,
            level: r.level,
            pct_bahaya: parseFloat(r.pctBahaya.toFixed(2)),
            pct_waspada: parseFloat(r.pctWaspada.toFixed(2)),
            total_pixel: r.total,
        })),
        ringkasan: {
            jumlah_bahaya: alertResults.filter(r => r.level === 'bahaya').length,
            jumlah_waspada: alertResults.filter(r => r.level === 'waspada').length,
        }
    };

    riwayat.unshift(entry); // tambah di awal (terbaru dulu)
    if (riwayat.length > RIWAYAT_MAX) riwayat = riwayat.slice(0, RIWAYAT_MAX);

    try {
        localStorage.setItem(RIWAYAT_KEY, JSON.stringify(riwayat));
    } catch(e) {
        console.warn('[Riwayat] Gagal simpan ke localStorage:', e.message);
    }
}

function tampilkanModalRiwayat() {
    let riwayat = [];
    try {
        riwayat = JSON.parse(localStorage.getItem(RIWAYAT_KEY) || '[]');
    } catch(e) { riwayat = []; }

    const modal = document.getElementById('satRiwayatModal');
    if (!modal) return;

    const body = modal.querySelector('.sat-riwayat-body');
    if (!body) return;

    if (riwayat.length === 0) {
        body.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-sub);">
            <div style="font-size:36px; margin-bottom:10px;">📭</div>
            <div style="font-size:13px;">Belum ada riwayat peringatan tersimpan.</div>
            <div style="font-size:11px; margin-top:5px;">Riwayat disimpan otomatis saat ada awan waspada/bahaya terdeteksi.</div>
        </div>`;
    } else {
        body.innerHTML = riwayat.map((entry, idx) => {
            const levelMax = entry.ringkasan.jumlah_bahaya > 0 ? 'bahaya' : 'waspada';
            const info = getSatLevelInfo(levelMax);
            const peringatanHtml = entry.peringatan.map(p => {
                const pi = getSatLevelInfo(p.level);
                return `<div style="display:flex; justify-content:space-between; align-items:center;
                    padding:4px 8px; background:${pi.bg}; border-radius:5px; margin-bottom:3px;
                    border-left:3px solid ${pi.borderColor}; font-size:10px;">
                    <span style="font-weight:700; color:${pi.color};">${pi.icon} ${p.nama_perairan}</span>
                    <span style="color:#aaa;">${p.id_mar}</span>
                    <div style="text-align:right;">
                        ${p.pct_bahaya > 0 ? `<span style="color:#ff1744;">🔴${p.pct_bahaya}%</span> ` : ''}
                        ${p.pct_waspada > 0.5 ? `<span style="color:#ff9800;">🟠${p.pct_waspada}%</span>` : ''}
                    </div>
                </div>`;
            }).join('');

            return `
            <div style="margin-bottom:12px; border:1px solid rgba(255,255,255,0.07);
                border-radius:10px; overflow:hidden;">
                <div style="background:${info.bg}; border-bottom:1px solid ${info.borderColor}30;
                    padding:8px 12px; display:flex; align-items:center; justify-content:space-between;">
                    <div style="font-size:12px; font-weight:800; color:${info.color};">
                        ${info.icon} ${entry.ringkasan.jumlah_bahaya > 0 ? 'BAHAYA' : 'WASPADA'}
                        — ${entry.peringatan.length} Perairan
                    </div>
                    <div style="font-size:10px; color:var(--text-sub);">${entry.waktu_lokal}</div>
                </div>
                <div style="padding:8px 12px;">${peringatanHtml}</div>
            </div>`;
        }).join('');
    }

    modal.classList.add('active');
}

function tutupModalRiwayat() {
    const modal = document.getElementById('satRiwayatModal');
    if (modal) modal.classList.remove('active');
}

function downloadRiwayatJSON() {
    let riwayat = [];
    try {
        riwayat = JSON.parse(localStorage.getItem(RIWAYAT_KEY) || '[]');
    } catch(e) { riwayat = []; }

    const now = new Date();
    const exportData = {
        ekspor_pada: now.toISOString(),
        sistem: 'BMKG Jatim - Analisis Pixel Citra Satelit EH',
        total_entri: riwayat.length,
        riwayat_peringatan: riwayat,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riwayat_peringatan_${now.toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function hapusRiwayat() {
    if (!confirm('Hapus semua riwayat peringatan? Tindakan ini tidak dapat dibatalkan.')) return;
    localStorage.removeItem(RIWAYAT_KEY);
    tampilkanModalRiwayat(); // Refresh modal
}

const _origTriggerSatAlarm = triggerSatAlarm;
window.triggerSatAlarm = function(results) {
    simpanRiwayatPeringatan(results);
    _origTriggerSatAlarm(results);
};

// ============================================================
// ===== MODE DEMO (SIMULASI DATA CLOUD PIXEL) =====
// ============================================================

let _isDemoMode   = false;
let _isDemoActive = false; // Flag global: demo sedang berjalan (untuk memperpendek TTS)
let _demoTimer    = null;

// Satu skenario demo: 1 lokasi BAHAYA untuk menampilkan pengumuman 5 detik
const _DEMO_SCENARIOS = [
    {
        label: 'Demo: BAHAYA — Selat Karimata',
        desc: 'Simulasi awan merah (bahaya) di 1 wilayah — pengumuman 5 detik',
        data: [
            { idMar: 'P.O.EXT1', level: 'bahaya', pctBahaya: 18.5, pctWaspada: 41.2 },
        ]
    },
];
let _demoScenarioIdx = 0;

function aktivasiDemoMode() {
    _isDemoMode   = true;
    _isDemoActive = true;
    _demoScenarioIdx = 0;

    let badge = document.getElementById('demoBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'demoBadge';
        badge.className = 'demo-mode-badge';
        badge.innerHTML = '🎭 MODE DEMO — 5 Detik';
        document.body.appendChild(badge);
    }
    badge.style.display = 'block';

    jalankanDemoSkenario();
}

function jalankanDemoSkenario() {
    if (!_isDemoMode) return;
    const skenario = _DEMO_SCENARIOS[_demoScenarioIdx];
    if (!skenario) { nonaktifkanDemoMode(); return; }

    console.log(`[Demo] Menjalankan: ${skenario.label}`);

    if (typeof WILMETOS_JATIM_DATA === 'undefined') {
        console.error('[Demo] WILMETOS_JATIM_DATA tidak tersedia');
        return;
    }

    const demoMap = {};
    for (const d of skenario.data) demoMap[d.idMar] = d;

    const mockResults = WILMETOS_JATIM_DATA.features.map(feature => {
        const id = feature.properties?.ID_MAR || '';
        const nama = feature.properties?.perairan || 'Wilayah Perairan';
        const override = demoMap[id];
        if (override) {
            return {
                namaPerairan: nama, idMar: id, feature,
                total: 5000, waspada: Math.round(override.pctWaspada * 50),
                bahaya: Math.round(override.pctBahaya * 50),
                pctWaspada: override.pctWaspada, pctBahaya: override.pctBahaya,
                level: override.level,
            };
        }
        return {
            namaPerairan: nama, idMar: id, feature,
            total: 5000, waspada: 0, bahaya: 0,
            pctWaspada: 0, pctBahaya: 0, level: 'aman',
        };
    });

    _satAnalysisResults = mockResults;

    const timeEl = document.getElementById('satAnalysisTime');
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = '🎭 Demo ' + now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    }

    renderSatAnalysisPanel(mockResults);
    renderWilmotosAlerts(mockResults);
    triggerSatAlarm(mockResults);

    const panel = document.getElementById('satPerairanContent');
    if (panel) {
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `
            background:rgba(123,47,247,0.15); border:1px solid rgba(168,85,247,0.4);
            border-radius:7px; padding:8px 10px; margin-bottom:8px; font-size:10px;
            color:#c084fc; font-weight:600;`;
        infoDiv.innerHTML = `🎭 ${skenario.label}<br><span style="opacity:0.7;font-weight:400;">${skenario.desc}</span>`;
        panel.insertBefore(infoDiv, panel.firstChild);
    }

    _demoScenarioIdx++;
    // Hanya 1 skenario — matikan demo otomatis setelah 6 detik (5 detik audio + 1 detik buffer)
    _demoTimer = setTimeout(nonaktifkanDemoMode, 6000);
}

function nonaktifkanDemoMode() {
    _isDemoMode   = false;
    _isDemoActive = false;
    if (_demoTimer) { clearTimeout(_demoTimer); _demoTimer = null; }

    const badge = document.getElementById('demoBadge');
    if (badge) badge.style.display = 'none';

    _lastAlarmLevelSat = null;
    _satAnalysisResults = [];

    console.log('[Demo] Mode demo selesai. Menjalankan analisis real...');
    runSatelliteAnalysis();
}

window.aktivasiDemoMode = aktivasiDemoMode;
window.nonaktifkanDemoMode = nonaktifkanDemoMode;
window.tampilkanModalRiwayat = tampilkanModalRiwayat;
window.tutupModalRiwayat = tutupModalRiwayat;
window.downloadRiwayatJSON = downloadRiwayatJSON;
window.hapusRiwayat = hapusRiwayat;
window.focusSatItem = focusSatItem;

