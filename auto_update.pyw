"""
AUTO-UPDATE SCHEDULER — Sistem Peringatan Dini Cuaca Nelayan
=============================================================
Script ini menjalankan semua downloader secara berkala:
  1. download_data.pyw  → Citra Satelit (BMKG Inderaja)
  2. download_radar.pyw → Radar Cuaca + Data Petir

Interval: setiap 10 menit
Berjalan di background (tanpa jendela karena ekstensi .pyw)

Cara pakai:
  - Jalankan manual:  pythonw auto_update.pyw
  - Atau daftarkan ke Task Scheduler (lihat setup_scheduler.ps1)
"""

import subprocess
import sys
import os
import time
from datetime import datetime
import threading
import http.server
import socketserver

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "auto_update_log.txt")

SCRIPTS = [
    os.path.join(BASE_DIR, "download_data.pyw"),
    os.path.join(BASE_DIR, "arduino_radio.py"),
]

INTERVAL_MENIT = 10
HTTP_PORT = 8080  # Port web server lokal


def start_http_server():
    """Jalankan HTTP server lokal di background thread.
    
    Fungsi seperti 'php serve' — browser bisa akses gambar satelit
    untuk analisis pixel citra EH (diperlukan oleh Canvas API).
    """
    os.chdir(BASE_DIR)  # Pastikan serving dari folder project
    handler = http.server.SimpleHTTPRequestHandler
    handler.log_message = lambda *args: None  # Nonaktifkan log agar tidak berisik

    try:
        with socketserver.TCPServer(("", HTTP_PORT), handler) as httpd:
            httpd.allow_reuse_address = True
            log(f"[HTTP Server] Berjalan di http://localhost:{HTTP_PORT}")
            log(f"[HTTP Server] Buka browser ke: http://localhost:{HTTP_PORT}")
            httpd.serve_forever()
    except OSError as e:
        log(f"[HTTP Server] Port {HTTP_PORT} sudah digunakan (server mungkin sudah berjalan): {e}")
    except Exception as e:
        log(f"[HTTP Server] Error: {e}")


def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > 500:
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(lines[-500:])
    except Exception:
        pass


def run_script(script_path):
    """Jalankan script Python sebagai subprocess terpisah."""
    if not os.path.exists(script_path):
        log(f"  ⚠️ File tidak ditemukan: {os.path.basename(script_path)}")
        return False
    
    venv_python = os.path.join(BASE_DIR, ".venv", "Scripts", "pythonw.exe")
    python_exe = venv_python if os.path.exists(venv_python) else sys.executable

    try:
        log(f"  ▶ Menjalankan {os.path.basename(script_path)} dengan {python_exe}...")
        result = subprocess.run(
            [python_exe, script_path],
            cwd=BASE_DIR,
            timeout=300,  # Timeout 5 menit per script
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            log(f"  ✓ Selesai: {os.path.basename(script_path)}")
        else:
            log(f"  ✗ Error (code {result.returncode}): {os.path.basename(script_path)}")
            if result.stderr:
                log(f"    stderr: {result.stderr[:200]}")
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        log(f"  ⏱ Timeout (>5 menit): {os.path.basename(script_path)}")
        return False
    except Exception as e:
        log(f"  ✗ Gagal jalankan {os.path.basename(script_path)}: {e}")
        return False


def main():
    log("=" * 50)
    log("Auto-Update Scheduler dimulai")
    log(f"Interval: setiap {INTERVAL_MENIT} menit")
    log(f"Scripts: {[os.path.basename(s) for s in SCRIPTS]}")
    log("=" * 50)

    while True:
        log("--- Siklus Update Dimulai ---")
        for script in SCRIPTS:
            run_script(script)
        log(f"--- Selesai. Tidur {INTERVAL_MENIT} menit... ---\n")
        time.sleep(INTERVAL_MENIT * 60)


if __name__ == "__main__":
    server_thread = threading.Thread(target=start_http_server, daemon=True)
    server_thread.start()
    time.sleep(0.5)  # Beri waktu server untuk start
    
    main()
