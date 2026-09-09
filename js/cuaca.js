// ============================================================
// ============================================================

// ===== DAFTAR PELABUHAN PERIKANAN & PESISIR JAWA TIMUR =====
const DAFTAR_PELABUHAN = [
    { nama: "PPN Brondong",       kab: "Lamongan",    adm4: "35.24.01.1001", lat: -6.8803, lon: 112.2987, tipe: "PPN", arahLaut: [270, 90] }, // Utara
    { nama: "PPN Prigi",          kab: "Trenggalek",  adm4: "35.73.01.1001", lat: -8.2853, lon: 111.7300, tipe: "PPN", arahLaut: [90, 270] }, // Selatan (Fallback ke Malang)
    { nama: "PPP Muncar",         kab: "Banyuwangi",  adm4: "35.10.01.1001", lat: -8.4367, lon: 114.3350, tipe: "PPP", arahLaut: [0, 180] }, // Timur
    { nama: "PPP Sendang Biru",   kab: "Malang",      adm4: "35.73.01.1001", lat: -8.4332, lon: 112.6845, tipe: "PPP", arahLaut: [90, 270] }, // Selatan
    { nama: "Pel. Gresik",        kab: "Gresik",      adm4: "35.25.01.1001", lat: -7.1558, lon: 112.6622, tipe: "PEL", arahLaut: [315, 135] }, // Timur/Utara
    { nama: "Tanjung Perak",      kab: "Surabaya",    adm4: "35.78.01.1001", lat: -7.1969, lon: 112.7330, tipe: "PEL", arahLaut: [270, 90] }, // Utara
    { nama: "Pel. Kamal",         kab: "Bangkalan",   adm4: "35.28.01.1001", lat: -7.1748, lon: 112.7221, tipe: "PEL", arahLaut: [135, 315] }, // Selatan/Barat
    { nama: "Pesisir Tuban",      kab: "Tuban",       adm4: "35.23.01.1001", lat: -6.8999, lon: 112.0500, tipe: "PSR", arahLaut: [270, 90] }, // Utara
    { nama: "Pesisir Pasuruan",   kab: "Pasuruan",    adm4: "35.14.01.2001", lat: -7.6290, lon: 112.8990, tipe: "PSR", arahLaut: [270, 90] }, // Utara
    { nama: "Pesisir Situbondo",  kab: "Situbondo",   adm4: "35.14.01.2001", lat: -7.7058, lon: 114.0097, tipe: "PSR", arahLaut: [270, 90] }, // Utara (Fallback ke Pasuruan)
    { nama: "Pesisir Probolinggo",kab: "Probolinggo", adm4: "35.72.01.1001", lat: -7.7350, lon: 113.2200, tipe: "PSR", arahLaut: [270, 90] }, // Utara
    { nama: "Pesisir Pamekasan",  kab: "Pamekasan",   adm4: "35.29.01.1001", lat: -7.1585, lon: 113.4722, tipe: "PSR", arahLaut: [90, 270] }, // Selatan
    { nama: "Pesisir Sumenep",    kab: "Sumenep",     adm4: "35.29.01.1001", lat: -7.0167, lon: 113.8500, tipe: "PSR", arahLaut: [0, 210] }, // Timur/Selatan (Fallback ke Pamekasan)
];

// ===== KONSTANTA =====
const RADIUS_60_MIL_METER = 60 * 1852; // 60 mil laut = 111,120 meter
const REFRESH_INTERVAL_MS = 600000; // 10 menit

const WEATHER_BURUK_CODES = [60, 61, 63, 65, 80, 95, 97];
const KEYWORD_BURUK = [
    "hujan lebat", "hujan petir", "badai", "hujan deras",
    "hujan sangat lebat", "petir", "guntur",
    "hujan sedang", "hujan ringan", "hujan lokal",
];

// ===== VARIABEL GLOBAL =====
let cuacaAllData = []; // Data semua pelabuhan (termasuk aman)
let cuacaMarkerGroup = null;
let radiusLayerGroup = null;
let pelabuhanMarkerGroup = null;
let lastAlarmLevel = null;
let alarmMuted = localStorage.getItem('cuacaAlarmMuted') === 'true';
let audioCtx = null;

