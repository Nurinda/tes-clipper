# Clipper kumparan

Aplikasi web untuk memotong video panjang jadi klip pendek (Shorts, Reels, TikTok). Bagian yang paling menarik dipilih otomatis, lalu bisa dirapikan langsung di browser.

Semua pemrosesan video berjalan **di browser** (ffmpeg WebAssembly), jadi tidak butuh server dan cocok di-hosting statis di Netlify. Video tidak diunggah ke mana pun. Yang dikirim ke OpenAI hanya audio (untuk dijadikan teks) dan teks transkrip (untuk memilih momen).

## Fitur

**Pemilihan momen otomatis**
- Transkripsi dengan Whisper (OpenAI), lengkap dengan waktu per kata
- Model GPT memilih momen terbaik, memberi skor, judul, teks pembuka, deskripsi, tagar, dan alasan
- Skor digabung dengan analisis naik-turunnya suara
- Batas klip mengikuti batas kalimat, bukan dipotong di tengah kata
- Mode tanpa AI: klip dipilih dari bagian dengan suara paling hidup
- Pengaturan durasi target, jumlah klip, jenis tayangan, dan bahasa

**Sampul otomatis**
- Tiap klip otomatis dapat sampul: beberapa frame dinilai dari ketajaman, cahaya, warna, dan wajah (kalau browser mendukung), lalu yang terbaik dipilih
- Tiga template bergaya kumparan (judul bawah, kotak teal, tanpa teks) dengan logo, teks, dan warna yang bisa diubah
- Teks sampul bisa ditulis dengan AI, frame bisa diganti manual
- Unduh JPG atau PNG, atau ikut masuk ke ZIP hasil ekspor
- "Samakan gaya ke semua klip" menyalin rasio, subtitle, logo, warna, dan sampul ke klip lain

**Editor**
- Timeline dengan gelombang suara, geser titik mulai/selesai, zoom, bagi klip, rapikan jeda
- Rasio 9:16, 1:1, 4:5, 16:9, atau asli. Isi bingkai: latar blur, potong (bisa digeser), atau bar hitam
- Subtitle otomatis dari transkrip, bisa disunting. Gaya: karaoke (kata menyala), kotak, garis tebal, minimal
- Teks di layar dengan waktu muncul, posisi, ukuran, warna, dan latar
- Logo kumparan atau logo unggahan di sudut video
- Volume, ratakan suara, fade, musik latar, kecepatan 0,5x sampai 2x
- Kecerahan, kontras, saturasi, dan beberapa gaya warna
- Panel transkrip yang bisa dicari: klik untuk loncat, atur awal/akhir klip dari kalimat
- Urungkan/ulangi dan pintasan keyboard
- Proyek tersimpan otomatis di browser

**Ekspor**
- Resolusi 480p / 720p / 1080p dan tiga tingkat kualitas
- Render lengkap atau potong cepat (tanpa render ulang)
- MP4, subtitle .srt, sampul .jpg, dan judul/deskripsi .txt
- Ekspor satu klip atau semuanya, lalu unduh sebagai ZIP

## Menjalankan di komputer

Butuh Node.js 18 ke atas.

```bash
npm install
npm run dev
```

Buka alamat yang muncul di terminal (biasanya http://localhost:5173).

Build produksi:

```bash
npm run build
npm run preview
```

Saat `dev` dan `build`, skrip `scripts/prepare-assets.mjs` menyalin mesin ffmpeg dari `node_modules` ke `public/ffmpeg`. Folder itu sengaja tidak ikut di-commit (ukurannya sekitar 30 MB).

## Upload ke GitHub

```bash
git init
git add .
git commit -m "Clipper kumparan"
git branch -M main
git remote add origin https://github.com/USERNAME/clipper-kumparan.git
git push -u origin main
```

Ganti `USERNAME` dengan akun GitHub-mu. Atau buat repositori kosong di github.com lalu unggah isi folder ini lewat tombol "uploading an existing file".

## Publikasi di Netlify

1. Masuk ke Netlify, pilih **Add new site → Import an existing project**, lalu hubungkan repositori GitHub tadi.
2. Pengaturan build sudah terbaca dari `netlify.toml` (perintah `npm run build`, folder `dist`). Tidak perlu diubah.
3. Klik **Deploy**. Selesai.

Tidak ada variabel lingkungan yang perlu diisi. API key OpenAI dimasukkan sendiri oleh pengguna di halaman Pengaturan dan hanya disimpan di browser mereka.

## Pakai pertama kali

1. Buka **Pengaturan**, tempel API key OpenAI, lalu klik **Tes koneksi dan pilih model terbaik**. Aplikasi akan memilih model GPT terbaru yang tersedia di akunmu.
2. Kembali ke beranda, tarik videonya, atur opsi, lalu **Mulai analisis**.
3. Pilih klip di daftar, rapikan, lalu buka tab **Ekspor**.

## Hal yang perlu diketahui

- **Kecepatan render.** ffmpeg di browser berjalan di satu thread, jadi render lengkap lebih lambat dari aplikasi desktop. Klip 60 detik di 720p dengan kualitas Cepat biasanya butuh beberapa menit, tergantung komputer. "Potong cepat" selesai dalam hitungan detik.
- **Format video.** Video harus bisa diputar browser (MP4/H.264, WebM, sebagian MOV). Kalau gagal dibuka, ekspor ulang ke MP4 dulu.
- **Video sangat besar.** File dibaca langsung dari disk tanpa disalin ke memori, jadi file besar tetap bisa diproses. Hanya audio yang diekstrak. Video berdurasi berjam-jam akan makin lama dianalisis.
- **Biaya.** Transkripsi Whisper sekitar US$0,006 per menit audio. Biaya model GPT tergantung model yang dipilih. Semua dibebankan ke akun OpenAI pemilik API key.
- **Keamanan key.** Karena aplikasi ini berjalan sepenuhnya di browser, key tersimpan di localStorage perangkat pengguna. Jangan membagikan key milikmu ke orang lain, dan jangan isi key di komputer umum.
- **Musik latar** tidak ikut tersimpan di proyek. Setelah halaman dimuat ulang, pilih lagi file musiknya sebelum ekspor.
- **Salinan video** disimpan di IndexedDB supaya proyek bisa dibuka lagi. Matikan di Pengaturan kalau tidak mau.

## Struktur proyek

```
src/
  components/   Pratinjau, timeline, panel editor
  pages/        Beranda, Analisis, Proyek (editor), Pengaturan
  lib/          ffmpeg, audio, openai, highlight, subtitle, ekspor, penyimpanan
  store.ts      State aplikasi
public/         Logo, font subtitle, manifest
scripts/        Penyalin mesin ffmpeg
```

## Pintasan keyboard

| Tombol | Fungsi |
|---|---|
| Spasi | Putar / jeda |
| I / O | Mulai / selesai klip di posisi playhead |
| S | Bagi klip di playhead |
| ← / → | Mundur / maju 1 detik (Shift: 5 detik) |
| Ctrl+Z / Ctrl+Y | Urungkan / ulangi |

© kumparan (nrm)
