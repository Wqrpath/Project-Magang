import requests
import json  # Import library JSON
import hashlib
from datetime import datetime, timezone, timedelta
# pyrefly: ignore [missing-import]
from moviepy import ImageSequenceClip, ImageClip, concatenate_videoclips
from PIL import Image
import os
import shutil
from pathlib import Path
import sys
import time


log_path = os.path.join(os.path.dirname(__file__), "debug_log.txt")

# Alihkan stdout (print) dan stderr (error) ke file
sys.stdout = open(log_path, "w")
sys.stderr = open(log_path, "w")

print(f"\n--- Sesi dijalankan pada: {datetime.now()} ---")


def copy_dan_rename(path_sumber, nama_baru):
    file_asal = Path(path_sumber)
    folder_tujuan = Path(__file__).parent
    path_tujuan = folder_tujuan / nama_baru
    
    try:
        shutil.copy2(file_asal, path_tujuan)
        print(f"Berhasil! File disalin ke: {path_tujuan}")
    except FileNotFoundError:
        print("Error: File sumber tidak ditemukan.")
    except Exception as e:
        print(f"Terjadi kesalahan: {e}")

def create_video_with_pause(file_list, output_name="video_satelit.webm", fps=5, pause_duration=2):
    processed_images = []
    target_size = (1050, 700) 
    temp_dir = "temp_standardized"
    
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)

    # 1. Standarisasi gambar (sama seperti sebelumnya)
    for file_path in file_list:
        if not os.path.exists(file_path): continue
        try:
            with Image.open(file_path) as img:
                img = img.convert("RGBA")
                if img.size != target_size:
                    img = img.resize(target_size, Image.Resampling.LANCZOS)
                temp_path = os.path.join(temp_dir, os.path.basename(file_path))
                img.save(temp_path)
                processed_images.append(temp_path)
        except Exception as e:
            print(f"Error pada {file_path}: {e}")

    if len(processed_images) < 2:
        print("Gambar tidak cukup untuk membuat video.")
        return

    try:
        # Urutkan secara kronologis
        processed_images.sort()

        # 2. Buat Klip Animasi (Semua gambar kecuali yang terakhir)
        # Kita ambil processed_images[:-1]
        main_clip = ImageSequenceClip(processed_images[:-1], fps=fps)

        # 3. Buat Klip "Pause" (Hanya gambar terakhir)
        # Gunakan ImageClip agar bisa diatur durasinya secara manual
        last_image_path = processed_images[-1]
        last_clip = ImageClip(last_image_path, duration=pause_duration)

        # 4. Gabungkan Klip Utama dan Klip Terakhir
        print(f"Menggabungkan animasi dengan jeda {pause_duration} detik di akhir...")
        final_video = concatenate_videoclips([main_clip, last_clip])

        # 5. Render ke WebM
        final_video.write_videofile(
            output_name, 
            codec='libvpx-vp9', 
            audio=False,
            ffmpeg_params=['-pix_fmt', 'yuva420p', '-auto-alt-ref', '0']
        )

        final_video.close()
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                print("Folder temporary berhasil dibersihkan.")
            except Exception as cleanup_error:
                print(f"Gagal menghapus folder temp: {cleanup_error}")
        print("Video berhasil dibuat!")

    except Exception as e:
        print(f"Gagal saat rendering: {e}")


def get_image_hash(image_url):
    """Fungsi untuk mendownload dan mengambil hash MD5 dari gambar"""
    try:
        response = requests.get(image_url, timeout=15)
        if response.status_code == 200:
            # Membuat hash dari isi konten gambar
            return hashlib.md5(response.content).hexdigest()
    except Exception as e:
        print(f"Gagal mengambil hash dari {image_url}: {e}")
    return None


def cleanup_old_files(folder_path, max_files=15):
    """Hapus file satelit terlama jika jumlah melebihi max_files."""
    all_files = []
    
    for f in os.listdir(folder_path):
        if f.startswith('EH_') and f.endswith('.png'):
            try:
                time_str = f[3:15]
                file_time = datetime.strptime(time_str, '%Y%m%d%H%M')
                all_files.append((file_time, os.path.join(folder_path, f), f))
            except Exception:
                continue
    
    # Urutkan dari terlama ke terbaru
    all_files.sort(key=lambda x: x[0])
    
    jumlah_lebih = len(all_files) - max_files
    if jumlah_lebih <= 0:
        print(f"Jumlah file sat_image: {len(all_files)} (tidak perlu dibersihkan).")
        return
    
    print(f"--- Membersihkan {jumlah_lebih} file satelit terlama (total {len(all_files)} > {max_files}) ---")
    deleted_count = 0
    for i in range(jumlah_lebih):
        try:
            os.remove(all_files[i][1])
            print(f"Dihapus: {all_files[i][2]}")
            deleted_count += 1
        except Exception as e:
            print(f"Gagal menghapus {all_files[i][2]}: {e}")
    
    print(f"Pembersihan selesai. Total {deleted_count} file dihapus, tersisa {len(all_files) - deleted_count} file.")

