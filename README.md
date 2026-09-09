# Sistem Peringatan Dini Cuaca & Navigasi Nelayan

Repositori ini berisi *source code* untuk aplikasi Sistem Peringatan Dini Cuaca dan Navigasi Nelayan.

## Cara Update Kode ke GitHub (Push)

Jika Anda telah melakukan perubahan pada kode lokal dan ingin memperbarui (mengunggah) perubahan tersebut ke GitHub, ikuti langkah-langkah berikut di terminal (Pastikan Anda berada di dalam folder `web_informasi`):

1. **Tambahkan semua perubahan baru:**
   ```bash
   git add .
   ```

2. **Simpan perubahan (Commit):**
   ```bash
   git commit -m "Update fitur atau perbaikan terbaru"
   ```
   *(Anda bisa mengubah pesan di dalam tanda kutip sesuai dengan perubahan yang Anda lakukan, misalnya "Update logo BMKG")*

3. **Unggah ke GitHub (Push):**
   ```bash
   git push origin main
   ```

## Catatan Penting
- Jika Anda mendapatkan pesan *error* saat melakukan `push` (misalnya karena ada perubahan di GitHub yang belum ada di komputer lokal), jalankan perintah `git pull origin main` terlebih dahulu untuk menarik pembaruan, lalu ulangi langkah `git push` di atas.
- Tidak ada *API Key* atau *Token* sensitif yang tersimpan di dalam repositori ini, sehingga aman untuk di-push ke publik.
