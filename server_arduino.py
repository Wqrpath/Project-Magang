r"""
SERVER BRIDGING ARDUINO -- SISTEM PERINGATAN DINI WEB BMKG
=========================================================
Server HTTP lokal ringan (tanpa butuh library tambahan) untuk menerima
permintaan pemicu suara dari Web Browser (index.html) dan mengirimkannya
langsung ke Arduino secara 1 ARAH.

Cara penggunaan:
  .\.venv\Scripts\python.exe server_arduino.py
"""

import sys
import io
# Fix encoding Windows agar bisa print karakter non-ASCII
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import serial
import serial.tools.list_ports
import time
import json

PORT_HTTP = 5000
BAUD_RATE = 9600


def deteksi_port_arduino():
    ports = serial.tools.list_ports.comports()
    keywords = ["arduino", "ch340", "cp210", "ftdi", "atmega", "usb serial"]

    for p in ports:
        desc = (p.description or "").lower() + (p.manufacturer or "").lower()
        if any(k in desc for k in keywords):
            return p.device

    return ports[0].device if ports else None


def kirim_ke_arduino_1arah(cmd_string):
    port = deteksi_port_arduino()
    if not port:
        print("[Server] ERROR: Arduino tidak ditemukan di port USB!")
        return False

    if not cmd_string.endswith("\n"):
        cmd_string += "\n"

    try:
        print(f"[Server] Menghubungkan ke Arduino di {port}...")
        ser = serial.Serial(port, BAUD_RATE, timeout=1)
        time.sleep(1.5)
        
        print(f"[Server] Mengirim perintah ke Arduino: {cmd_string.strip()}")
        ser.write(cmd_string.encode("utf-8"))
        ser.flush()
        
        print("[Server] Menahan sinyal/koneksi ke Arduino selama 10 detik...")
        time.sleep(10)  # Tahan koneksi selama 10 detik penuh
        
        ser.close()  # Baru ditutup setelah 10 detik
        print("[Server] OK - Sinyal selesai (10 detik) & port serial ditutup.")
        return True
    except Exception as e:
        print(f"[Server] GAGAL kirim ke serial: {e}")
        return False


class ArduinoHTTPHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/status":
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {"status": "online", "arduino_port": deteksi_port_arduino()}
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        if parsed.path == "/trigger":
            cmd = params.get("cmd", ["CUACA,3,0"])[0]
            sukses = kirim_ke_arduino_1arah(cmd)

            self.send_response(200 if sukses else 500)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {"status": "ok" if sukses else "error", "cmd": cmd}
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Menyederhanakan log HTTP
        print(f"[Web Request] {args[0]}")


def run_server():
    server_address = ("127.0.0.1", PORT_HTTP)
    httpd = HTTPServer(server_address, ArduinoHTTPHandler)
    print("=" * 60)
    print(f"[SERVER] SERVER BRIDGING WEB-TO-ARDUINO AKTIF!")
    print(f"[SERVER] Mendengarkan di: http://localhost:{PORT_HTTP}")
    print(f"[SERVER] Port Arduino: {deteksi_port_arduino() or 'Tidak terdeteksi'}")
    print("Tekan Ctrl+C untuk menghentikan server.")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
