"""
ARDUINO RADIO BROADCASTER — Sistem Peringatan Dini Cuaca Nelayan
================================================================
Script ini membaca data cuaca BMKG, memainkan audio peringatan
di PC (bell + speech TTS), lalu mengirim sinyal ke Arduino
untuk mengaktifkan Relay Pemancar Radio selama 5 detik.

Kebutuhan Python:
  pip install pyserial requests pyttsx3

Cara penggunaan:
  python arduino_radio.py                    # Auto-deteksi port COM
  python arduino_radio.py --port COM3        # Tentukan port COM manual
  python arduino_radio.py --test             # Mode tes tanpa Arduino
  python arduino_radio.py --demo             # Mode demo (1 lokasi, 5 detik total)
  python arduino_radio.py --loop             # Mode berjalan otomatis setiap 10 menit

Catatan Timing (Total 5 Detik):
  - 0.0s - 1.0s : Bell / Nada Perhatian (beep di PC)
  - 1.0s - 4.5s : Ucapan peringatan (TTS singkat, 1 lokasi)
  - 4.5s - 5.0s : Jeda akhir
  - Relay Arduino ON dari detik ke-0 sampai ke-5, lalu mati otomatis
"""

import requests
import serial
import serial.tools.list_ports
import time
import json
import argparse
import threading
from datetime import datetime, timezone

# ============================================================
# KONFIGURASI UTAMA
# ============================================================
BAUD_RATE       = 9600
INTERVAL_DETIK  = 600    # 10 Menit (mode --loop)
DURASI_SIARAN   = 5.0    # Total durasi siaran dalam detik

# ============================================================
# DAFTAR PELABUHAN YANG DIPANTAU
# ============================================================
DAFTAR_PELABUHAN = [
    {"nama": "PPN Brondong",        "kab": "Lamongan",     "adm4": "35.24.01.1001"},
    {"nama": "PPN Prigi",           "kab": "Trenggalek",   "adm4": "35.73.01.1001"},
    {"nama": "PPP Muncar",          "kab": "Banyuwangi",   "adm4": "35.10.01.1001"},
    {"nama": "PPP Sendang Biru",    "kab": "Malang",       "adm4": "35.73.01.1001"},
    {"nama": "Pelabuhan Gresik",    "kab": "Gresik",       "adm4": "35.25.01.1001"},
    {"nama": "Tanjung Perak",       "kab": "Surabaya",     "adm4": "35.78.01.1001"},
    {"nama": "Pelabuhan Kamal",     "kab": "Bangkalan",    "adm4": "35.28.01.1001"},
    {"nama": "Pesisir Tuban",       "kab": "Tuban",        "adm4": "35.23.01.1001"},
    {"nama": "Pesisir Pasuruan",    "kab": "Pasuruan",     "adm4": "35.14.01.2001"},
    {"nama": "Pesisir Situbondo",   "kab": "Situbondo",    "adm4": "35.14.01.2001"},
    {"nama": "Pesisir Probolinggo", "kab": "Probolinggo",  "adm4": "35.72.01.1001"},
    {"nama": "Pesisir Pamekasan",   "kab": "Pamekasan",    "adm4": "35.29.01.1001"},
    {"nama": "Pesisir Sumenep",     "kab": "Sumenep",      "adm4": "35.29.01.1001"},
]

# Pelabuhan untuk mode DEMO (hanya 1 lokasi)
DEMO_PELABUHAN = {"nama": "Tanjung Perak", "kab": "Surabaya", "adm4": "35.78.01.1001"}

KEYWORD_HUJAN = [
    "hujan lebat", "hujan petir", "badai", "hujan deras",
    "hujan sangat lebat", "petir", "guntur", "hujan sedang",
    "hujan ringan", "hujan lokal"
]
KODE_HUJAN = [60, 61, 63, 65, 80, 95, 97]


# ============================================================
# AUDIO — BELL & SPEECH (via PC Speaker / TTS)
# ============================================================

