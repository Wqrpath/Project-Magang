// Inisialisasi Batas Koordinat Global (BBOX)
const videoBounds = [[-20.0, 90.0], [20.0, 150.0]];
const radarBounds = L.latLngBounds(L.latLng(-5.207765, 110.5686), L.latLng(-9.6011, 114.9731)); 

// Inisialisasi Peta Utama (Center Jatim)
const map = L.map('map', { 
    center: [-7.2, 112.7], 
    zoom: 7, 
    minZoom: 5,
    zoomControl: false, 
    maxBounds: videoBounds, 
    maxBoundsViscosity: 1.0 
});

// Peta Dasar Dark Mode
const darkGrayUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
L.tileLayer(darkGrayUrl, { attribution: '&copy; Esri & OpenStreetMap' }).addTo(map);

// Add zoom control at bottom right
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Inisialisasi Variabel Share Player Kontrol Timeline
const bottomPlayer = document.getElementById('bottomPlayer');
const btn = document.getElementById('playPauseBtn');
const slider = document.getElementById('timelineSlider');
const timeLabel = document.getElementById('timeLabel');
let activeVideoElement = null;

// Fungsi Global Pendukung Player Bar
function formatTime(s) { 
    if(isNaN(s)) return "00:00.000"; 
    const m=Math.floor(s/60), sec=Math.floor(s%60), ms=Math.floor((s%1)*1000); 
    return `${(m<10?"0":"")+m}:${(sec<10?"0":"")+sec}.${(ms<10?"00":ms<100?"0":"")+ms}`; 
}

function bindVideoToTimeline(v) {
    activeVideoElement = v; 
    v.style.objectFit = 'fill'; 
    v.play().catch(()=>{}); 
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>'; 
    bottomPlayer.style.display = 'flex';
    
    v.ontimeupdate = () => { 
        if(!slider.dataset.isDragging) { 
            slider.max = v.duration || 100; 
            slider.value = v.currentTime; 
            timeLabel.innerHTML = `${formatTime(v.currentTime)} / ${formatTime(v.duration)}`; 
        } 
    };
}

function checkTimelineVisibility() {
    const sAnim = document.querySelector('input[name="satelitGroup"]:checked')?.value === "animasi";
    if (!sAnim) {
        if(activeVideoElement) activeVideoElement.pause(); 
        bottomPlayer.style.display = 'none'; 
        activeVideoElement = null;
    }
}

// Handler Global untuk Tombol Player Bar
L.DomEvent.on(btn, 'click', () => { 
    if (activeVideoElement) { 
        if (activeVideoElement.paused) { activeVideoElement.play(); btn.innerHTML = '<i class="fa-solid fa-pause"></i>'; } 
        else { activeVideoElement.pause(); btn.innerHTML = '<i class="fa-solid fa-play"></i>'; } 
    } 
});
L.DomEvent.on(slider, 'mousedown', () => slider.dataset.isDragging = "true");
L.DomEvent.on(slider, 'touchstart', () => slider.dataset.isDragging = "true");
L.DomEvent.on(slider, 'change', () => { if (activeVideoElement) activeVideoElement.currentTime = slider.value; delete slider.dataset.isDragging; });
L.DomEvent.on(slider, 'input', () => { if (activeVideoElement) timeLabel.innerHTML = `${formatTime(slider.value)} / ${formatTime(activeVideoElement.duration)}`; });

// Cegah klik tembus ke peta
L.DomEvent.disableClickPropagation(document.getElementById('customPanel'));
L.DomEvent.disableScrollPropagation(document.getElementById('customPanel'));
L.DomEvent.disableClickPropagation(bottomPlayer);
L.DomEvent.disableScrollPropagation(bottomPlayer);