// ===== INISIALISASI LAYER =====
function initCuacaLayers() {
    cuacaMarkerGroup = L.layerGroup().addTo(map);
    radiusLayerGroup = L.layerGroup().addTo(map);
    pelabuhanMarkerGroup = L.layerGroup().addTo(map);
    renderWilayahKerja();
    renderPelabuhanMarkers();
}

// ===== RENDER WILAYAH KERJA DARI DATA WILMETOS (embedded JS) =====
function renderWilayahKerja() {
    radiusLayerGroup.clearLayers();

    if (typeof WILMETOS_JATIM_DATA === 'undefined') {
        console.error('[Wilmetos] Data tidak ditemukan. Pastikan js/wilmetos_data.js sudah dimuat.');
        return;
    }

    L.geoJSON(WILMETOS_JATIM_DATA, {
        style: {
            color: '#00e5ff',
            weight: 1.5,
            dashArray: '6, 4',
            fillColor: '#00bcd4',
            fillOpacity: 0.07,
            opacity: 0.7
        },
        onEachFeature: function(feature, layer) {
            const prop = feature.properties || {};
            const namaPerairan = prop.perairan || prop.PERAIRAN || 'Wilayah Perairan';
            const idMar = prop.ID_MAR || '';

            layer.bindTooltip(
                `<div style="font-family:'Segoe UI',sans-serif; font-size:11px; font-weight:700; color:#00e5ff;">
                    🌊 ${namaPerairan}
                    ${idMar ? `<br><span style="font-size:9px; opacity:0.75; font-weight:400;">${idMar}</span>` : ''}
                </div>`,
                { sticky: true, className: 'wilmetos-tooltip', opacity: 0.95 }
            );
        }
    }).addTo(radiusLayerGroup);
}


