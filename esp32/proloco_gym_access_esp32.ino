/*
  Proloco Gym Access - ESP32 firmware

  Hardware base:
  - ESP32 DevKit
  - Lettore NFC PN532 I2C/IRQ
  - Relè per elettroserratura / incontro elettrico
  - LED verde, LED rosso, buzzer
  - Pulsante uscita interno

  Display opzionale:
  - OLED SSD1306 I2C 128x64, indirizzo 0x3C
  - Per abilitarlo: lascia USE_OLED = 1 e installa Adafruit SSD1306 + Adafruit GFX.
  - Se non monti il display, imposta USE_OLED = 0: il sistema funziona ugualmente.

  Librerie Arduino:
  - WiFi
  - HTTPClient
  - ArduinoJson
  - Adafruit PN532
  - LittleFS
  - time
  - Adafruit SSD1306, Adafruit GFX opzionali
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_PN532.h>
#include <LittleFS.h>
#include <time.h>

#define USE_OLED 1
#if USE_OLED
  #include <Adafruit_GFX.h>
  #include <Adafruit_SSD1306.h>
  #define SCREEN_WIDTH 128
  #define SCREEN_HEIGHT 64
  Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
#endif

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
unsigned long syncInterval = 24UL * 60UL * 60UL * 1000UL;
unsigned long antiPassbackMs = 60UL * 1000UL;
int openSeconds = 5;
String allowedFrom = "06:00";
String allowedTo = "23:00";
String gymName = "Proloco Gym";

String lastSerial = "";
unsigned long lastSerialTime = 0;

void beep(int ms){ digitalWrite(BUZZER,HIGH); delay(ms); digitalWrite(BUZZER,LOW); }

void showDisplay(String line1, String line2="", String line3="", String line4="") {
  Serial.println(line1 + " | " + line2 + " | " + line3 + " | " + line4);
#if USE_OLED
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0,0); display.println(line1);
  display.setCursor(0,16); display.println(line2);
  display.setCursor(0,32); display.println(line3);
  display.setCursor(0,48); display.println(line4);
  display.display();
#endif
}

String nowHuman(){
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)) return "Ora non sync";
  char buf[24]; strftime(buf,sizeof(buf),"%d/%m/%Y %H:%M",&timeinfo);
  return String(buf);
}

String todayDate(){
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)) return "1970-01-01";
  char buf[11]; strftime(buf,sizeof(buf),"%Y-%m-%d",&timeinfo);
  return String(buf);
}

bool timeAllowed(){
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)) return true; // se NTP non disponibile non blocca, si affida alla cache giornaliera
  char buf[6]; strftime(buf,sizeof(buf),"%H:%M",&timeinfo);
  String now = String(buf);
  if(allowedFrom <= allowedTo) return now >= allowedFrom && now <= allowedTo;
  return now >= allowedFrom || now <= allowedTo; // fascia che supera mezzanotte
}

void openDoor(String name, String level){
  digitalWrite(LED_GREEN,HIGH);
  digitalWrite(RELAY_PIN,HIGH);
  beep(80);
  showDisplay("ACCESSO OK", name.substring(0,20), "Livello: " + level, nowHuman());
  delay(openSeconds * 1000);
  digitalWrite(RELAY_PIN,LOW);
  digitalWrite(LED_GREEN,LOW);
  showDisplay(gymName, "Avvicina tessera", WiFi.status()==WL_CONNECTED?"Online":"Offline cache", nowHuman());
}

void deny(String reason){
  digitalWrite(LED_RED,HIGH);
  beep(250);
  showDisplay("ACCESSO NEGATO", reason, "", nowHuman());
  delay(1100);
  digitalWrite(LED_RED,LOW);
}

String uidToString(uint8_t *uid, uint8_t uidLength) {
  String s="";
  for(uint8_t i=0;i<uidLength;i++){ if(uid[i]<0x10)s += "0"; s += String(uid[i],HEX); if(i<uidLength-1)s += ":"; }
  s.toUpperCase();
  return s;
}

void saveFile(const char* path, String data){ File f=LittleFS.open(path,"w"); if(f){ f.print(data); f.close(); } }
String readFile(const char* path){ File f=LittleFS.open(path,"r"); if(!f)return ""; String s=f.readString(); f.close(); return s; }

void loadSettingsFromJson(DynamicJsonDocument &doc){
  if(doc["settings"].is<JsonObject>()){
    JsonObject st = doc["settings"];
    openSeconds = st["openSeconds"] | 5;
    int ap = st["antiPassbackSeconds"] | 60;
    antiPassbackMs = (unsigned long)ap * 1000UL;
    allowedFrom = String((const char*)(st["allowedFrom"] | "06:00"));
    allowedTo = String((const char*)(st["allowedTo"] | "23:00"));
    gymName = String((const char*)(st["gymName"] | "Proloco Gym"));
  }
}

bool syncAccessList(){
  if(WiFi.status()!=WL_CONNECTED) return false;
  HTTPClient http;
  String url = String(SERVER) + "/api/esp32/access-list?deviceId=" + DEVICE_ID + "&deviceKey=" + DEVICE_KEY;
  http.begin(url);
  int code = http.GET();
  if(code==200){
    String body=http.getString();
    saveFile("/access.json", body);
    DynamicJsonDocument doc(65536);
    if(!deserializeJson(doc,body)) loadSettingsFromJson(doc);
    lastSync=millis();
    http.end();
    showDisplay("Sync completata", gymName, "Lista aggiornata", nowHuman());
    return true;
  }
  http.end(); return false;
}

void saveOfflineLog(String serial, String cardCode, String result, String reason, String level, String name){
  File f=LittleFS.open("/offline_logs.txt","a");
  if(f){ f.println(serial+"|"+cardCode+"|"+result+"|"+reason+"|"+level+"|"+name+"|"+nowHuman()); f.close(); }
}

void sendLog(String serial, String cardCode, String result, String reason, String level="", String name=""){
  if(WiFi.status()!=WL_CONNECTED){ saveOfflineLog(serial,cardCode,result,reason,level,name); return; }
  HTTPClient http;
  http.begin(String(SERVER)+"/api/esp32/log-access");
  http.addHeader("Content-Type","application/json");
  StaticJsonDocument<768> doc;
  doc["deviceId"]=DEVICE_ID; doc["deviceKey"]=DEVICE_KEY; doc["nfcSerial"]=serial; doc["cardCode"]=cardCode;
  doc["result"]=result; doc["reason"]=reason; doc["accessLevel"]=level; doc["displayName"]=name; doc["createdAt"]=nowHuman();
  if(level=="cleaner") doc["note"]="Accesso pulizie registrato da ESP32";
  String payload; serializeJson(doc,payload);
  http.POST(payload); http.end();
}

bool dateValid(String validUntil){
  if(validUntil.length()<10) return false;
  String today = todayDate();
  if(today == "1970-01-01") return true;
  return validUntil >= today;
}

struct CardResult { bool ok; String cardCode; String result; String reason; String name; String level; };

CardResult checkCard(String serial){
  CardResult r; r.ok=false; r.cardCode=""; r.result="denied"; r.reason="unknown"; r.name=""; r.level="member";
  String json = readFile("/access.json");
  if(json.length()<10){ r.reason="cache_empty"; return r; }
  DynamicJsonDocument doc(65536);
  if(deserializeJson(doc,json)){ r.reason="cache_error"; return r; }
  loadSettingsFromJson(doc);
  JsonArray cards = doc["cards"].as<JsonArray>();
  for(JsonObject c: cards){
    String s = c["nfc_serial"] | "";
    if(s == serial){
      r.cardCode = String((const char*)c["card_code"]);
      r.name = String((const char*)(c["full_name"] | "Utente"));
      r.level = String((const char*)(c["access_level"] | "member"));
      bool revoked = c["revoked"] | false;
      String status = c["status"] | "";
      int oneShot = c["one_shot"] | 0;
      String validUntil = String((const char*)(c["valid_until"] | ""));
      if(status != "active"){ r.reason="card_blocked"; return r; }
      if(revoked){ r.reason="revoked"; return r; }
      if(!timeAllowed() && r.level != "cleaner" && r.level != "staff" && r.level != "admin"){ r.reason="outside_hours"; return r; }
      if(r.level == "cleaner") { r.ok=true; r.result="granted_cleaner"; r.reason="cleaner_unlimited"; return r; }
      if(r.level == "staff" || r.level == "admin") { r.ok=true; r.result="granted"; r.reason="staff_unlimited"; return r; }
      if(oneShot > 0){ r.ok=true; r.result="granted_one_shot"; r.reason="one_shot"; return r; }
      if(!dateValid(validUntil)){ r.reason="expired"; return r; }
      r.ok=true; r.result="granted"; r.reason="valid_subscription"; return r;
    }
  }
  r.reason="unknown_card"; return r;
}

void setup(){
  pinMode(RELAY_PIN,OUTPUT); pinMode(LED_GREEN,OUTPUT); pinMode(LED_RED,OUTPUT); pinMode(BUZZER,OUTPUT); pinMode(EXIT_BUTTON,INPUT_PULLUP);
  digitalWrite(RELAY_PIN,LOW);
  Serial.begin(115200);
  LittleFS.begin(true);
  Wire.begin();
#if USE_OLED
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay(); display.display();
#endif
  showDisplay("Proloco Gym", "Avvio sistema", "Connessione WiFi", "");
  WiFi.begin(WIFI_SSID,WIFI_PASS);
  for(int i=0;i<24 && WiFi.status()!=WL_CONNECTED;i++){ delay(500); Serial.print("."); }
  configTime(3600, 3600, "pool.ntp.org", "time.google.com"); // Italia: base + DST semplificato
  nfc.begin(); nfc.SAMConfig();
  syncAccessList();
  showDisplay(gymName, "Avvicina tessera", WiFi.status()==WL_CONNECTED?"Online":"Offline cache", nowHuman());
}

void loop(){
  if(digitalRead(EXIT_BUTTON)==LOW){ openDoor("Uscita interna", "exit"); delay(500); }
  if(millis()-lastSync > syncInterval) syncAccessList();
  uint8_t uid[] = {0,0,0,0,0,0,0}; uint8_t uidLength;
  bool success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 100);
  if(success){
    String serial = uidToString(uid, uidLength);
    if(serial==lastSerial && millis()-lastSerialTime<antiPassbackMs){ deny("anti-passback"); sendLog(serial,"","denied","anti_passback"); return; }
    CardResult cr = checkCard(serial);
    sendLog(serial, cr.cardCode, cr.result, cr.reason, cr.level, cr.name);
    if(cr.ok){ lastSerial=serial; lastSerialTime=millis(); openDoor(cr.name, cr.level); }
    else deny(cr.reason);
  }
}
