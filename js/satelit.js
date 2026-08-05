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
        // Proteksi: Jika radar juga sedang animasi, matikan radarnya agar CPU tidak lag
        if(document.querySelector('input[name="radarGroup"]:checked').value === "animasi") { 
            document.querySelector('input[name="radarGroup"][value="statis"]').checked = true; 
            if (typeof updateRadarLayers === "function") updateRadarLayers(); 
        }
        setTimeout(() => { const v = videoOverlay.getElement(); if(v) bindVideoToTimeline(v); }, 50);
    }
    checkTimelineVisibility();
}

document.querySelectorAll('input[name="satelitGroup"]').forEach(r => r.addEventListener('change', updateSatelitLayers));