// ===== RENDER MARKER PELABUHAN =====
function renderPelabuhanMarkers() {
    pelabuhanMarkerGroup.clearLayers();
    DAFTAR_PELABUHAN.forEach(p => {
        const tipeLabel = p.tipe === "PPN" ? "Pel. Perikanan Nusantara" :
                          p.tipe === "PPP" ? "Pel. Perikanan Pantai" :
                          p.tipe === "PEL" ? "Pelabuhan Umum" : "Pesisir Nelayan";
        const icon = L.divIcon({
            className: '',
            html: `<div style="font-size:18px; text-align:center; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.7)); cursor:pointer;">⚓</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });
        const m = L.marker([p.lat, p.lon], { icon }).addTo(pelabuhanMarkerGroup);
        m.bindPopup(`<b>⚓ ${p.nama}</b><br>${tipeLabel}<br>📍 ${p.kab}, Jawa Timur`);
    });
}

// ===== CEK CUACA BURUK =====
function isCuacaBuruk(item) {
    const desc = (item.weather_desc || "").toLowerCase();
    const kode = item.weather || 0;
    const ws = item.ws || 0; // km/jam dari BMKG

    for (const kw of KEYWORD_BURUK) {
        if (desc.includes(kw)) return true;
    }
    if (WEATHER_BURUK_CODES.includes(kode)) return true;
    if (ws >= 40) return true;

    return false;
}

// ===== LEVEL BAHAYA KHUSUS NELAYAN =====
function getTingkatNelayan(item) {
    const desc = (item.weather_desc || "").toLowerCase();
    const ws = item.ws || 0;     // km/jam
    const vs = item.vs || 99999; // meter

    if (ws > 60 || desc.includes("petir") || desc.includes("badai") || desc.includes("sangat lebat")) {
        return {
            level: "DILARANG", label: "DILARANG MELAUT",
            color: "#dc3545", bg: "rgba(220,53,69,0.12)",
            icon: "🔴", cuacaIcon: "⛈️",
            pesan: "Segera kembali ke pelabuhan!",
        };
    }
    if (ws > 40 || desc.includes("hujan lebat") || desc.includes("hujan deras")) {
        return {
            level: "BERBAHAYA", label: "TIDAK AMAN MELAUT",
            color: "#ff6b00", bg: "rgba(255,107,0,0.12)",
            icon: "🟠", cuacaIcon: "🌧️",
            pesan: "Kembali ke pelabuhan!",
        };
    }
    if (ws > 20 || desc.includes("hujan")) {
        return {
            level: "WASPADA", label: "HATI-HATI MELAUT",
            color: "#ffc107", bg: "rgba(255,193,7,0.12)",
            icon: "🟡", cuacaIcon: "🌦️",
            pesan: "Pantau perubahan cuaca",
        };
    }
    return {
        level: "AMAN", label: "AMAN MELAUT",
        color: "#4caf50", bg: "rgba(76,175,80,0.12)",
        icon: "🟢", cuacaIcon: "☀️",
        pesan: "Kondisi cuaca mendukung",
    };
}

// ===== FETCH DATA DARI BMKG API =====
async function fetchCuacaNelayan() {
    const sekarang = new Date();
    const hasilSemua = [];

    const promises = DAFTAR_PELABUHAN.map(async (pel) => {
        try {
            const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${pel.adm4}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) {
                hasilSemua.push({
                    ...pel, cuacaDesc: "Data tidak tersedia", tingkat: getTingkatNelayan({}),
                    angin: null, arahAngin: "-", jarakPandang: "-", suhu: null,
                    kelembapan: null, selisihJam: 0, waktuLokal: null, isBuruk: false,
                    tidakAdaData: true,
                });
                return;
            }
            const json = await res.json();
            const dataLokasi = json.data?.[0];
            if (!dataLokasi) return;

            const allCuaca = dataLokasi.cuaca?.flat() || [];

            let terdekat = null;
            let terdekatDiff = Infinity;
            let terburuk = null;
            let terburukScore = -1;

            for (const item of allCuaca) {
                const waktuData = new Date(item.utc_datetime + 'Z');
                const selisihJam = (waktuData - sekarang) / 3600000;
                if (selisihJam < -3 || selisihJam > 12) continue;

                const diff = Math.abs(selisihJam);
                if (diff < terdekatDiff) {
                    terdekatDiff = diff;
                    terdekat = { ...item, selisihJam };
                }

                if (isCuacaBuruk(item)) {
                    const score = (item.ws || 0) + (item.weather >= 60 ? 50 : 0);
                    if (score > terburukScore) {
                        terburukScore = score;
                        terburuk = { ...item, selisihJam };
                    }
                }
            }

            const dipilih = terburuk || terdekat;
            if (!dipilih) return;

            const tingkat = getTingkatNelayan(dipilih);
            const buruk = isCuacaBuruk(dipilih);

            hasilSemua.push({
                nama: pel.nama,
                kab: pel.kab,
                tipe: pel.tipe,
                lat: pel.lat,
                lon: pel.lon,
                adm4: pel.adm4,
                cuacaDesc: dipilih.weather_desc || "-",
                angin: dipilih.ws,
                arahAngin: dipilih.wd || "-",
                jarakPandang: dipilih.vs_text || "-",
                jarakPandangM: dipilih.vs || 99999,
                suhu: dipilih.t,
                kelembapan: dipilih.hu,
                tingkat: tingkat,
                selisihJam: dipilih.selisihJam,
                waktuLokal: dipilih.local_datetime,
                isBuruk: buruk,
                tidakAdaData: false,
            });
        } catch (e) {
            console.warn(`[Cuaca Nelayan] Gagal fetch ${pel.nama}:`, e.message);
            hasilSemua.push({
                ...pel, cuacaDesc: "Gagal memuat", tingkat: getTingkatNelayan({}),
                angin: null, arahAngin: "-", jarakPandang: "-", suhu: null,
                kelembapan: null, selisihJam: 0, waktuLokal: null, isBuruk: false,
                tidakAdaData: true,
            });
        }
    });

    await Promise.allSettled(promises);

    const levelOrder = { "DILARANG": 0, "BERBAHAYA": 1, "WASPADA": 2, "AMAN": 3 };
    hasilSemua.sort((a, b) => {
        return (levelOrder[a.tingkat.level] || 9) - (levelOrder[b.tingkat.level] || 9);
    });

    cuacaAllData = hasilSemua;
    return hasilSemua;
}

// ===== RENDER PANEL UTAMA =====
function renderPanelNelayan(data) {
    const panel = document.getElementById('cuacaPanelContent');
    if (!panel) return;

    const bahaya = data.find(d => d.isBuruk);

    if (!bahaya) {
        panel.innerHTML = `
            <div style="text-align:center; padding: 8px 0;">
                <div style="font-size: 32px; margin-bottom: 4px;">☀️</div>
                <div style="font-size: 13px; font-weight: 700; color: #00e676; margin-bottom: 2px;">Cuaca Kondusif</div>
                <div style="font-size: 11px; color: var(--text-sub);">Tidak ada cuaca buruk terdeteksi</div>
            </div>
            <div style="
                background: rgba(0, 230, 118, 0.12); border: 1.5 solid #00e676;
                border-radius: 8px; padding: 10px; margin-top: 8px;
                text-align: center;
            ">
                <div style="font-size: 13px; font-weight: 900; color: #00e676;">🟢 AMAN MELAUT</div>
                <div style="font-size: 10px; color: #b9f6ca; margin-top: 2px;">Kondisi cuaca mendukung untuk pelayaran</div>
            </div>`;
        return;
    }

    const t = bahaya.tingkat;
    const selisihMenit = Math.round(Math.abs(bahaya.selisihJam) * 60);
    const keteranganWaktu = bahaya.selisihJam < 0
        ? `${selisihMenit} menit lalu`
        : `${selisihMenit} menit ke depan`;

    panel.innerHTML = `
        <div style="display: flex; gap: 10px; align-items: flex-start;">
            <div style="
                background: ${t.color}; color: white; border-radius: 8px;
                padding: 8px 10px; text-align: center; min-width: 60px;
                flex-shrink: 0; box-shadow: 0 0 15px ${t.color}60;
            ">
                <div style="font-size: 22px;">${t.cuacaIcon}</div>
                <div style="font-size: 8px; font-weight: 900; margin-top: 3px; letter-spacing: 0.5px;">${t.level}</div>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13px; font-weight: 700; color: ${t.color}; margin-bottom: 2px;">
                    ${bahaya.cuacaDesc}
                </div>
                <div style="font-size: 10px; color: var(--text-sub);">⏱ ${keteranganWaktu}</div>
                <div style="font-size: 11px; color: #fff; margin-top: 4px;">
                    📍 <b>${bahaya.nama}</b>, ${bahaya.kab}
                </div>
            </div>
        </div>

        <div style="
            background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 8px 10px;
            margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr;
            gap: 4px 12px; font-size: 11px; color: #e6edf3;
        ">
            <div>💨 <b style="color:var(--text-sub);">Angin</b></div>
            <div style="font-weight:700; color: ${(bahaya.angin||0) >= 40 ? '#ff5252' : '#00e5ff'};">
                ${bahaya.angin != null ? bahaya.angin.toFixed(0) + ' km/h ' + bahaya.arahAngin : '-'}
            </div>
            <div>👁️ <b style="color:var(--text-sub);">Pandang</b></div>
            <div style="font-weight:700;">${bahaya.jarakPandang}</div>
            <div>🌡️ <b style="color:var(--text-sub);">Suhu</b></div>
            <div style="font-weight:700;">${bahaya.suhu != null ? bahaya.suhu + '°C' : '-'}</div>
            <div>💧 <b style="color:var(--text-sub);">Lembap</b></div>
            <div style="font-weight:700;">${bahaya.kelembapan != null ? bahaya.kelembapan + '%' : '-'}</div>
        </div>

        <div style="
            background: ${t.bg}; border: 1px solid ${t.color};
            border-radius: 8px; padding: 8px 10px; margin-top: 8px;
            text-align: center;
            ${t.level === 'DILARANG' ? 'animation: reko-flash 1s ease-in-out infinite;' : ''}
        ">
            <div style="font-size: 13px; font-weight: 900; color: ${t.color};">
                ${t.icon} ${t.label}
            </div>
            <div style="font-size: 10px; color: ${t.color}; margin-top: 2px; opacity:0.9;">
                ${t.pesan}
            </div>
        </div>`;
}

// ===== RENDER DAFTAR SEMUA PELABUHAN =====
function renderDaftarPelabuhan(data) {
    const el = document.getElementById('cuacaListContent');
    const badge = document.getElementById('cuacaCountBadge');
    if (!el) return;

    const bahayaCount = data.filter(d => d.isBuruk).length;
    if (badge) {
        badge.textContent = bahayaCount;
        badge.style.display = bahayaCount > 0 ? 'inline-flex' : 'none';
    }

    if (!data || data.length === 0) {
        el.innerHTML = `<div style="font-size:11px; color:var(--text-sub); text-align:center; padding:8px;">Memuat data...</div>`;
        return;
    }

    el.innerHTML = data.map(item => {
        const t = item.tingkat;
        const anginTxt = item.angin != null ? `${item.angin.toFixed(0)} km/h` : '-';
        return `
        <div class="cuaca-list-item" onclick="focusCuacaItem(${item.lat}, ${item.lon})" style="
            display:flex; align-items:center; gap:6px;
            padding:6px 8px; border-radius:6px; margin-bottom:4px;
            cursor:pointer; background: rgba(255,255,255,0.04);
            border-left:3px solid ${t.color}; border-top:1px solid rgba(255,255,255,0.05); transition:all 0.15s;
        " onmouseover="this.style.background='rgba(0,229,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
            <div style="font-size:12px; flex-shrink:0;">${t.icon}</div>
            <div style="flex:1; min-width:0;">
                <div style="font-size:11px; font-weight:700; color:#f0f6fc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.nama}</div>
                <div style="font-size:9px; color:var(--text-sub);">${item.cuacaDesc} · 💨${anginTxt}</div>
            </div>
            <div style="
                background:${t.color}; color:white; font-size:7px; font-weight:900;
                padding:2px 5px; border-radius:3px; white-space:nowrap; flex-shrink:0;
            ">${t.level}</div>
        </div>`;
    }).join('');
}

// ===== RENDER BAR STATUS ATAS =====
function renderStatusBar(data) {
    let bar = document.getElementById('cuacaStatusBar');
    if (!bar) return;

    if (typeof _satAnalysisResults !== 'undefined' && _satAnalysisResults.length > 0) {
        const hasSatAlert = _satAnalysisResults.some(r => r.level === 'waspada' || r.level === 'bahaya');
        if (hasSatAlert) return; // Satelit sudah menampilkan bar peringatan
    }

    const bahayaList = data.filter(d => d.isBuruk);
    const count = bahayaList.length;

    if (count === 0) {
        bar.style.display = 'none';
        return;
    }

    const terparah = bahayaList[0]?.tingkat;
    bar.style.display = 'flex';
    bar.style.background = terparah.level === 'DILARANG'
        ? 'linear-gradient(135deg, #b71c1c, #d32f2f)'
        : terparah.level === 'BERBAHAYA'
        ? 'linear-gradient(135deg, #e65100, #f57c00)'
        : 'linear-gradient(135deg, #f9a825, #fbc02d)';

    const muteIcon = alarmMuted ? '🔇' : '🔔';
    bar.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <span style="font-size:16px; ${terparah.level === 'DILARANG' ? 'animation:reko-flash 0.8s infinite;' : ''}">⚠️</span>
            <span style="font-size:12px; font-weight:700;">
                PERINGATAN CUACA — ${count} Lokasi Terdampak
            </span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">

            <button id="muteAlarmBtn" onclick="toggleMuteAlarm()" style="
                background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3);
                color:white; border-radius:6px; padding:4px 8px; cursor:pointer;
                font-size:11px; font-weight:600; display:flex; align-items:center; gap:4px;
            ">${muteIcon} ${alarmMuted ? 'Unmute' : 'Mute'}</button>
        </div>`;
}

// ===== RENDER CUACA MARKERS DI PETA =====
function renderCuacaMarkersPeta(data) {
    if (cuacaMarkerGroup) cuacaMarkerGroup.clearLayers();
}

// ===== SISTEM AUDIO PERINGATAN (SIRENE MP3 + TTS NARASI) =====

// --- Preload objek Audio sirene ---
const _sirenAudio = {
    dilarang: new Audio('doorbell_waspada.mp3'),
    berbahaya: new Audio('doorbell_waspada.mp3'),
    waspada:   new Audio('doorbell_waspada.mp3'),
};
Object.values(_sirenAudio).forEach(a => { a.volume = 0.85; a.preload = 'auto'; });

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}
window.addEventListener('click', unlockAudio, { passive: true });
window.addEventListener('touchstart', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio, { passive: true });

/**
 * Memutar file sirene MP3 dengan batas durasi maksimal (default 2.5 detik).
 * Mengembalikan Promise yang resolve setelah sirene selesai atau dipotong.
 * @param {'dilarang'|'berbahaya'|'waspada'} level
 * @param {number} maxMs - Durasi batas sirene dalam milidetik (default 2500ms)
 */
function playSireneMp3Limit(level, maxMs = 2500) {
    if (alarmMuted) return Promise.resolve();
    return new Promise((resolve) => {
        const audio = _sirenAudio[level];
        if (!audio) { resolve(); return; }
        try { audio.pause(); audio.currentTime = 0; } catch(e) {}
        
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            audio.removeEventListener('ended', finish);
            audio.removeEventListener('error', finish);
            resolve();
        };

        audio.addEventListener('ended', finish);
        audio.addEventListener('error', finish);
        audio.play().catch(() => { finish(); });

        setTimeout(finish, maxMs);
    });
}

function playSireneMp3(level) {
    return playSireneMp3Limit(level, 2500);
}

function playBeep(freq, duration, count, gap) {
    if (alarmMuted) return;
    const ctx = getAudioContext();
    let startTime = ctx.currentTime;
    for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
        startTime += duration + gap;
    }
}

function playSirene() {
    if (alarmMuted) return;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 1);
    osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 2);
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 3);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 3.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 3.5);
}

