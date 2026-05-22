export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Kebijakan Privasi</h1>
        <p className="text-sm text-slate-500 mb-10">Terakhir diperbarui: 1 Januari 2025</p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">1. Informasi yang Kami Kumpulkan</h2>
            <p>
              PT. Cahaya Sejati Teknologi ("CST Logistics", "kami") mengumpulkan informasi berikut ketika Anda menggunakan layanan kami:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>Nama lengkap, alamat email, dan nomor telepon yang Anda berikan saat mendaftar.</li>
              <li>Informasi perusahaan seperti nama, NPWP, dan alamat usaha.</li>
              <li>Data pengiriman: rute, berat, dimensi, dan isi kargo.</li>
              <li>Data teknis: alamat IP, jenis browser, dan halaman yang dikunjungi.</li>
              <li>Dokumen yang Anda unggah untuk keperluan bea cukai atau pengiriman.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">2. Penggunaan Informasi</h2>
            <p>Informasi yang kami kumpulkan digunakan untuk:</p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>Memproses pesanan pengiriman dan layanan logistik Anda.</li>
              <li>Mengirimkan notifikasi status pengiriman melalui email dan WhatsApp.</li>
              <li>Mengelola akun dan profil pelanggan.</li>
              <li>Meningkatkan kualitas layanan dan pengalaman pengguna.</li>
              <li>Memenuhi kewajiban hukum dan regulasi kepabeanan.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">3. Berbagi Informasi</h2>
            <p>
              Kami tidak menjual atau menyewakan data pribadi Anda kepada pihak ketiga. Kami dapat berbagi informasi dengan:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>Mitra pengiriman dan maskapai pelayaran untuk memproses kargo Anda.</li>
              <li>Otoritas bea cukai dan instansi pemerintah yang berwenang.</li>
              <li>Penyedia layanan teknologi yang membantu operasional kami (tunduk pada perjanjian kerahasiaan).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Keamanan Data</h2>
            <p>
              Kami menerapkan langkah-langkah keamanan teknis dan organisasional yang wajar untuk melindungi data Anda dari akses tidak sah,
              perubahan, pengungkapan, atau penghancuran. Data ditransmisikan menggunakan enkripsi SSL/TLS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Hak Anda</h2>
            <p>Sebagai pengguna, Anda berhak untuk:</p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>Mengakses data pribadi yang kami simpan tentang Anda.</li>
              <li>Meminta koreksi data yang tidak akurat.</li>
              <li>Meminta penghapusan akun dan data pribadi Anda.</li>
              <li>Menarik persetujuan penggunaan data sewaktu-waktu.</li>
            </ul>
            <p className="mt-3">
              Untuk menggunakan hak-hak ini, hubungi kami di <a href="mailto:info@cstlogistic.co.id" className="text-sky-600 hover:underline">info@cstlogistic.co.id</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">6. Cookie</h2>
            <p>
              Situs kami menggunakan cookie fungsional untuk menjaga sesi login dan preferensi bahasa Anda.
              Kami tidak menggunakan cookie pelacakan pihak ketiga untuk tujuan iklan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">7. Perubahan Kebijakan</h2>
            <p>
              Kami dapat memperbarui kebijakan ini sewaktu-waktu. Perubahan material akan kami beritahukan melalui email
              atau pemberitahuan di situs kami. Penggunaan layanan setelah perubahan berarti Anda menyetujui kebijakan yang diperbarui.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">8. Kontak</h2>
            <p>
              Jika Anda memiliki pertanyaan mengenai kebijakan privasi ini, hubungi:
            </p>
            <address className="not-italic mt-3 text-slate-600 space-y-1">
              <p className="font-medium text-slate-800">PT. Cahaya Sejati Teknologi</p>
              <p>Jln. Ternate No. 10B/C, Jakarta 10150</p>
              <p>Email: <a href="mailto:info@cstlogistic.co.id" className="text-sky-600 hover:underline">info@cstlogistic.co.id</a></p>
            </address>
          </section>
        </div>
      </div>
    </div>
  );
}
