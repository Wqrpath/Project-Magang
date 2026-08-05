import os
import json
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from PIL import Image

def runmap():
    # 1. Definisikan nama file
    json_file = 'metadata_sat.json'
    image_file = 'EH_latest.png'

    # 2. Membaca metadata waktu dari file JSON dan konversi ke WIB (LT)
    formatted_time = "Unknown Time"
    if os.path.exists(json_file):
        with open(json_file, 'r') as f:
            metadata = json.load(f)
        sat_time_str = metadata.get("sat_time")
        
        if sat_time_str:
            try:
                # Mengambil 19 karakter pertama (YYYY-MM-DDTHH:MM:SS) untuk mempermudah parsing
                utc_time = datetime.strptime(sat_time_str[:19], "%Y-%m-%dT%H:%M:%S")
                
                # Konversi dari UTC ke WIB (Local Time / LT = UTC + 7 jam)
                wib_time = utc_time + timedelta(hours=7)
                
                # Format waktu menjadi: "02 June 2026 at 14:30 LT (WIB)"
                # %d = tanggal, %B = nama bulan (bhs Inggris), %Y = tahun, %H:%M = jam:menit
                formatted_time = wib_time.strftime("%d %B %Y at %H:%M LT (WIB)")
            except Exception as e:
                print(f"Gagal memformat waktu: {e}")
                formatted_time = sat_time_str # fallback ke string asli jika error
    else:
        print(f"Peringatan: File {json_file} tidak ditemukan.")

    # 3. Load gambar satelit
    img = Image.open(image_file)
    img_extent = [90, 150, -20, 20]
    target_extent = [102, 114, 0, 8.0]

    # 4. Setup Plot
    fig = plt.figure(figsize=(10, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.imshow(img, origin='upper', extent=img_extent, transform=ccrs.PlateCarree(), alpha=0.8)
    ax.add_feature(cfeature.COASTLINE.with_scale('10m'), edgecolor='black', linewidth=1.0)
    ax.set_extent(target_extent, crs=ccrs.PlateCarree())

    # 5. TAMBAHAN: Menambahkan titik koordinat FPSO-Anoa (5.22N, 105.6067E)
    target_lon = 105.6067
    target_lat = 5.22

    # Menggambar titik merah di koordinat target
    ax.plot(target_lon, target_lat, marker='o', color='black', markersize=3, 
            transform=ccrs.PlateCarree(), zorder=5)

    # Memberikan teks label di samping titik tersebut
    # Menambahkan sedikit offset (+0.15) pada bujur agar teks tidak menubruk titiknya
    ax.text(target_lon + 0.15, target_lat, 'FPSO-Anoa', color='black',
            fontsize=10, va='center', transform=ccrs.PlateCarree(), zorder=5)
    ax.text(0.99, 0.02, 'Image Source: BMKG', color='black', fontsize=9, style='italic',
            ha='right', va='bottom', transform=ax.transAxes, zorder=5)

    # 6. Gridlines
    gl = ax.gridlines(draw_labels=True, dms=True, x_inline=False, y_inline=False, 
                    linestyle='--', color='gray', alpha=0.5)
    gl.top_labels = False
    gl.right_labels = False

    # 7. Judul Gambar dengan format waktu baru
    plt.title(f"Himawari-8 Satellite Image\n{formatted_time}", fontsize=12, pad=10)

    # 8. Simpan dan Tampilkan
    output_file = 'sat_eh.png'
    plt.savefig(output_file, bbox_inches='tight', dpi=300)
    # print(f"Proses selesai! Gambar berhasil disimpan sebagai '{output_file}'")
    # plt.show()