function getAffectedAreaIndices() {
    const indices = [];
    (cuacaAllData || []).forEach(item => {
        if (item.isBuruk) {
            const idx = DAFTAR_PELABUHAN.findIndex(p => p.nama === item.nama || p.adm4 === item.adm4);
            if (idx !== -1 && !indices.includes(idx)) {
                indices.push(idx);
            }
        }
    });
    return indices;
}

/**
 * Buat teks narasi TTS ringkas TANPA nama wilayah.
 * Contoh: "Perhatian, terjadi cuaca ekstrim, status waspada."
 * @param {string} levelTerparah - 'DILARANG'|'BERBAHAYA'|'WASPADA'
 * @returns {string} Teks narasi
 */
function buatTeksNarasi10Detik(levelTerparah, bahayaItems) {
    if (levelTerparah === 'DILARANG') {
        return `Perhatian, terjadi cuaca ekstrim, status bahaya. Dilarang melaut.`;
    } else if (levelTerparah === 'BERBAHAYA') {
        return `Perhatian, terjadi cuaca ekstrim, status bahaya.`;
    } else { // WASPADA
        return `Perhatian, terjadi cuaca ekstrim, status waspada.`;
    }
}

// ===== TEXT-TO-SPEECH (TTS) BROWSER — VOICE SYNTHESIZER =====
let _selectedTtsVoice = null;
let _ttsVoicesLoaded = false;

