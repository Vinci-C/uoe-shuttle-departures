/*
 * Booth boarding reader for the UoE shuttle departures demo.
 *
 * Hardware: Seeed PN532 NFC Shield (SPI, CS pin 10) on an Arduino UNO R3.
 * Board: Arduino AVR Boards -> Arduino UNO.
 * Library: Seeed Arduino NFC (NfcAdapter + PN532_SPI). Copy the library zip from
 * this folder into ~/Documents/Arduino/libraries, or install it from the Library
 * Manager ("Seeed Arduino NFC").
 *
 * What it does
 *   Reads the UID of any NFC tag, hashes it (FNV-1a 32-bit) and prints one JSON
 *   line per tap. The raw UID never leaves the board.
 *
 *   The hash is a one-way digest with no salt, so it is not a real identity: a
 *   demo token is only good enough to tell two different cards apart. Do not use
 *   this for anything that matters.
 *
 * Serial protocol (115200 baud, 8N1, newline delimited)
 *   out: {"v":1,"uid":"b1c2d3e4","tag":"NTAG213"}      a tap
 *   out: {"v":1,"event":"ready","fw":"1.0.0"}          on boot
 *   out: {"v":1,"event":"held","card":"b1c2d3e4"}      re-tap ignored (<10s)
 *   out: {"v":1,"event":"error","code":2}               1 = no tag, 2 = read failed
 *
 * Debounce: the same card is ignored for 10 seconds so a card left on the reader
 * is not counted twice.
 *
 * Wiring
 *   PN532 shield VCC  -> 5V   (5V is required; 3.3V power will not read tags)
 *   PN532 shield GND  -> GND
 *   PN532 shield SPI  -> D13 / D12 / D11 (hardware SPI)
 *   PN532 shield CS   -> D10
 *   (all fixed on the Seeed shield; nothing else to wire)
 */

#include <NfcAdapter.h>
#include <PN532/PN532/PN532.h>
#include <SPI.h>
#include <PN532/PN532_SPI/PN532_SPI.h>

PN532_SPI pn532spi(SPI, 10);
NfcAdapter nfc = NfcAdapter(pn532spi);

const char* FW_VERSION = "1.0.0";
const unsigned long DEBOUNCE_MS = 10000UL;
const int UID_BUFFER_SIZE = 12;

// Last accepted card and when it was accepted.
String lastCard = "";
unsigned long lastCardAt = 0;

// Tracks the last observed tag state so "no tag in field" is reported once per
// transition rather than every 400ms for the whole demo.
bool tagWasPresent = false;

uint32_t fnv1a32(const uint8_t* data, uint8_t length) {
  uint32_t hash = 2166136261UL; // FNV offset basis
  for (uint8_t i = 0; i < length; i++) {
    hash ^= data[i];
    hash *= 16777619UL; // FNV prime
  }
  return hash;
}

// Hex UID -> 8 character hash string, e.g. "04a1b2c3" -> "b1c2d3e4".
String hashUid(const uint8_t* uid, uint8_t length) {
  char buffer[9];
  snprintf(buffer, sizeof(buffer), "%08lx", (unsigned long)fnv1a32(uid, length));
  return String(buffer);
}

void printEvent(const char* event, const String& card) {
  Serial.print("{\"v\":1,\"event\":\"");
  Serial.print(event);
  Serial.print("\"");
  if (card.length() > 0) {
    Serial.print(",\"card\":\"");
    Serial.print(card);
    Serial.print("\"");
  }
  Serial.println("}");
}

// 1 = no tag in field, 2 = tag could not be read.
void printError(int code) {
  Serial.print("{\"v\":1,\"event\":\"error\",\"code\":");
  Serial.print(code);
  Serial.println("}");
}

void printReady() {
  Serial.print("{\"v\":1,\"event\":\"ready\",\"fw\":\"");
  Serial.print(FW_VERSION);
  Serial.println("\"}");
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {
    // Boards with native USB reset need a moment before the port exists.
  }

  nfc.begin();
  printReady();
}

void loop() {
  if (!nfc.tagPresent()) {
    // Report the empty reader once per transition, not continuously: the kiosk
    // reads this stream and a repeating line is pure noise.
    if (tagWasPresent) {
      printError(1);
      tagWasPresent = false;
    }
    delay(400);
    return;
  }
  tagWasPresent = true;

  NfcTag tag = nfc.read();
  uint8_t length = tag.getUidLength();
  if (length == 0 || length > UID_BUFFER_SIZE) {
    printError(2);
    delay(400);
    return;
  }

  uint8_t uid[UID_BUFFER_SIZE];
  tag.getUid(uid, length);

  String card = hashUid(uid, length);
  unsigned long now = millis();

  if (card == lastCard && (now - lastCardAt) < DEBOUNCE_MS) {
    printEvent("held", card);
  } else {
    // {"v":1,"uid":"b1c2d3e4","tag":"NTAG213"}
    Serial.print("{\"v\":1,\"uid\":\"");
    Serial.print(card);
    Serial.print("\",\"tag\":\"");
    Serial.print(tag.getTagType());
    Serial.println("\"}");

    lastCard = card;
    lastCardAt = now;
  }

  delay(400);
}