def putar_bell():
    """Memainkan nada 'bip bip bip' di speaker PC selama ~1 detik."""
    try:
        import winsound
        for _ in range(3):
            winsound.Beep(1000, 200)   # 200ms nada 1000Hz
            time.sleep(0.1)
    except Exception:
        # Fallback jika bukan Windows
        print("\a\a\a", end="", flush=True)


def ucapkan_teks(teks, timeout=4.0):
    """
    Memutar TTS (Text-to-Speech) via pyttsx3 di PC.
    Dibatasi timeout agar tidak melebihi 5 detik total.
    """
    try:
        import pyttsx3
        engine = pyttsx3.init()

        # Atur kecepatan bicara agar pas di ~3.5 detik
        engine.setProperty("rate", 185)   # kata per menit
        engine.setProperty("volume", 1.0)

        # Coba pilih suara bahasa Indonesia jika tersedia
        voices = engine.getProperty("voices")
        for v in voices:
            if "indonesia" in v.name.lower() or "id" in v.id.lower():
                engine.setProperty("voice", v.id)
                break

        done = threading.Event()

        def _run():
            engine.say(teks)
            engine.runAndWait()
            done.set()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=timeout)

        if not done.is_set():
            engine.stop()

    except ImportError:
        print(f"[TTS] pyttsx3 tidak terinstall. Teks: {teks}")
    except Exception as e:
        print(f"[TTS] Error: {e}")


def bangun_teks_peringatan(level, nama_lokasi, mode_demo=False):
    """
    Membangun teks peringatan singkat yang selesai dalam ~3.5 detik.
    Dirancang pendek dan padat untuk total durasi 5 detik.
    """
    if level == 3:
        status = "DILARANG MELAUT"
    elif level == 2:
        status = "BERBAHAYA"
    else:
        status = "WASPADA"

    if mode_demo:
        # Mode demo: 1 lokasi, kalimat sangat singkat
        teks = (
            f"Peringatan cuaca! "
            f"Kondisi {status} di {nama_lokasi}. "
            f"Utamakan keselamatan!"
        )
    else:
        teks = (
            f"Peringatan cuaca {status}. "
            f"Daerah terdampak: {nama_lokasi}. "
            f"Waspadai cuaca ekstrem!"
        )

    return teks


def siaran_audio_pc(level, nama_lokasi, mode_demo=False):
    """
    Urutan siaran audio di PC (total ~5 detik):
      [0.0s] Bell 3x (~1 detik)
      [1.0s] Speech TTS (~3.5 detik)
      [4.5s] Jeda akhir (~0.5 detik)
    """
    print(f"[AUDIO] 🔔 Bell peringatan...")
    putar_bell()
    time.sleep(0.3)  # Jeda singkat antara bell dan speech

    teks = bangun_teks_peringatan(level, nama_lokasi, mode_demo)
    print(f"[AUDIO] 🔊 Memutar: \"{teks}\"")
    ucapkan_teks(teks, timeout=3.5)

    time.sleep(0.2)  # Padding akhir
    print("[AUDIO] ✓ Siaran selesai.")


# ============================================================
# LOGIKA CUACA BMKG
# ============================================================

def is_cuaca_buruk(item):
    desc = (item.get("weather_desc") or "").lower()
    kode = item.get("weather", 0)
    ws   = item.get("ws", 0)
    for kw in KEYWORD_HUJAN:
        if kw in desc:
            return True
    if kode in KODE_HUJAN:
        return True
    if ws >= 40:
        return True
    return False


def get_level(item):
    """
    0 = AMAN
    1 = WASPADA  (hujan ringan/sedang, angin >20 km/h)
    2 = BERBAHAYA (hujan lebat, angin >40 km/h)
    3 = DILARANG MELAUT (badai/petir/angin >60 km/h)
    """
    desc = (item.get("weather_desc") or "").lower()
    ws   = item.get("ws", 0)

    if ws > 60 or "petir" in desc or "badai" in desc or "sangat lebat" in desc:
        return 3
    if ws > 40 or "hujan lebat" in desc or "hujan deras" in desc:
        return 2
    if ws > 20 or "hujan" in desc:
        return 1
    return 0