function loadBestTtsVoice() {
    if (_ttsVoicesLoaded) return;
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (voices.length === 0) return;
    _ttsVoicesLoaded = true;

    const priority = [
        v => v.name.toLowerCase().includes('google') && v.lang.startsWith('id'),
        v => v.name.toLowerCase().includes('microsoft') && v.lang.startsWith('id'),
        v => v.name.toLowerCase().includes('indonesia'),
        v => v.lang.startsWith('id'),
    ];
    for (const cond of priority) {
        const match = voices.find(cond);
        if (match) {
            _selectedTtsVoice = match;
            console.log(`[TTS Voice] Menggunakan suara: "${match.name}" (${match.lang})`);
            return;
        }
    }
    console.warn('[TTS Voice] Tidak ada suara Bahasa Indonesia ditemukan, menggunakan suara default browser.');
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', loadBestTtsVoice);
    setTimeout(loadBestTtsVoice, 500);
}

function speakTextTTS(teks, onStartCallback, onEndCallback) {
    if (!('speechSynthesis' in window)) {
        if (typeof onStartCallback === 'function') onStartCallback();
        if (typeof onEndCallback === 'function') onEndCallback();
        return;
    }
    try {
        loadBestTtsVoice();
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(teks);
        utterance.lang = 'id-ID';
        utterance.rate = 1.0;     // Kecepatan normal agar pas ~6 detik bicara
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (_selectedTtsVoice) utterance.voice = _selectedTtsVoice;

        let startFired = false;
        utterance.onstart = () => {
            startFired = true;
            if (typeof onStartCallback === 'function') onStartCallback();
        };
        utterance.onend = () => {
            if (typeof onEndCallback === 'function') onEndCallback();
        };
        utterance.onerror = () => {
            if (!startFired && typeof onStartCallback === 'function') onStartCallback();
            if (typeof onEndCallback === 'function') onEndCallback();
        };

        window.speechSynthesis.speak(utterance);

        setTimeout(() => {
            if (!startFired) {
                startFired = true;
                if (typeof onStartCallback === 'function') onStartCallback();
            }
        }, 300);
    } catch(e) {
        if (typeof onStartCallback === 'function') onStartCallback();
        if (typeof onEndCallback === 'function') onEndCallback();
    }
}

