import os
import glob
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import cv2
from PIL import Image

# Import modul utama dari tobac
import tobac
import iris
# Tambahkan import cftime jika belum ada (biasanya otomatis terinstal bersama iris)
import cftime

def load_png_to_iris_cube(image_path, img_extent, timestamp):
    """
    Mengonversi gambar PNG menjadi Iris Cube 3D (time, latitude, longitude)
    agar kompatibel dengan syarat wajib tobac terbaru.
    """
    # 1. Masking warna menggunakan OpenCV
    img_cv = cv2.imread(image_path)
    img_hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    
    lower_bound = np.array([0, 30, 150])
    upper_bound = np.array([20, 255, 255])
    mask = cv2.inRange(img_hsv, lower_bound, upper_bound)
    
    # Membuat grid data (awan dingin = 200, non-awan = 300)
    # Tambahkan dimensi baru di axis 0 untuk dimensi 'time' -> (1, height, width)
    data_grid = np.where(mask > 0, 200.0, 300.0)
    data_grid = np.expand_dims(data_grid, axis=0)
    
    # 2. Definisikan koordinat ruang (spatial coords)
    lon_min, lon_max, lat_min, lat_max = img_extent
    _, h, w = data_grid.shape
    lats = np.linspace(lat_max, lat_min, h)
    lons = np.linspace(lon_min, lon_max, w)
    
    lat_coord = iris.coords.DimCoord(lats, standard_name='latitude', units='degrees')
    lon_coord = iris.coords.DimCoord(lons, standard_name='longitude', units='degrees')
    
    # 3. Definisikan koordinat waktu (Wajib untuk tobac terbaru!)
    # Menggunakan unit waktu standar meteorologi
    time_unit = iris.unit.Unit('hours since 1970-01-01 00:00:00', calendar='gregorian')
    time_value = cftime.date2num(timestamp, time_unit.origin, calendar=time_unit.calendar)
    time_coord = iris.coords.DimCoord([time_value], standard_name='time', units=time_unit)
    
    # 4. Bungkus menjadi Cube 3D
    cube = iris.cube.Cube(
        data_grid, 
        dim_coords_and_dims=[(time_coord, 0), (lat_coord, 1), (lon_coord, 2)]
    )
    cube.units = 'K'
    return cube

# ==========================================
# KONFIGURASI UTAMA
# ==========================================
img_extent = [90, 150, -20, 20]     # Batas asli Himawari Anda
target_extent = [102, 114, 0, 8.0] # Batas crop target analisis

# Siapkan list gambar time-series Anda (Urutkan berdasarkan waktu)
# Contoh file: 'data_satelit/EH_20260602_1200.png', 'data_satelit/EH_20260602_1210.png', dst.
list_gambar = sorted(glob.glob('sat_image/EH_*.png')) 
print(list_gambar)
exit()
if len(list_gambar) < 2:
    raise ValueError("Gagal memproses. Harap sediakan minimal 2 gambar berurutan di dalam folder 'data_satelit' untuk melacak trek!")

# 1. Konversi seluruh file gambar ke format Iris Cube di dalam List
cubes_list = [load_png_to_iris_cube(img_path, img_extent) for img_path in list_gambar]

# Tentukan delta waktu pengamatan (misal tiap 10 menit sekali = 600 detik)
dt = 600.0 
dxy = 2000.0 # Estimasi resolusi spasial satelit (~2 km per piksel)

# ==========================================
# PROSES TOBAC (DETECTION & TRACKING)
# ==========================================
dt = 600.0 # interval 10 menit (600 detik)
waktu_awal = pd.to_datetime('2026-06-02 12:00:00')

print("=== Memulai Deteksi Awan Dingin ===")
cubes_list = []
features_list = []

# Loop untuk membaca gambar sekaligus memberikan koordinat waktu yang tepat
for i, img_path in enumerate(list_gambar):
    # Hitung timestamp untuk file ke-i
    timestamp = waktu_awal + pd.to_timedelta(i * dt, unit='s')
    
    # Load gambar menjadi cube yang sudah memiliki dimensi 'time'
    cube = load_png_to_iris_cube(img_path, img_extent, timestamp)
    cubes_list.append(cube)
    
    # Jalankan feature detection langsung pada cube 3D tersebut
    feats = tobac.feature_detection.feature_detection_multithreshold(
        cube, dxy, threshold=[250], target='minimum'
    )
    
    if feats is not None:
        features_list.append(feats)

