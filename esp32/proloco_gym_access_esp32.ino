/*
  Proloco Gym Access - ESP32 firmware skeleton
  Hardware consigliato:
  - ESP32 DevKit
  - Lettore NFC PN532 I2C
  - Relè 5V/12V per elettroserratura
  - LED verde/rosso + buzzer
  - Pulsante uscita interno

  Librerie Arduino:
  - WiFi
  - HTTPClient
  - ArduinoJson
  - Adafruit PN532
  - LittleFS
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_PN532.h>
#include <LittleFS.h>

#define PN532_IRQ   4
#define PN532_RESET 5
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET);

const char* WIFI_SSID = "INSERISCI_WIFI";
const char* WIFI_PASS = "INSERISCI_PASSWORD";
const char* SERVER = "http://192.168.1.100:3100";
const char* DEVICE_ID = "porta-palestra-01";
const char* DEVICE_KEY = "CAMBIA_QUESTA_CHIAVE";

const int RELAY_PIN = 26;
const int LED_GREEN = 27;
const int LED_RED = 14;
const int BUZZER = 12;
const int EXIT_BUTTON = 25;

unsigned long lastSync = 0;
const unsigned long SYNC_INTERVAL = 24UL * 60UL * 60UL * 1000UL;
String lastSerial = "";
unsigned long lastSerialTime = 0;

void beep(int ms){ digitalWrite(BUZZER,HIGH); delay(ms); digitalWrite(BUZZER,LOW); }
void openDoor(){ digitalWrite(LED_GREEN,HIGH); digitalWrite(RELAY_PIN,HIGH); beep(80); delay(5000); digitalWrite(RELAY_PIN,LOW); digitalWrite(LED_GREEN,LOW); }
void deny(){ digitalWrite(LED_RED,HIGH); beep(250); delay(900); digitalWrite(LED_RED,LOW); }

String uidToString(uint8_t *uid, uint8_t uidLength) {
  String s="";
  for(uint8_t i=0;i<uidLength;i++){ if(uid[i]<0x10)s += "0"; s += String(uid[i],HEX); if(i<uidLength-1)s += ":"; }
  s.toUpperCase();
  return s;
}

void saveFile(const char* path, String data){ File f=LittleFS.open(path,"w"); if(f){ f.print(data); f.close(); } }
String readFile(const char* path){ File f=LittleFS.open(path,"r"); if(!f)return ""; String s=f.readString(); f.close(); return s; }

bool syncAccessList(){
  if(WiFi.status()!=WL_CONNECTED) return false;
  HTTPClient http;
  String url = String(SERVER) + "/api/esp32/access-list?deviceId=" + DEVICE_ID + "&deviceKey=" + DEVICE_KEY;
  http.begin(url);
  int code = http.GET();
  if(code==200){ String body=http.getString(); saveFile("/access.json", body); lastSync=millis(); http.end(); return true; }
  http.end(); return false;
}

void sendLog(String serial, String cardCode, String result, String reason){
  if(WiFi.status()!=WL_CONNECTED){
    File f=LittleFS.open("/offline_logs.txt","a");
    if(f){ f.println(serial+","+cardCode+","+result+","+reason); f.close(); }
    return;
  }
  HTTPClient http;
  http.begin(String(SERVER)+"/api/esp32/log-access");
  http.addHeader("Content-Type","application/json");
  StaticJsonDocument<512> doc;
  doc["deviceId"]=DEVICE_ID; doc["deviceKey"]=DEVICE_KEY; doc["nfcSerial"]=serial; doc["cardCode"]=cardCode; doc["result"]=result; doc["reason"]=reason;
  String payload; serializeJson(doc,payload);
  http.POST(payload); http.end();
}

bool isDateValid(const char* validUntil){
  // Skeleton: per controllo data reale serve NTP configurato.
  // In questa prima versione si demanda la lista aggiornata giornaliera al server.
  return true;
}

bool checkCard(String serial, String &cardCode, String &result, String &reason){
  String json = readFile("/access.json");
  if(json.length()<10){ result="denied"; reason="cache_empty"; return false; }
  DynamicJsonDocument doc(32768);
  DeserializationError err = deserializeJson(doc,json);
  if(err){ result="denied"; reason="cache_error"; return false; }
  JsonArray cards = doc["cards"].as<JsonArray>();
  for(JsonObject c: cards){
    String s = c["nfc_serial"] | "";
    if(s == serial){
      cardCode = String((const char*)c["card_code"]);
      bool revoked = c["revoked"] | false;
      String status = c["status"] | "";
      int oneShot = c["one_shot"] | 0;
      if(status != "active"){ result="denied"; reason="card_blocked"; return false; }
      if(revoked){ result="denied"; reason="revoked"; return false; }
      if(oneShot > 0){ result="granted_one_shot"; reason="one_shot"; return true; }
      result="granted"; reason="valid_subscription"; return true;
    }
  }
  result="denied"; reason="unknown_card"; return false;
}

void setup(){
  pinMode(RELAY_PIN,OUTPUT); pinMode(LED_GREEN,OUTPUT); pinMode(LED_RED,OUTPUT); pinMode(BUZZER,OUTPUT); pinMode(EXIT_BUTTON,INPUT_PULLUP);
  digitalWrite(RELAY_PIN,LOW);
  Serial.begin(115200);
  LittleFS.begin(true);
  WiFi.begin(WIFI_SSID,WIFI_PASS);
  for(int i=0;i<20 && WiFi.status()!=WL_CONNECTED;i++){ delay(500); Serial.print("."); }
  nfc.begin(); nfc.SAMConfig();
  syncAccessList();
}

void loop(){
  if(digitalRead(EXIT_BUTTON)==LOW){ openDoor(); delay(500); }
  if(millis()-lastSync > SYNC_INTERVAL) syncAccessList();
  uint8_t uid[] = {0,0,0,0,0,0,0}; uint8_t uidLength;
  bool success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 100);
  if(success){
    String serial = uidToString(uid, uidLength);
    if(serial==lastSerial && millis()-lastSerialTime<60000){ deny(); sendLog(serial,"","denied","anti_passback"); return; }
    String cardCode="", result="", reason="";
    bool ok = checkCard(serial, cardCode, result, reason);
    sendLog(serial, cardCode, result, reason);
    if(ok){ lastSerial=serial; lastSerialTime=millis(); openDoor(); }
    else deny();
  }
}