def fetch_cuaca(pelabuhan_list):
    sekarang = datetime.now(timezone.utc)
    hasil = []

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Mengambil data cuaca BMKG...")

    for idx, pel in enumerate(pelabuhan_list):
        try:
            url = f"https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={pel['adm4']}"
            res = requests.get(url, timeout=8)
            if not res.ok:
                hasil.append({"idx": idx, "nama": pel["nama"], "kab": pel["kab"],
                               "level": 0, "desc": "Tidak ada data", "angin": 0})
                continue

            json_data = res.json()
            all_cuaca = json_data.get("data", [{}])[0].get("cuaca", [[]])
            all_items = [item for sublist in all_cuaca for item in sublist]

            terdekat = None
            min_diff = float("inf")
            terburuk = None
            terburuk_score = -1

            for item in all_items:
                try:
                    waktu_str = item.get("utc_datetime", "").replace("Z", "+00:00")
                    waktu_data = datetime.fromisoformat(waktu_str)
                    selisih_jam = (waktu_data - sekarang).total_seconds() / 3600
                except Exception:
                    continue

                if selisih_jam < -3 or selisih_jam > 12:
                    continue

                diff = abs(selisih_jam)
                if diff < min_diff:
                    min_diff = diff
                    terdekat = item

                if is_cuaca_buruk(item):
                    score = (item.get("ws", 0)) + (50 if item.get("weather", 0) >= 60 else 0)
                    if score > terburuk_score:
                        terburuk_score = score
                        terburuk = item

            dipilih = terburuk or terdekat
            if not dipilih:
                hasil.append({"idx": idx, "nama": pel["nama"], "kab": pel["kab"],
                               "level": 0, "desc": "Tidak ada data", "angin": 0})
                continue

            level = get_level(dipilih)
            hasil.append({
                "idx":   idx,
                "nama":  pel["nama"],
                "kab":   pel["kab"],
                "level": level,
                "desc":  dipilih.get("weather_desc", "-"),
                "angin": dipilih.get("ws", 0),
            })

        except Exception as e:
            print(f"  [WARN] Gagal fetch {pel['nama']}: {e}")
            hasil.append({"idx": idx, "nama": pel["nama"], "kab": pel["kab"],
                           "level": 0, "desc": "Gagal memuat", "angin": 0})

    return hasil


def fetch_cuaca_demo():
    """Mode demo: paksa Level 2 (Berbahaya) di 1 lokasi tanpa fetch API."""
    print(f"[DEMO] Mode demo aktif — Simulasi Level 2 di {DEMO_PELABUHAN['nama']}")
    return [{
        "idx":   0,
        "nama":  DEMO_PELABUHAN["nama"],
        "kab":   DEMO_PELABUHAN["kab"],
        "level": 2,
        "desc":  "Hujan lebat [DEMO]",
        "angin": 45,
    }]


# ============================================================
# ARDUINO SERIAL
# ============================================================

def deteksi_port_arduino():
    ports = serial.tools.list_ports.comports()
    keywords = ["arduino", "ch340", "cp210", "ftdi", "atmega", "usb serial"]

    for p in ports:
        desc = (p.description or "").lower() + (p.manufacturer or "").lower()
        if any(k in desc for k in keywords):
            print(f"[OK] Arduino ditemukan di port: {p.device}")
            return p.device

    if ports:
        print(f"[WARN] Menggunakan port COM pertama: {ports[0].device}")
        return ports[0].device

    print("[ERROR] Port Serial Arduino tidak ditemukan.")
    return None


def kirim_ke_arduino(port, perintah, mode_tes=False):
    if mode_tes:
        print(f"[MODE TES] Perintah simulasi: {perintah.strip()}")
        return True

    try:
        with serial.Serial(port, BAUD_RATE, timeout=2) as ser:
            print(f"[SERIAL] Menghubungkan ke Arduino di {port}...")
            time.sleep(1.5)          # Tunggu reset Arduino
            ser.reset_input_buffer()
            ser.write(perintah.encode("utf-8"))
            ser.flush()
            print(f"[SERIAL] ✓ Perintah terkirim: {perintah.strip()}")
            # Tahan koneksi selama 6 detik (relay sudah mati sendiri setelah 5 detik)
            time.sleep(6)
            print("[SERIAL] Port ditutup.")
            return True

    except serial.SerialException as e:
        print(f"[ERROR] Serial Error: {e}")
        return False