/**
 * Urutan audio presisi:
 * MODE NORMAL (isDemo=false) — Total 8 Detik:
 *   T=0.0s : Sirene & Arduino mulai bersamaan
 *   T=3.0s : Sirene selesai (dipotong max 3s)
 *   T=3.2s : TTS Narasi mulai (~4.8s)
 *   T=8.0s : Master Hard-Timer mematikan audio/TTS
 *
 * MODE DEMO (isDemo=true) — Total 5 Detik:
 *   T=0.0s : Sirene & Arduino mulai bersamaan
 *   T=1.0s : Sirene selesai (dipotong max 1s)
 *   T=1.2s : TTS Narasi mulai (~3s)
 *   T=5.0s : Master Hard-Timer mematikan segalanya
 */
window._isAlarmPlaying = false;

function playSireneKemudianNarasi(teks, sirenLevel, arduinoCmd, onDone, isDemo) {
    if (alarmMuted) { if (typeof onDone === 'function') onDone(); return; }
    if (window._isAlarmPlaying) { if (typeof onDone === 'function') onDone(); return; }

    window._isAlarmPlaying = true;
    unlockAudio();

    let finished = false;
    const cleanup = () => {
        if (finished) return;
        finished = true;
        window._isAlarmPlaying = false;
        try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch(e) {}
        if (typeof onDone === 'function') onDone();
    };

    // Master timer: hanya fallback jika TTS macet/tidak ada respons.
    // TTS sendiri akan clearTimeout(masterTimer) saat selesai bicara,
    // sehingga total audio bisa selesai ~8 detik secara alami.
    // Normal: 15s fallback | Demo: 8s fallback
    const masterDurasi = isDemo ? 8000 : 15000;
    const masterTimer  = setTimeout(cleanup, masterDurasi);

    if (arduinoCmd && typeof sendCommandToArduino === 'function') {
        console.log(`[Arduino] Mengirim perintah di T=0: ${arduinoCmd}`);
        sendCommandToArduino(arduinoCmd);
    }

    // Sirene: 1 detik saat demo, 3 detik saat normal
    const sireneDurasi = isDemo ? 1000 : 3000;
    playSireneMp3Limit(sirenLevel, sireneDurasi).then(() => {
        if (finished) return;
        setTimeout(() => {
            if (finished) return;
            speakTextTTS(teks, null, () => {
                clearTimeout(masterTimer);
                cleanup();
            });
        }, 200);
    });
}

