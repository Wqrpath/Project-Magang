const radarUrl = 'radar_latest.webp';
const radarVideoUrl = 'video_radar.webm';

const radarOverlay = L.imageOverlay(radarUrl, radarBounds, { opacity: 0.9, interactive: true }).addTo(map);
const radarVideoOverlay = L.videoOverlay(radarVideoUrl, radarBounds, { opacity: 0.9, loop: true, autoplay: true, muted: true, interactive: true });

function updateRadarLayers() {
    const r = document.querySelector('input[name="radarGroup"]:checked').value;
    map.removeLayer(radarOverlay); 
    map.removeLayer(radarVideoOverlay);
    
    if(r === "statis") map.addLayer(radarOverlay);
    else if(r === "animasi") {
        map.addLayer(radarVideoOverlay);
        // Proteksi: Jika satelit sedang animasi, kembalikan satelit ke statis
        if(document.querySelector('input[name="satelitGroup"]:checked').value === "animasi") { 
            document.querySelector('input[name="satelitGroup"][value="statis"]').checked = true; 
            if (typeof updateSatelitLayers === "function") updateSatelitLayers(); 
        }
        setTimeout(() => { const v = radarVideoOverlay.getElement(); if(v) bindVideoToTimeline(v); }, 50);
    }
    checkTimelineVisibility();
}

document.querySelectorAll('input[name="radarGroup"]').forEach(r => r.addEventListener('change', updateRadarLayers));