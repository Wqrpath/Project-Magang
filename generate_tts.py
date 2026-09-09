r"""
GENERATOR SUARA TEXT-TO-SPEECH (TTS) ARDUINO DFPLAYER
=====================================================
Skrip ini mengonversi teks pengumuman bahasa Indonesia menjadi berkas MP3
menggunakan Google Text-to-Speech (gTTS). Hasilnya disimpan ke dalam folder 'mp3'
yang siap disalin langsung ke MicroSD Card DFPlayer Mini milik Arduino.

Cara menjalankan:
  .\.venv\Scripts\python.exe generate_tts.py
"""

import os
from gtts import gTTS

# Folder output audio MP3
OUTPUT_FOLDER = "mp3"

# Daftar Teks Pengumuman Suara (Format DFPlayer Mini: 0001.mp3, 0002.mp3, dst)
TEKS_AUDIO = {
    # File Header & Peringatan Utama
    "0002": "Perhatian-perhatian. Berikut disampaikan peringatan dini cuaca BMKG Jawa Timur.",
    "0003": "Bahaya! Terdapat badai, hujan petir, dan cuaca buruk. Status DILARANG MELAUT di daerah:",
    "0004": "Bahaya! Terdapat badai dan hujan deras. Status BERBAHAYA di daerah:",
    "0005": "Peringatan Waspada! Terdapat potensi hujan dan angin di daerah:",
    "0006": "Informasi cuaca: Seluruh wilayah perairan Jawa Timur saat ini aman untuk pelayaran.",
    "0007": "Dihimbau untuk seluruh nelayan agar tetap mengutamakan keselamatan. Terima kasih.",

    # Nama Daerah / Pelabuhan Terdampak (0010.mp3 s/d 0022.mp3)
    "0010": "PPN Brondong Lamongan",
    "0011": "PPN Prigi Trenggalek",
    "0012": "PPP Muncar Banyuwangi",
    "0013": "PPP Sendang Biru Malang",
    "0014": "Pelabuhan Gresik",
    "0015": "Tanjung Perak Surabaya",
    "0016": "Pelabuhan Kamal Bangkalan",
    "0017": "Pesisir Tuban",
    "0018": "Pesisir Pasuruan",
    "0019": "Pesisir Situbondo",
    "0020": "Pesisir Probolinggo",
    "0021": "Pesisir Pamekasan",
    "0022": "Pesisir Sumenep",
}


def buat_folder_output():
    if not os.path.exists(OUTPUT_FOLDER):
        os.makedirs(OUTPUT_FOLDER)
        print(f"[*] Membuat folder '{OUTPUT_FOLDER}'...")


def generate_audio():
    buat_folder_output()
    total = len(TEKS_AUDIO)
    print(f"[*] Memulai pembuatan {total} berkas MP3 suara Bahasa Indonesia (Text-to-Speech)...\n")

    for kode, teks in TEKS_AUDIO.items():
        filename = f"{kode}.mp3"
        filepath = os.path.join(OUTPUT_FOLDER, filename)
        print(f"  [+] Generasi {filename}: \"{teks}\"")
        try:
            tts = gTTS(text=teks, lang="id", slow=False)
            tts.save(filepath)
            print(f"      [OK] Berhasil disimpan: {filepath}")
        except Exception as e:
            print(f"      [ERROR] Gagal membuat {filename}: {e}")

    print("\n" + "=" * 60)
    print("[SUCCESS] Seluruh berkas MP3 telah dibuat di dalam folder 'mp3/'.")
    print("[INFO] Silakan salin folder 'mp3' ini ke direktori utama (root) MicroSD Card DFPlayer Mini Anda.")
    print("=" * 60)


if __name__ == "__main__":
    generate_audio()
