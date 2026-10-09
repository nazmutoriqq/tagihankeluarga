# Tagihan Keluarga

Aplikasi web untuk mencatat tagihan rumah (listrik, WiFi, PDAM, cicilan, dll), melihat mana yang sudah lunas, dan mengingatkan yang mendekati atau melewati jatuh tempo.

## Isi folder

```
tagihan/
├── index.html   -> struktur halaman
├── style.css    -> tampilan (hitam + ungu)
├── app.js       -> logika aplikasi
├── config.js    -> PIN dan pengaturan Firebase (yang paling sering kamu ubah)
└── README.md
```

## Cara kerja tagihan per bulan

- Tagihan yang kamu tambahkan **hanya milik bulan yang sedang dibuka**. Bulan lain tidak ikut terisi.
- Mau tagihan yang sama di bulan berikutnya? Pindah ke bulan itu (tombol `›`), lalu tekan **Salin dari bulan lalu**. Kamu bisa memilih tagihan mana saja yang mau disalin. Yang namanya sudah ada di bulan itu tidak akan ganda.
- Hasil salinan berstatus **belum lunas**, dan nominalnya bisa kamu ubah lewat tombol **Edit** tanpa mempengaruhi bulan lain.
- Menghapus atau mengedit tagihan hanya berlaku untuk bulan itu.

## Cara mencoba di laptop

1. Buka folder `tagihan` di VS Code.
2. Klik kanan `index.html` -> **Open with Live Server**.
3. Tekan **+** untuk menambah tagihan, lalu coba **Bayar**.
4. Tekan `›` untuk pindah bulan, lalu coba **Salin dari bulan lalu**.

Pada mode awal ini, data tersimpan di browser perangkat itu saja. HP lain tidak akan melihat data yang sama.

## Arti warna

- Hijau: sudah lunas
- Kuning: jatuh tempo 7 hari lagi atau kurang
- Merah: sudah lewat jatuh tempo dan belum lunas
- Ungu: masih lama

## Supaya semua HP keluarga melihat data yang sama (Firebase)

1. Buka https://console.firebase.google.com lalu login dengan akun Google.
2. Klik **Create a project**, beri nama (misalnya `tagihan-keluarga`). Google Analytics boleh dimatikan.
3. Di menu kiri pilih **Build -> Firestore Database -> Create database**. Pilih lokasi (misalnya `asia-southeast2` Jakarta) dan mulai dengan **production mode**.
4. Buka tab **Rules**, ganti isinya dengan ini, lalu **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /bills/{id} {
         allow read, write: if true;
       }
     }
   }
   ```
5. Klik ikon roda gigi -> **Project settings**. Di bagian **Your apps** klik ikon web `</>`, daftarkan app, lalu salin isi `firebaseConfig`.
6. Buka `config.js`, ubah `FIREBASE_ENABLED` menjadi `true`, dan tempel nilai `apiKey`, `projectId`, dst ke bagian `firebase`.
7. Simpan lalu refresh. Badge di pojok kanan atas akan berubah menjadi **Tersinkron online**.

Setelah itu, upload ke GitHub Pages dan bagikan linknya ke keluarga lewat WhatsApp.

## Soal keamanan (penting dibaca)

- Aturan di langkah 4 membuat siapa pun yang tahu link web **dan** konfigurasi projectmu bisa membaca dan menulis data. Untuk keluarga ini cukup, tetapi **jangan simpan data sensitif** seperti nomor rekening, password, atau data pribadi lengkap. Cukup nama tagihan, nominal, dan catatan singkat.
- **PIN di `config.js` hanya pengunci tampilan.** Orang yang paham cara membuka kode web tetap bisa melihatnya. Jangan anggap itu pengaman sungguhan.
- Kalau nanti ingin lebih aman, langkah selanjutnya adalah memakai Firebase Authentication (login Google) dan membatasi aturan Firestore hanya untuk akun keluargamu.

## Catatan versi

Versi ini menyimpan data dengan format baru (tagihan per bulan). Data percobaan dari versi sebelumnya tidak akan muncul. Itu normal, cukup isi ulang.

## Ide pengembangan

- Grafik pengeluaran per bulan memakai Chart.js
- Dibuat bisa di-install ke layar utama HP (PWA)
- Login Google supaya aman
