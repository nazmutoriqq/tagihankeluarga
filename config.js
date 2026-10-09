// ============================================================
//  PENGATURAN APLIKASI
//  Cukup ubah file ini. Tidak perlu menyentuh app.js.
// ============================================================

window.APP_CONFIG = {

  // PIN keluarga (angka). Kosongkan "" kalau tidak mau memakai PIN.
  // Catatan: PIN ini hanya pengunci tampilan, bukan keamanan tingkat tinggi.
  PIN: "",

  // false = data disimpan di browser perangkat ini saja (cocok untuk mencoba).
  // true  = data disimpan online di Firebase sehingga semua HP melihat data yang sama.
  // Kalau diubah ke true, isi juga bagian "firebase" di bawah (lihat README.md).
  FIREBASE_ENABLED: false,

  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  }
};
