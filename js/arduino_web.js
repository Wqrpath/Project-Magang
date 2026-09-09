// ============================================================
// MODUL JEMBATAN WEBPAGE KE ARDUINO (SILENT BACKGROUND BRIDGE)
// ============================================================
// Mengirimkan perintah audio dari web secara otomatis ke server lokal
// (http://localhost:5000/trigger?cmd=...) yang terhubung ke Arduino via Serial.

async function sendCommandToArduino(cmdString) {
    if (!cmdString) return false;
    const cleanCmd = cmdString.trim();
    console.log(`[Arduino Bridge] Mengirim sinyal ke Arduino: ${cleanCmd}`);

    try {
        const res = await fetch(`http://127.0.0.1:5000/trigger?cmd=${encodeURIComponent(cleanCmd)}`, {
            method: 'GET',
            signal: AbortSignal.timeout(25000)
        });
        if (res.ok) {
            console.log("✅ [Arduino Bridge] Sinyal berhasil terkirim ke Arduino via Local Server.");
            return true;
        }
    } catch (e) {
        console.warn("⚠️ [Arduino Bridge] Local Server (server_arduino.py) tidak aktif atau tidak merespon.");
    }
    return false;
}
