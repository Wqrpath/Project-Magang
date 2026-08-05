import os
import time
import json
import shutil
from playwright.sync_api import sync_playwright
import portalocker
from moviepy import ImageSequenceClip, ImageClip, concatenate_videoclips
from PIL import Image
from datetime import datetime, timezone, timedelta
import requests
from shapely.geometry import shape, Point  # <--- TAMBAHKAN INI untuk filter area geografis

# --- AMBIL PATH BASIS UTAMA ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WILMET_PATH = os.path.join(BASE_DIR, "wilmetos_jatim.json")

# Load Poligon Area Sekali Saja di Awal agar Ringan
try:
    with open(WILMET_PATH, "r", encoding="utf-8") as f:
        wilmet_geojson = json.load(f)
    # Satukan koordinat area menjadi objek geometri Shapely (Mendukung Polygon/MultiPolygon)
    WILAYAH_POLYGON = shape(wilmet_geojson["features"][0]["geometry"])
    print("✓ Berhasil memuat poligon area kerja operasional untuk saringan petir.")
except Exception as e:
    WILAYAH_POLYGON = None
    print(f"⚠️ Gagal memuat wilmetos_jatim.json. Saringan suara petir internal dinonaktifkan: {e}")


def generate_lightning_filelist(folder_lightning, metadata_path):
    """Membaca arsip berkas json petir 1 jam terakhir dan mengompresnya secara radikal.
    Menghapus seluruh format GeoJSON standar untuk memangkas ukuran file hingga 90%."""
    
    if not os.path.exists(folder_lightning):
        return

    now_utc = datetime.now(timezone.utc)
    lightning_time_iso = now_utc.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    
    limit_historis = now_utc - timedelta(hours=1)     
    limit_realtime = now_utc - timedelta(minutes=2)    

    data_realtime = []
    data_historis = []
    processed_ids = set() 

    all_files = [f for f in os.listdir(folder_lightning) if f.endswith(".json") and f[:14].isdigit()]
    all_files.sort() 

    for f in all_files:
        try:
            time_str = f[:14]
            file_time = datetime.strptime(time_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            
            if file_time >= limit_historis:
                file_path = os.path.join(folder_lightning, f)
                
                with open(file_path, "r", encoding="utf-8") as file_obj:
                    portalocker.lock(file_obj, portalocker.LOCK_SH)
                    try:
                        data_json = json.load(file_obj)
                    except json.JSONDecodeError:
                        continue
                
                features = data_json.get("data", {}).get("features", []) if "data" in data_json else data_json.get("features", [])
                
                for feature in features:
                    props = feature.get("properties", {})
                    p_id = props.get("id")
                    
                    if not p_id or p_id in processed_ids:
                        continue
                    
                    processed_ids.add(p_id)
                    
                    epoch_sec = props.get("epoch_sec")
                    if not epoch_sec:
                        continue
                    
                    waktu_petir = datetime.fromtimestamp(epoch_sec, tz=timezone.utc)
                    
                    # Ambil data esensial koordinat [lon, lat]
                    coords = feature.get("geometry", {}).get("coordinates", [0, 0])
                    lon = coords[0]
                    lat = coords[1]
                    current = props.get("current", 0)

                    # --- PILAH KATEGORI BERDASARKAN USIA SAMBARAN ---
                    if waktu_petir >= limit_realtime:
                        # A. DATA REAL-TIME (Format Array Ringkas + Tanda Audio Internal Area)
                        is_internal = False
                        if WILAYAH_POLYGON:
                            titik_petir = Point(lon, lat)
                            is_internal = WILAYAH_POLYGON.contains(titik_petir)
                        
                        item_rt = [lon, lat, current, epoch_sec, is_internal, p_id]
                        data_realtime.append(item_rt)
                    else:
                        # B. DATA HISTORIS (KOMPRESI RADIKAL MURNI)
                        # Format Historis: [lon, lat, current, epoch_sec]
                        item_hist = [lon, lat, current, epoch_sec]
                        data_historis.append(item_hist)
                        
        except Exception as e:
            print(f"Gagal memproses file arsip {f}: {e}")
            continue

    # Tulis berkas keluaran dalam bentuk Flat Array (Tanpa pembungkus GeoJSON)
    with open("petir_realtime.json", "w", encoding="utf-8") as f_out:
        portalocker.lock(f_out, portalocker.LOCK_EX)
        json.dump(data_realtime, f_out) # Minified otomatis
        
    with open("petir_historis.json", "w", encoding="utf-8") as f_out:
        portalocker.lock(f_out, portalocker.LOCK_EX)
        json.dump(data_historis, f_out)

    print(f"✓ Kompresi Radikal Selesai! [Realtime: {len(data_realtime)} baris | Historis: {len(data_historis)} baris]")

    # Update metadata_sat.json (Sama seperti sebelumnya)
    try:
        with open(metadata_path, "r+", encoding="utf-8") as f:
            portalocker.lock(f, portalocker.LOCK_EX)
            try:
                metadata = json.load(f)
            except json.JSONDecodeError:
                metadata = {}
            metadata["lightning_time"] = lightning_time_iso
            metadata["lightning_active_files"] = len(all_files) 
            f.seek(0)
            json.dump(metadata, f, indent=4)
            f.truncate()
    except FileNotFoundError:
        pass


def cleanup_old_json(folder_path):
    """Menghapus file JSON yang sudah lebih dari 24 jam"""
    batas_waktu = datetime.now(timezone.utc) - timedelta(hours=24)
    file_terhapus = 0
    try:
        if not os.path.exists(folder_path):
            return
        with os.scandir(folder_path) as entries:
            for entry in entries:
                if entry.is_file() and entry.name.endswith(".json"):
                    try:
                        time_str = entry.name[:14]
                        file_time = datetime.strptime(time_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
                        if file_time < batas_waktu:
                            os.remove(entry.path)
                            file_terhapus += 1
                    except (ValueError, IndexError):
                        continue
        if file_terhapus > 0:
            print(f"✓ Bersihkan {file_terhapus} file lama (> 24 jam).")
    except Exception as e:
        print(f"Gagal cleanup: {e}")


def get_existing_lightning_ids(archive_dir):
    """Membaca file JSON terakhir untuk mengumpulkan ID petir yang sudah tersimpan sebelumnya"""
    existing_ids = set()
    try:
        if not os.path.exists(archive_dir):
            return existing_ids
        all_json_files = [f for f in os.listdir(archive_dir) if f.endswith('.json') and f[:14].isdigit()]
        if not all_json_files:
            return existing_ids
        all_json_files.sort(reverse=True)
        latest_file_path = os.path.join(archive_dir, all_json_files[0])
        with open(latest_file_path, 'r', encoding='utf-8') as f:
            old_data = json.load(f)
            features = old_data.get("data", {}).get("features", []) if "data" in old_data else old_data.get("features", [])
            for feature in features:
                p_id = feature.get("properties", {}).get("id")
                if p_id:
                    existing_ids.add(p_id)
    except Exception:
        pass
    return existing_ids


def fetch_lightning(durasi=2):
    folder_lightning = 'lightning_json'
    url = f"http://202.90.198.88/map/monitoring/data/petir?waktu={durasi}"
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    archive_dir = os.path.join(base_dir, folder_lightning)
    
    if not os.path.exists(archive_dir):
        os.makedirs(archive_dir)
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        now_str = datetime.now().strftime('%H:%M:%S')
        print(f"[{now_str}] Memulai unduh data petir")
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            new_json_data = response.json()
            has_data_wrapper = "data" in new_json_data
            features = new_json_data["data"]["features"] if has_data_wrapper else new_json_data["features"]
            
            saved_ids = get_existing_lightning_ids(archive_dir)
            
            filtered_features = []
            for feature in features:
                p_id = feature.get("properties", {}).get("id")
                if p_id not in saved_ids:
                    filtered_features.append(feature)
            
            print(f"Hasil Saringan Jaringan: Total {len(features)} data masuk, {len(features) - len(filtered_features)} duplikat dibuang.")

            if len(filtered_features) == 0:
                print("Tidak ada sambaran petir baru di menit ini. Skip penulisan file.")
                generate_lightning_filelist(folder_lightning, 'metadata_sat.json')
                return

            if has_data_wrapper:
                new_json_data["rows"] = len(filtered_features)
                new_json_data["data"]["features"] = filtered_features
            else:
                new_json_data["features"] = filtered_features

            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            file_name = f"{timestamp}.json"
            file_path = os.path.join(archive_dir, file_name)
            
            with open(file_path, "w", encoding="utf-8") as f:
                portalocker.lock(f, portalocker.LOCK_EX)
                json.dump(new_json_data, f, indent=4)
            print(f"✓ Berhasil disimpan (Murni data baru): {file_name}")
            
            # Pemicu kompilator data 2 JSON
            generate_lightning_filelist(folder_lightning, 'metadata_sat.json')
            cleanup_old_json(archive_dir)
        else:
            print(f"❌ Gagal! Status code: {response.status_code}")
            
    except Exception as e:
        print(f"⚠️ Terjadi kesalahan: {e}")


def create_video_with_pause(file_list, output_name="video_radar.webm", fps=5, pause_duration=2):
    processed_images = []
    target_size = (1200,1200) 
    temp_dir = "temp_radar"
    
    main_clip = None
    last_clip = None
    final_video = None
    
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)

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
        processed_images.sort()
        main_clip = ImageSequenceClip(processed_images[:-1], fps=fps)
        last_image_path = processed_images[-1]
        last_clip = ImageClip(last_image_path, duration=pause_duration)
        final_video = concatenate_videoclips([main_clip, last_clip])

        final_video.write_videofile(
            output_name, 
            codec='libvpx-vp9', 
            audio=False,
            ffmpeg_params=['-pix_fmt', 'yuva420p', '-auto-alt-ref', '0']
        )
        print("Video berhasil dibuat!")
    except Exception as e:
        print(f"Gagal saat rendering: {e}")
    finally:
        if final_video: final_video.close()
        if main_clip: main_clip.close()
        if last_clip: last_clip.close()
        time.sleep(0.1)
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                print("✓ Folder temporary BERHASIL dibersihkan total.")
            except Exception:
                pass


def generate_recent_filelist(FOLDER_NAME):
    recent_files = []
    current_time = datetime.now(timezone.utc)
    limit_time = current_time - timedelta(hours=3)
    
    if not os.path.exists(FOLDER_NAME):
        return []

    with os.scandir(FOLDER_NAME) as entries:
        for entry in entries:
            if entry.is_file() and entry.name.endswith(".webp") and entry.name[:4].isdigit():
                try:
                    time_str = entry.name[:12]
                    file_time = datetime.strptime(time_str, "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
                    if file_time >= limit_time:
                        full_path = os.path.join(FOLDER_NAME, entry.name)
                        recent_files.append(full_path)
                except (ValueError, IndexError):
                    continue
    recent_files.sort()
    return recent_files


def update_metadata(webp_filename):
    json_path = "metadata_sat.json"
    clean_name = os.path.basename(webp_filename).replace(".webp", "")
    try:
        time_str = clean_name[:12] 
        dt = datetime.strptime(time_str, "%Y%m%d%H%M")
        radar_time_iso = dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    except Exception as e:
        print(f"Gagal membaca format waktu: {e}")
        return

    try:
        with open(json_path, "r+", encoding="utf-8") as f:
            portalocker.lock(f, portalocker.LOCK_EX)
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {}

            data["radar_time"] = radar_time_iso
            data["radar_file_saved"] = f"radar_images/{os.path.basename(webp_filename)}"
            data["local_check_time"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"

            f.seek(0)
            json.dump(data, f, indent=4)
            f.truncate()
            print(f"Metadata BERHASIL diperbarui dengan aman (locked): {radar_time_iso}")
    except FileNotFoundError:
        with open(json_path, "w", encoding="utf-8") as f:
            portalocker.lock(f, portalocker.LOCK_EX)
            data = {
                "radar_time": radar_time_iso,
                "radar_file_saved": f"radar_images/{os.path.basename(webp_filename)}",
                "local_check_time": datetime.now().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"
            }
            json.dump(data, f, indent=4)


def download_webp_and_track():
    folder_name = "radar_images"
    if not os.path.exists(folder_name):
        os.makedirs(folder_name)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        def handle_response(response):
            if ".webp" in response.url.lower():
                try:
                    filename = response.url.split("/")[-1].split("?")[0]
                    if not filename.endswith(".webp"):
                        filename += ".webp"
                    filepath = os.path.join(folder_name, filename)
                    image_data = response.body()
                    with open(filepath, "wb") as f:
                        f.write(image_data)
                    print(f"\nBerhasil mengunduh: {filename}")
                    
                    if filename[:4].isdigit():
                        latest_path = "radar_latest.webp"
                        shutil.copy2(filepath, latest_path)
                        print(f"Berhasil menyalin & rename ke: {latest_path}")
                        update_metadata(filename)
                except Exception:
                    pass

        page.on("response", handle_response)
        page.goto("https://meteojuanda.id/airnav/", timeout=60000)
        page.wait_for_load_state("networkidle")
        browser.close()
        
        image_files = generate_recent_filelist(folder_name)
        create_video_with_pause(image_files)
        print("\nProses selesai.")

if __name__ == "__main__":
    fetch_lightning(2)
    download_webp_and_track()