/**
 * Fungsi terpadu: Sirene MP3 + Arduino (T=0) → TTS Narasi (setelah sirene)
 * isDemo=true : sirene 1 detik + TTS ~3 detik = total 5 detik
 * isDemo=false : sirene 3 detik + TTS ~5 detik = total 8 detik (default)
 */
function speakAndBroadcastNotification(teks, levelNum, areaIndices, isDemo) {
    const areaStr    = (areaIndices && areaIndices.length > 0) ? areaIndices.join(',') : '0';
    const sirenMap   = { 1: 'waspada', 2: 'berbahaya', 3: 'dilarang' };
    const sirenLevel = sirenMap[levelNum] || 'waspada';
    const cmdStr     = `CUACA,${levelNum},1,${areaStr}`;

    console.log(`[Notification] T=0: Sirene '${sirenLevel}' + Arduino '${cmdStr}' → TTS (${isDemo ? '5 detik DEMO' : '8 detik normal'})`);

    playSireneKemudianNarasi(teks, sirenLevel, cmdStr, null, isDemo);
}


function triggerAlarm(levelTerparah) {
    if (alarmMuted) return;
    if (lastAlarmLevel === levelTerparah) return;
    lastAlarmLevel = levelTerparah;

    const levelNumMap = { 'DILARANG': 3, 'BERBAHAYA': 2, 'WASPADA': 1 };
    const lvlNum = levelNumMap[levelTerparah];
    if (!lvlNum) return;

    const bahayaItems = (cuacaAllData || []).filter(d => d.isBuruk);
    const areaIndices = getAffectedAreaIndices();

    const teksWarn = buatTeksNarasi10Detik(levelTerparah, bahayaItems);

    speakAndBroadcastNotification(teksWarn, lvlNum, areaIndices);
}

