const videoUrl = 'video_satelit.webm';
const imageUrl = 'EH_latest.png';

const videoOverlay = L.videoOverlay(videoUrl, videoBounds, { opacity: 0.9, loop: true, autoplay: true, muted: true, interactive: true });
const imageOverlay = L.imageOverlay(imageUrl, videoBounds, { opacity: 0.9, interactive: true }).addTo(map);

function updateSatelitLayers() {
    const s = document.querySelector('input[name="satelitGroup"]:checked').value;
    map.removeLayer(imageOverlay); 
    map.removeLayer(videoOverlay);
    
    if(s === "statis") map.addLayer(imageOverlay);
    else if(s === "animasi") {
        map.addLayer(videoOverlay);

        setTimeout(() => { const v = videoOverlay.getElement(); if(v) bindVideoToTimeline(v); }, 50);
    }
    checkTimelineVisibility();
}

document.querySelectorAll('input[name="satelitGroup"]').forEach(r => r.addEventListener('change', updateSatelitLayers));

// ===== AUTO-REFRESH CITRA SATELIT & RADAR SETIAP 10 MENIT =====
// Menambahkan cache-busting timestamp agar browser selalu ambil gambar terbaru
const SAT_REFRESH_MS = 600000; // 10 menit

function refreshSatelitImage() {
    const ts = Date.now();
    const mode = document.querySelector('input[name="satelitGroup"]:checked')?.value;

    // Refresh gambar statis (EH_latest.png)
    const newImgUrl = `EH_latest.png?t=${ts}`;
    imageOverlay.setUrl(newImgUrl);

    // Refresh video animasi (video_satelit.webm)
    if (mode === "animasi") {
        const newVidUrl = `video_satelit.webm?t=${ts}`;
        const vidEl = videoOverlay.getElement();
        if (vidEl) {
            const currentTime = vidEl.currentTime;
            vidEl.src = newVidUrl;
            vidEl.load();
            vidEl.currentTime = currentTime;
            vidEl.play().catch(() => {});
        }
    }

    // Update waktu di metadata panel
    try {
        fetch(`metadata_sat.json?t=${ts}`)
            .then(r => r.json())
            .then(meta => {
                // Update label waktu satelit
                const satEl = document.querySelector('.sat-time-label');
                if (satEl && meta.sat_time) {
                    const d = new Date(meta.sat_time);
                    satEl.textContent = d.toLocaleString('id-ID', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    }) + ' WIB';
                }

                // Update label waktu petir
                const petirEl = document.querySelector('.petir-time-label');
                if (petirEl && meta.lightning_time) {
                    const d = new Date(meta.lightning_time);
                    petirEl.textContent = d.toLocaleString('id-ID', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    }) + ' WIB';
                }
            })
            .catch(() => {});
    } catch (e) {}

    console.log(`[Satelit] Auto-refresh pada ${new Date().toLocaleTimeString('id-ID')}`);

    // ===== TRIGGER ULANG ANALISIS PIXEL SETELAH GAMBAR BARU DIMUAT =====
    // Reset level alarm agar pemberitahuan bisa muncul kembali jika masih ada ancaman
    // Beri jeda 4 detik agar gambar baru selesai termuat ke dalam browser sebelum dianalisis
    setTimeout(() => {
        if (typeof _lastAlarmLevelSat !== 'undefined') {
            _lastAlarmLevelSat = null; // Reset agar alarm bisa muncul lagi di siklus ini
        }
        if (typeof _satAnalysisRunning !== 'undefined') {
            _satAnalysisRunning = false; // Reset flag jika sebelumnya macet
        }
        console.log('[Satelit] Memicu ulang analisis pixel setelah refresh gambar baru...');
        if (typeof runSatelliteAnalysis === 'function') {
            runSatelliteAnalysis();
        }
    }, 4000);
}

// Jalankan auto-refresh setiap 10 menit
setInterval(refreshSatelitImage, SAT_REFRESH_MS);