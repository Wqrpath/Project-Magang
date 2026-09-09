const lightningSound = new Audio('blip_lightning.mp3');
lightningSound.volume = 0.6; 

const lightningLayerGroup = L.layerGroup().addTo(map);
const wilmetLayer = L.layerGroup().addTo(map);

let activeLightningMarkers = []; 
let loadedRealtimeIds = new Set(); 

// Muat Batas Wilayah Kerja dari WILMETOS_JATIM_DATA
if (typeof WILMETOS_JATIM_DATA !== 'undefined') {
    L.geoJSON(WILMETOS_JATIM_DATA, { style: { color: "#00f2ff", weight: 0.8, fillOpacity: 0 } }).addTo(wilmetLayer);
} else {
    fetch('wilmetos_jatim_full.json')
        .then(r => r.json())
        .then(d => L.geoJSON(d, { style: { color: "#00f2ff", weight: 0.8, fillOpacity: 0 } }).addTo(wilmetLayer))
        .catch(() => {});
}

async function updateLightningSystem(skrgWibMs) {
    const chk = document.getElementById('chkPetir');
    if (chk && !chk.checked) return;

    if (!skrgWibMs) {
        const pcTime = new Date();
        skrgWibMs = pcTime.getTime() + (pcTime.getTimezoneOffset() * 60000) + 25200000;
    }

    // Prioritas 1: Gunakan window.PETIR_..._DATA jika tersedia (bebas CORS)
    if (window.PETIR_HISTORIS_DATA) {
        processLightningFeatures(window.PETIR_HISTORIS_DATA, false, skrgWibMs);
    }
    if (window.PETIR_REALTIME_DATA) {
        processLightningFeatures(window.PETIR_REALTIME_DATA, true, skrgWibMs);
    }

    // Prioritas 2: Fetch dari server jika ada web server
    fetch('petir_historis.json?t=' + skrgWibMs)
        .then(r => r.json())
        .then(dataArray => { 
            window.PETIR_HISTORIS_DATA = dataArray;
            processLightningFeatures(dataArray, false, skrgWibMs); 
        })
        .catch(() => {});

    fetch('petir_realtime.json?t=' + skrgWibMs)
        .then(r => r.json())
        .then(dataArray => { 
            window.PETIR_REALTIME_DATA = dataArray;
            processLightningFeatures(dataArray, true, skrgWibMs); 
        })
        .catch(() => {});

    applyLightningFading(skrgWibMs);
}

function processLightningFeatures(dataArray, useAnimation, skrgWibMs) {
    if (!dataArray || dataArray.length === 0) return;

    dataArray.sort((a, b) => a[3] - b[3]);

    dataArray.forEach(item => {
        const lon = item[0];
        const lat = item[1];
        const currentAmp = item[2];
        const epochSec = item[3];
        const isInternalArea = useAnimation ? item[4] : false;
        const p_id = useAnimation ? item[5] : null; 
        
        if (useAnimation && p_id) {
            if (loadedRealtimeIds.has(p_id)) return;
            loadedRealtimeIds.add(p_id);
        }

        function createMarker() {
            if (!document.getElementById('chkPetir').checked) return;

            if (useAnimation && isInternalArea === true) {
                lightningSound.currentTime = 0;
                lightningSound.play().catch(()=>{});
                
                // Pemicu Otomatis Suara Sirene ke Arduino
                if (typeof sendCommandToArduino === 'function') {
                    sendCommandToArduino('CUACA,3,0');
                }
            }

            const absCurrent = Math.abs(currentAmp);
            const minSize = 6, maxSize = 22;
            const minCurrentRange = 5000, maxCurrentRange = 100000;

            let fontSize = minSize + ((absCurrent - minCurrentRange) / (maxCurrentRange - minCurrentRange)) * (maxSize - minSize);
            fontSize = Math.max(minSize, Math.min(fontSize, maxSize));

            const lightningIcon = L.divIcon({
                html: `<div class="lightning-bolt-icon" style="font-size: ${fontSize}px;"><i class="fa-solid fa-bolt"></i></div>`,
                iconSize: [fontSize, fontSize],
                iconAnchor: [fontSize/2, fontSize/2],
                className: ''
            });

            const tanggalLokal = new Date(epochSec * 1000);
            const teksWaktuPopup = tanggalLokal.toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
            });

            const marker = L.marker([lat, lon], { icon: lightningIcon }).addTo(lightningLayerGroup);
            marker.bindPopup(`⚡ <b>Sambaran Petir</b><br>Waktu: ${teksWaktuPopup}<br>Kuat Arus: ${currentAmp} Ampere`);

            activeLightningMarkers.push({ marker: marker, timestamp: epochSec * 1000 });
        }

        if (useAnimation) {
            const waktuPetirMs = epochSec * 1000;
            const fileTimestampMs = waktuPetirMs - (waktuPetirMs % 60000);
            const detikPetirMs = waktuPetirMs - fileTimestampMs;
            const targetWaktuMunculMs = fileTimestampMs + 120000 + detikPetirMs;
            
            let delayMs = targetWaktuMunculMs - skrgWibMs;
            if (delayMs < 0) delayMs = 0;

            setTimeout(createMarker, delayMs);
        } else {
            createMarker();
        }
    });
}

function applyLightningFading(skrgWibMs) {
    const waktuSekarang = skrgWibMs || new Date().getTime(); 
    const satuMenitMs = 60000; 
    const batasMaksimalMenit = 60; 

    activeLightningMarkers = activeLightningMarkers.filter(item => {
        const umurMenit = (waktuSekarang - item.timestamp) / satuMenitMs;
        if (umurMenit >= batasMaksimalMenit || umurMenit < 0) {
            map.removeLayer(item.marker);
            return false; 
        } else {
            let hitungOpacity = (batasMaksimalMenit - umurMenit) / batasMaksimalMenit;
            const opacityAman = Math.max(hitungOpacity, 0.10);
            const el = item.marker.getElement();
            if (el) el.style.opacity = opacityAman;
            return true; 
        }
    });
}

// Checkbox interaction
document.getElementById('chkWilmet').addEventListener('change', e => { if(e.target.checked) map.addLayer(wilmetLayer); else map.removeLayer(wilmetLayer); });
document.getElementById('chkPetir').addEventListener('change', e => { 
    if(e.target.checked) { map.addLayer(lightningLayerGroup); updateLightningSystem(); } 
    else { map.removeLayer(lightningLayerGroup); }
});

// Jalankan fading interval independen (tiap 5 detik)
setInterval(() => { applyLightningFading(new Date().getTime()); }, 5000);