function toggleMuteAlarm() {
    unlockAudio();
    alarmMuted = !alarmMuted;
    localStorage.setItem('cuacaAlarmMuted', alarmMuted);
    if (!alarmMuted) {
        playBeep(880, 0.15, 1, 0);
    }
    renderStatusBar(cuacaAllData);
}

// ===== FOKUS PETA =====
function focusCuacaItem(lat, lon) {
    map.setView([lat, lon], 10, { animate: true, duration: 0.8 });
}

// ===== TOGGLE LAYER =====
function toggleCuacaMarkers() {
    const chk = document.getElementById('chkCuacaMarker');
    if (!cuacaMarkerGroup) return;
    chk && chk.checked ? cuacaMarkerGroup.addTo(map) : map.removeLayer(cuacaMarkerGroup);
}

function toggleRadiusLayer() {
    const chk = document.getElementById('chkRadius60');
    if (!radiusLayerGroup) return;
    chk && chk.checked ? radiusLayerGroup.addTo(map) : map.removeLayer(radiusLayerGroup);
}

function togglePelabuhanLayer() {
    const chk = document.getElementById('chkPelabuhanIkan');
    if (!pelabuhanMarkerGroup) return;
    chk && chk.checked ? pelabuhanMarkerGroup.addTo(map) : map.removeLayer(pelabuhanMarkerGroup);
}

// ===== COLLAPSE PANEL SATELIT =====
function toggleSatPerairanPanel() {
    const content = document.getElementById('satPerairanContent');
    const arrow = document.getElementById('satPerairanArrow');
    if (!content) return;
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (arrow) arrow.textContent = '▲';
    } else {
        content.style.display = 'none';
        if (arrow) arrow.textContent = '▼';
    }
}

// ===== COLLAPSE PANEL CUACA (LEGACY COMPAT) =====
function toggleCuacaList() {
    toggleSatPerairanPanel();
}

// ===== FUNGSI UPDATE UTAMA =====
async function updateCuacaSystem() {
    const loadingEl = document.getElementById('cuacaLastUpdate');
    if (loadingEl) loadingEl.innerHTML = '<span style="color:#888; font-size:9px;">Terakhir diperbarui: 🔄 Memperbarui data...</span>';

    try {
        const data = await fetchCuacaNelayan();
        renderPanelNelayan(data);
        renderCuacaMarkersPeta(data);
        renderStatusBar(data);

        const terparah = data.find(d => d.isBuruk);
        if (terparah) {
            triggerAlarm(terparah.tingkat.level);
        } else {
            lastAlarmLevel = null;
        }

        if (loadingEl) {
            const now = new Date();
            loadingEl.innerHTML = `<span style="color:#555; font-size:9px; font-weight:600;">Terakhir diperbarui: <span style="color:#2e7d32;">✓ ${now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})} WIB</span></span>`;
        }
    } catch (e) {
        console.error("[Cuaca Nelayan] Gagal update:", e);
        if (loadingEl) loadingEl.innerHTML = '<span style="color:#dc3545; font-size:9px;">Terakhir diperbarui: ⚠️ Gagal memuat</span>';
    }
}

// ===== INISIALISASI =====
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes cuaca-pulse {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-3px) scale(1.08); }
        }
        @keyframes reko-flash {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .wilmetos-tooltip {
            background: rgba(0, 20, 30, 0.88) !important;
            border: 1px solid #00e5ff !important;
            border-radius: 6px !important;
            box-shadow: 0 0 10px rgba(0,229,255,0.3) !important;
            color: #00e5ff !important;
            padding: 5px 10px !important;
            font-family: 'Segoe UI', sans-serif !important;
        }
        .wilmetos-tooltip::before {
            border-top-color: #00e5ff !important;
        }
    `;
    document.head.appendChild(style);

    initCuacaLayers();
    updateCuacaSystem();
    setInterval(updateCuacaSystem, REFRESH_INTERVAL_MS);

    setInterval(() => {
        if (!alarmMuted && lastAlarmLevel === "DILARANG") playSireneMp3('dilarang');
    }, 300000);
    setInterval(() => {
        if (!alarmMuted && lastAlarmLevel === "BERBAHAYA") playSireneMp3('berbahaya');
    }, 600000);
});