url = "https://inderaja.bmkg.go.id/IMAGE/HIMA/H08_ET_Indonesia.png"
folder_sat = "sat_image"
json_file = "metadata_sat.json"
animated_hours = 3

now_time = datetime.now(timezone.utc)
limit_time = now_time - timedelta(hours=6)
image_files = []

try:
    response = requests.head(url, timeout=10)
    mdate_str = response.headers.get('Last-Modified')
    if mdate_str:
        mdate = datetime.strptime(mdate_str, '%a, %d %b %Y %H:%M:%S %Z')
        mdate = mdate.replace(tzinfo=timezone.utc)

        if os.path.exists(json_file):
            with open(json_file, "r") as f:
                old_data = json.load(f)
                old_update = datetime.fromisoformat(old_data["last_update"])
                # if old_update >= mdate:
                #     exit() 

        now = datetime.now(timezone.utc)
        time_diff = now - mdate
        if time_diff <= timedelta(minutes=30):
            rounded_minute = (mdate.minute // 10) * 10
            mdate_rounded = mdate.replace(minute=rounded_minute, second=0, microsecond=0)
            mdate_rounded_hhmm = mdate_rounded.strftime("%H%M")
            url_hm = f"https://inderaja.bmkg.go.id/IMAGE/HIMA/H08_ET_Indonesia_{mdate_rounded_hhmm}.png"
            print(url_hm)
            print(f"Mengecek kecocokan gambar...")
            hash_main = get_image_hash(url)
            hash_hm = get_image_hash(url_hm)

            if hash_main and hash_hm and hash_main == hash_hm:
                print("Data Satelit Cocok...")
                file_name = f"sat_image/EH_{mdate_rounded.strftime('%Y%m%d%H%M')}z.png"
                try:
                    img_response = requests.get(url_hm, timeout=30)
                    if img_response.status_code == 200:
                        with open(file_name, "wb") as f:
                            f.write(img_response.content)
                        copy_dan_rename(file_name,'EH_latest.png')
                        print(f"Berhasil menyimpan: {file_name}")

                        image_files = []

                        for f in os.listdir(folder_sat):
                            if f.startswith('EH_') and f.endswith('.png'):
                                try:
                                    time_str = f[3:15] 
                                    file_time = datetime.strptime(time_str, '%Y%m%d%H%M')
                                    file_time = file_time.replace(tzinfo=timezone.utc)
                                    if file_time >= limit_time:
                                        image_files.append(os.path.join(folder_sat, f))
                                except (ValueError, IndexError):
                                    continue

                        image_files.sort()
                        print(image_files)
                        # fetch_lightning_data(10)
                        create_video_with_pause(image_files)
                        cleanup_old_files('sat_image', max_files=15)

                        data_log = {
                            "last_update": mdate.isoformat(),
                            "sat_time": mdate_rounded.isoformat(),
                            "status": "success",
                            "file_saved": file_name,
                            "local_check_time": now.isoformat()
                        }
                        with open(json_file, "w") as f:
                            json.dump(data_log, f, indent=4)

                        try:
                            js_path = os.path.join(Path(__file__).parent, "js", "metadata_sat.js")
                            with open(js_path, "w", encoding="utf-8") as fjs:
                                fjs.write("window.METADATA_SAT_DATA = " + json.dumps(data_log, indent=4) + ";")
                        except Exception as e_js:
                            print(f"Gagal menulis metadata_sat.js: {e_js}")
        
                    else:
                        print(f"Gagal mengunduh gambar. Status code: {img_response.status_code}")
                except Exception as e:
                    print(f"Terjadi kesalahan saat menyimpan file: {e}")
    else:
        print("Header 'Last-Modified' tidak ditemukan.")
except Exception as e:
    print(f"Terjadi kesalahan saat mengecek header: {e}")