def bangun_perintah(data_cuaca):
    """
    Format: CUACA,<LEVEL_MAX>,<IDX_LOKASI_TERPARAH>
    Hanya 1 lokasi (yang paling parah) untuk menjaga pesan tetap singkat.
    """
    terparah = max(data_cuaca, key=lambda x: x["level"], default=None)
    if not terparah or terparah["level"] == 0:
        return "CUACA,0\n", 0, None

    level = terparah["level"]
    idx   = terparah["idx"]
    return f"CUACA,{level},{idx}\n", level, terparah


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Bridge Python Cuaca BMKG → Arduino Relay Broadcaster")
    parser.add_argument("--port",  type=str, default=None, help="COM Port (misal: COM3)")
    parser.add_argument("--test",  action="store_true",    help="Mode simulasi tanpa hardware Arduino")
    parser.add_argument("--demo",  action="store_true",    help="Mode demo (1 lokasi paksa level 2, 5 detik)")
    parser.add_argument("--loop",  action="store_true",    help="Jalankan berkala tiap 10 menit")
    args = parser.parse_args()

    mode_tes  = args.test
    mode_demo = args.demo
    port = args.port or (None if mode_tes else deteksi_port_arduino())

    if not mode_tes and not port:
        print("[INFO] Gunakan --test untuk mencoba tanpa hardware Arduino.")
        return

    while True:
        # ── Ambil data cuaca ──────────────────────────────────
        if mode_demo:
            data_cuaca = fetch_cuaca_demo()
        else:
            data_cuaca = fetch_cuaca(DAFTAR_PELABUHAN)

        # ── Cetak ringkasan ───────────────────────────────────
        print("\n" + "="*60)
        print("  RINGKASAN STATUS CUACA PELABUHAN")
        print("="*60)
        for d in sorted(data_cuaca, key=lambda x: -x["level"]):
            tag = "[DILARANG]" if d["level"]==3 else "[BERBAHAYA]" if d["level"]==2 \
                  else "[WASPADA]" if d["level"]==1 else "[AMAN]"
            print(f"  {tag:12s} | {d['nama']:22s} | {d['desc']} ({d['angin']} km/h)")
        print("="*60 + "\n")

        # ── Bangun perintah ke Arduino ────────────────────────
        perintah, level_max, lokasi_terparah = bangun_perintah(data_cuaca)

        if level_max == 0:
            print("[INFO] Cuaca AMAN (Level 0). Tidak ada siaran darurat.")
            kirim_ke_arduino(port, "CUACA,0\n", mode_tes)
        else:
            nama_lokasi = f"{lokasi_terparah['nama']}, {lokasi_terparah['kab']}"
            print(f"[INFO] Memulai siaran darurat Level {level_max} — {nama_lokasi}")

            # Jalankan audio PC + kirim sinyal Arduino secara bersamaan
            arduino_thread = threading.Thread(
                target=kirim_ke_arduino,
                args=(port, perintah, mode_tes),
                daemon=True
            )
            arduino_thread.start()

            # Audio di PC (bell + TTS, total ~5 detik)
            siaran_audio_pc(level_max, nama_lokasi, mode_demo=mode_demo)

            arduino_thread.join(timeout=10)  # Tunggu thread Arduino selesai

        # ── Simpan status ke JSON ─────────────────────────────
        try:
            with open("status_radio.json", "w", encoding="utf-8") as f:
                json.dump({
                    "waktu":    datetime.now().isoformat(),
                    "perintah": perintah.strip(),
                    "data":     data_cuaca
                }, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

        if not args.loop:
            break

        print(f"\n[INFO] Tidur {INTERVAL_DETIK//60} menit sebelum update berikutnya...\n")
        time.sleep(INTERVAL_DETIK)


if __name__ == "__main__":
    main()
