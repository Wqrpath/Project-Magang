/*
  =============================================================================
  ARDUINO RELAY BROADCASTER — SISTEM PERINGATAN DINI CUACA NELAYAN
  =============================================================================
  Fungsi:
    Menerima perintah Serial dari PC/Web (format: CUACA,<LEVEL>)
    dan mengaktifkan Relay selama 5 detik, lalu mati otomatis.

  Komponen yang Dibutuhkan:
    1. Arduino Uno / Nano
    2. Modul Relay 5V (1-Channel, Active LOW)
    3. LED Indikator (opsional, pin D2)

  Skema Pinout Wiring:
    - Arduino Pin D7   ---> IN pada Modul Relay
    - Arduino 5V       ---> VCC Relay
    - Arduino GND      ---> GND Relay
    - Relay COM        ---> Sumber Sinyal Audio (Line-in PC / Amplifier)
    - Relay NO         ---> Input Pemancar Radio FM
    - Arduino Pin D2   ---> LED Indikator (+ resistor 220Ω ke GND)

  Perilaku:
    - CUACA,0          --> Relay MATI (aman / batalkan siaran)
    - CUACA,1/2/3      --> Relay NYALA 5 detik, lalu mati otomatis
    - Perintah baru bisa diterima KAPAN SAJA (non-blocking)
    - Kirim CUACA,0 untuk mematikan relay lebih awal

  Format Perintah Serial dari Python/Web:
    "CUACA,<LEVEL>\n"       Contoh: "CUACA,2\n"
    "CUACA,<LEVEL>,<IDX>\n" Contoh: "CUACA,2,0\n"

  Cara Uji Manual via Serial Monitor (baud 9600):
    Kirim "CUACA,2" → Relay nyala 5 detik
    Kirim "CUACA,0" → Relay langsung mati
  =============================================================================
*/

#define LED_PIN   2
#define RELAY_PIN 7

// Relay ACTIVE LOW: LOW = Relay ON, HIGH = Relay OFF
// PENTING: pastikan modul relay kamu memang Active LOW
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// Durasi relay menyala dalam milidetik
#define DURASI_SIARAN_MS 5000UL

// ============================================================
// STATE RELAY (non-blocking, pakai millis())
// ============================================================
bool          relayAktif   = false;
unsigned long waktuMulai   = 0;

String inputBuffer = "";

// ============================================================
// SETUP
// ============================================================
void setup() {
  // PENTING: atur pin mode lalu langsung matikan relay
  // untuk mencegah relay nyala saat Arduino boot
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);   // <-- Langsung matikan!

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(9600);
  Serial.println(F("[SYSTEM] Arduino Relay Broadcaster Ready."));
  Serial.println(F("[SYSTEM] Menunggu perintah CUACA,<LEVEL>..."));
}

// ============================================================
// LOOP — Non-blocking: cek timer relay + baca Serial
// ============================================================
void loop() {

  // --- 1. Cek apakah 5 detik sudah selesai ---
  if (relayAktif && (millis() - waktuMulai >= DURASI_SIARAN_MS)) {
    matikanRelay();
  }

  // --- 2. Baca perintah Serial dari PC/Web ---
  while (Serial.available() > 0) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      inputBuffer.trim();
      if (inputBuffer.length() > 0) {
        prosesPerintah(inputBuffer);
        inputBuffer = "";
      }
    } else {
      // Abaikan karakter non-printable
      if (c >= 32) {
        inputBuffer += c;
      }
    }
  }
}

// ============================================================
// MATIKAN RELAY (dipanggil otomatis atau oleh CUACA,0)
// ============================================================
void matikanRelay() {
  relayAktif = false;
  digitalWrite(RELAY_PIN, RELAY_OFF);
  digitalWrite(LED_PIN, LOW);
  Serial.println(F("[RELAY] OFF — Siaran selesai."));
  Serial.println(F("SELESAI"));
}

// ============================================================
// PROSES PERINTAH SERIAL
// ============================================================
void prosesPerintah(String cmd) {
  Serial.print(F("[IN] "));
  Serial.println(cmd);

  if (!cmd.startsWith("CUACA,")) {
    Serial.println(F("[ERROR] Format tidak valid. Gunakan: CUACA,<LEVEL>"));
    return;
  }

  // Ambil angka level (token pertama setelah "CUACA,")
  String parameter = cmd.substring(6);
  int firstComma   = parameter.indexOf(',');
  int level        = (firstComma == -1)
                       ? parameter.toInt()
                       : parameter.substring(0, firstComma).toInt();

  // ---- LEVEL 0: Matikan relay ----
  if (level == 0) {
    if (relayAktif) {
      Serial.println(F("[INFO] Perintah AMAN diterima — Relay dimatikan lebih awal."));
      matikanRelay();
    } else {
      digitalWrite(RELAY_PIN, RELAY_OFF);
      digitalWrite(LED_PIN, LOW);
      Serial.println(F("[INFO] Cuaca Aman. Relay sudah OFF."));
      Serial.println(F("OK"));
    }
    return;
  }

  // ---- LEVEL 1 / 2 / 3: Nyalakan relay 5 detik ----
  if (level >= 1 && level <= 3) {
    if (relayAktif) {
      // Perpanjang / reset timer jika sudah aktif
      waktuMulai = millis();
      Serial.print(F("[INFO] Timer direset. Relay ON 5 detik (Level "));
      Serial.print(level);
      Serial.println(F(")."));
    } else {
      relayAktif = true;
      waktuMulai = millis();
      digitalWrite(RELAY_PIN, RELAY_ON);
      digitalWrite(LED_PIN, HIGH);
      Serial.print(F("[RELAY] ON — Level "));
      Serial.print(level);
      Serial.println(F(" — Mati otomatis dalam 5 detik."));
    }
    return;
  }

  // Level tidak dikenali
  Serial.print(F("[ERROR] Level tidak valid: "));
  Serial.println(level);
}
