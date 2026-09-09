"""
GENERATOR NADA SIRINE / PERINGATAN AUDIO
=========================================
Skrip ini menghasilkan berkas audio suara sirene dan nada peringatan
menggunakan modul wave standar Python.

Cara menjalankan:
  .\.venv\Scripts\python.exe generate_siren.py
"""

import wave
import struct
import math
import os
import subprocess
import shutil

OUTPUT_FOLDER = "."

def write_wav(filename, frames, sample_rate=44100, channels=1):
    with wave.open(filename, "w") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(frames)

def generate_siren_dilarang(output_path, duration=4.0, sample_rate=44100):
    frames = []
    total_samples = int(sample_rate * duration)
    for i in range(total_samples):
        t = i / sample_rate
        cycle_pos = (t % 0.8) / 0.8
        if cycle_pos < 0.5:
            freq = 440 + (cycle_pos / 0.5) * (1100 - 440)
        else:
            freq = 1100 - ((cycle_pos - 0.5) / 0.5) * (1100 - 440)
        envelope = 1.0
        if t < 0.05:
            envelope = t / 0.05
        elif t > duration - 0.2:
            envelope = (duration - t) / 0.2
        sample = envelope * (
            0.6 * math.sin(2 * math.pi * freq * t) +
            0.25 * math.sin(2 * math.pi * freq * 2 * t) +
            0.15 * math.sin(2 * math.pi * freq * 3 * t)
        )
        sample_int = max(-32767, min(32767, int(sample * 28000)))
        frames.append(struct.pack("<h", sample_int))
    write_wav(output_path, b"".join(frames), sample_rate)
    print(f"  [OK] Dibuat WAV: {output_path}")

def generate_alarm_berbahaya(output_path, duration=3.0, sample_rate=44100):
    frames = []
    beep_count = 4
    beep_duration = 0.25
    gap_duration = (duration / beep_count) - beep_duration
    for b in range(beep_count):
        beep_start = b * (beep_duration + gap_duration)
        for j in range(int(beep_duration * sample_rate)):
            t = beep_start + j / sample_rate
            t_in_beep = j / sample_rate
            env = 1.0
            if t_in_beep < 0.015:
                env = t_in_beep / 0.015
            elif t_in_beep > beep_duration - 0.05:
                env = (beep_duration - t_in_beep) / 0.05
            sample = env * (
                0.5 * math.sin(2 * math.pi * 880 * t) +
                0.4 * math.sin(2 * math.pi * 1100 * t)
            )
            sample_int = max(-32767, min(32767, int(sample * 26000)))
            frames.append(struct.pack("<h", sample_int))
        for _ in range(int(gap_duration * sample_rate)):
            frames.append(struct.pack("<h", 0))
    write_wav(output_path, b"".join(frames), sample_rate)
    print(f"  [OK] Dibuat WAV: {output_path}")

def generate_chime_waspada(output_path, duration=2.0, sample_rate=44100):
    total_samples = int(sample_rate * duration)
    signal = [0.0] * total_samples
    chime_notes = [(0.0, 880, 0.7), (0.45, 698, 0.65), (0.9, 587, 0.6)]
    for (start_t, freq, amp) in chime_notes:
        start_idx = int(start_t * sample_rate)
        note_len = int(1.1 * sample_rate)
        for k in range(note_len):
            idx = start_idx + k
            if idx >= total_samples:
                break
            t_note = k / sample_rate
            decay = math.exp(-3.5 * t_note)
            s = amp * decay * (
                0.6 * math.sin(2 * math.pi * freq * t_note) +
                0.25 * math.sin(2 * math.pi * freq * 2.0 * t_note) +
                0.15 * math.sin(2 * math.pi * freq * 3.0 * t_note)
            )
            signal[idx] += s
    frames = []
    for i in range(total_samples):
        t = i / sample_rate
        env = 1.0
        if t < 0.02:
            env = t / 0.02
        elif t > duration - 0.1:
            env = (duration - t) / 0.1
        sample_int = max(-32767, min(32767, int(signal[i] * env * 28000)))
        frames.append(struct.pack("<h", sample_int))
    write_wav(output_path, b"".join(frames), sample_rate)
    print(f"  [OK] Dibuat WAV: {output_path}")

def try_convert_to_mp3(wav_path, mp3_path):
    # Coba ffmpeg
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "128k", mp3_path],
            capture_output=True, timeout=30
        )
        if result.returncode == 0:
            os.remove(wav_path)
            print(f"  [OK] Dikonversi ke MP3 (ffmpeg): {mp3_path}")
            return True
    except Exception:
        pass
    # Coba pydub
    try:
        from pydub import AudioSegment
        AudioSegment.from_wav(wav_path).export(mp3_path, format="mp3", bitrate="128k")
        os.remove(wav_path)
        print(f"  [OK] Dikonversi ke MP3 (pydub): {mp3_path}")
        return True
    except ImportError:
        pass
    # Fallback: rename WAV jadi .mp3 (browser bisa putar WAV)
    shutil.copy(wav_path, mp3_path)
    os.remove(wav_path)
    print(f"  [WARN] Disimpan sebagai WAV ({mp3_path}) — browser tetap bisa memutar.")
    return False

def main():
    print("=" * 60)
    print("GENERATOR NADA SIRINE & PERINGATAN CUACA")
    print("=" * 60)
    tasks = [
        ("siren_dilarang.wav",  "siren_dilarang.mp3",  generate_siren_dilarang,  4.0),
        ("siren_berbahaya.wav", "siren_berbahaya.mp3", generate_alarm_berbahaya, 3.0),
        ("chime_waspada.wav",   "chime_waspada.mp3",   generate_chime_waspada,   2.0),
    ]
    for wav_name, mp3_name, gen_func, dur in tasks:
        print(f"\n[*] Menghasilkan: {mp3_name}")
        gen_func(wav_name, duration=dur)
        try_convert_to_mp3(wav_name, mp3_name)
    print("\n" + "=" * 60)
    print("[SUCCESS] Semua file audio sirene berhasil dibuat!")
    print("  - siren_dilarang.mp3  -> Sirine darurat DILARANG MELAUT")
    print("  - siren_berbahaya.mp3 -> Alarm berdenyut BERBAHAYA")
    print("  - chime_waspada.mp3   -> Nada lonceng WASPADA")
    print("=" * 60)

if __name__ == "__main__":
    main()