# Gabungkan seluruh objek DataFrame koordinat awan
features = pd.concat(features_list, ignore_index=True)

print("=== Memulai Pelacakan Jalur Pergerakan (Tracking) ===")
v_max = 30.0 

# Satukan semua list cube menjadi satu kesatuan objek data time-series raksasa
combined_cube = iris.cube.CubeList(cubes_list).concatenate_cube()

# Jalankan tracking menggunakan data gabungan tersebut
track = tobac.tracking.linking_trackpy(
    features, combined_cube, dt=dt, dxy=dxy, v_max=v_max
)

print("\nHasil Tracking Selesai! Struktur Data Terbentuk:")
print(track[['frame', 'latitude', 'longitude', 'cell']].head(10))

# ==========================================
# PLOTTING HASIL JALUR (TRACK) PADA MAP
# ==========================================
fig = plt.figure(figsize=(10, 8))
ax = plt.axes(projection=ccrs.PlateCarree())

# Tampilkan gambar latar belakang (Menggunakan gambar jam terakhir Anda sebagai background)
img_terakhir = Image.open(list_gambar[-1])
ax.imshow(img_terakhir, origin='upper', extent=img_extent, transform=ccrs.PlateCarree(), alpha=0.7)
ax.add_feature(cfeature.COASTLINE.with_scale('10m'), edgecolor='black', linewidth=1.0)
ax.set_extent(target_extent, crs=ccrs.PlateCarree())

# Plot Jalur Lintasan (Trek) per ID Sel Awan yang terdeteksi
# Kolom 'cell' menyimpan ID unik untuk setiap sistem awan tunggal yang bergerak
grouped_tracks = track.groupby('cell')
for cell_id, track_data in grouped_tracks:
    # Urutkan berdasarkan urutan waktu frame agar jalurnya runut
    track_data = track_data.sort_values('frame')
    
    # Ambil titik bujur dan lintang pergerakan awan tersebut
    lons = track_data['longitude'].values
    lats = track_data['latitude'].values
    
    # Jika awan tersebut hidup/terlacak minimal selama 2 frame, gambar jalurnya
    if len(lons) >= 2:
        # Gambar garis lintasan pergerakan (warna kuning)
        ax.plot(lons, lats, color='yellow', linewidth=2.0, linestyle='--', transform=ccrs.PlateCarree(), zorder=5)
        # Berikan penanda arah panah atau titik di posisi paling terakhir (ujung jalur)
        ax.scatter(lons[-1], lats[-1], color='red', marker='^', s=40, transform=ccrs.PlateCarree(), zorder=6)

# Tambahkan Titik Stasioner FPSO-Anoa sebagai acuan monitoring Anda
target_lon, target_lat = 105.6067, 5.22
ax.plot(target_lon, target_lat, marker='o', color='cyan', markersize=6, transform=ccrs.PlateCarree(), zorder=5)
ax.text(target_lon + 0.15, target_lat, 'FPSO-Anoa', color='black', weight='bold', fontsize=10, 
        va='center', transform=ccrs.PlateCarree(), zorder=5, bbox=dict(facecolor='white', alpha=0.7, edgecolor='none'))

gl = ax.gridlines(draw_labels=True, dms=True, x_inline=False, y_inline=False, linestyle='--', color='gray', alpha=0.5)
gl.top_labels, gl.right_labels = False, False

plt.title(f"Awan Konvektif ($\leq$-48°C) Tracking Analysis\nMetode: Tobac Algoritma", fontsize=12, pad=10)
ax.text(0.99, 0.02, 'image source: BMKG | Tracking: tobac python', color='black', fontsize=8, style='italic', 
        ha='right', va='bottom', transform=ax.transAxes, zorder=5, bbox=dict(facecolor='white', alpha=0.6, edgecolor='none'))

output_file = 'eh_tobac_tracking.png'
plt.savefig(output_file, bbox_inches='tight', dpi=300)
plt.show()