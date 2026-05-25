# Proloco Gym Access v1.2

Sistema completo per gestione accessi palestra Proloco con tessere NFC, ESP32, serratura elettronica, tablet al bar, area Admin, Totem interno e diario pulizie automatico.

## Credenziali demo

### Admin Proloco
- URL: `/admin`
- Password: `babyjake`

### Bar demo
- URL: `/bar`
- Username: `gallonero`
- Password: `gallo123`
- Nome operatore: **Bar Il Gallo Nero**

> Cambiare subito queste credenziali prima dell'uso reale.

## Novità v1.2

- Sito configurabile da Admin.
- Temi grafici puliti ispirati a palestre e studi fitness.
- Temi inclusi:
  - Clean Light
  - Clean Blue
  - Warm Studio
  - Minimal White
  - Dark Premium
- Nome palestra configurabile.
- Testo logo configurabile.
- Fasce orarie configurabili.
- Secondi apertura porta configurabili.
- Anti-passback configurabile.
- Limite accessi giornalieri predisposto.
- Livelli accesso tessera:
  - `member`: membro palestra normale
  - `cleaner`: pulizie, accesso illimitato e registrazione automatica nel diario pulizie
  - `staff`: staff Proloco, accesso illimitato
  - `admin`: admin tecnico, accesso illimitato
- Nuova sezione **Diario pulizie**.
- Firmware ESP32 aggiornato con display OLED opzionale.
- Il display mostra:
  - nome utente autenticato
  - data e ora
  - livello accesso
  - stato online/offline
  - accesso negato e motivo

## Funzionamento generale

1. Il cliente riceve una tessera NFC con numero stampato, per esempio `GYM-001`.
2. La tessera ha un seriale NFC fisico, collegato al profilo cliente.
3. Il bar accede alla sezione Amministrazione e rinnova la tessera.
4. La porta con ESP32 scarica la lista accessi dal server.
5. Quando il cliente avvicina la tessera, l'ESP32 controlla la cache locale.
6. Se l'abbonamento è valido, apre la porta.
7. Se è scaduto, revocato o fuori orario, nega l'accesso e registra il tentativo.
8. Se la tessera è di livello `cleaner`, apre senza scadenza e registra automaticamente il diario pulizie.

## Regola rinnovi

Se la tessera è ancora valida, il rinnovo parte dalla scadenza attuale.
Se è già scaduta, il rinnovo parte da oggi.

Durate predefinite:
- Giornaliero: 1 giorno
- Mensile: 31 giorni
- Annuale: 366 giorni

I prezzi sono configurabili da Admin.

## Avvio locale

```bash
npm install
npm start
```

Aprire:

```text
http://localhost:3100/admin
http://localhost:3100/bar
http://localhost:3100/totem
http://localhost:3100/public
```

## Struttura progetto

```text
backend/
  server.js                 Backend Node.js + Express + SQLite
frontend/
  style.css                 Tema globale configurabile
  theme.js                  Applica tema pubblico
  admin/                    Pannello Admin Proloco
  bar/                      Area Bar Il Gallo Nero / operatori
  totem/                    Totem interno palestra
  public/                   Pagina pubblica palestra
esp32/
  proloco_gym_access_esp32.ino
assets/
  logo.svg
data/
  gym_access.db             Creato automaticamente
  backups/                  Backup database
docs/
  SPECIFICA_PROGETTO.md
  COLLEGAMENTI_PORTA.md
```

## Sezioni web

### Admin
Permette di gestire:
- clienti
- tessere
- livelli accesso
- prezzi
- operatori bar/ristorante
- contabilità
- accessi porta
- log operazioni
- diario pulizie
- temi e impostazioni
- backup database

### Bar / Ristorante
Permette di:
- cercare tessera tramite codice stampato
- vedere scadenza
- rinnovare giornaliero/mensile/annuale
- registrare importo pagato
- concedere entrata singola
- tenere traccia di IP, ora e operatore

### Totem palestra
Permette al cliente di:
- inserire codice tessera
- vedere scadenza
- vedere stato abbonamento
- vedere certificato medico
- vedere ultimi accessi

### Pagina pubblica
Mostra:
- nome palestra
- messaggio pubblico
- orari accesso
- regolamento base

## API principali

### ESP32 scarica lista accessi

```text
GET /api/esp32/access-list?deviceId=porta-palestra-01&deviceKey=CAMBIA_QUESTA_CHIAVE
```

Risposta include:
- impostazioni porta
- orari
- anti-passback
- secondi apertura
- elenco tessere
- livello accesso
- scadenze
- entrate singole

### ESP32 invia log accesso

```text
POST /api/esp32/log-access
```

Body esempio:

```json
{
  "deviceId": "porta-palestra-01",
  "deviceKey": "CAMBIA_QUESTA_CHIAVE",
  "nfcSerial": "04:A2:7B:91",
  "cardCode": "GYM-001",
  "result": "granted_cleaner",
  "reason": "cleaner_unlimited",
  "accessLevel": "cleaner",
  "displayName": "Pulizie"
}
```

## Hardware consigliato porta

- ESP32 DevKit
- Lettore NFC PN532
- Relè 5V/12V oppure modulo relè optoisolato
- Elettroserratura o incontro elettrico 12V
- Alimentatore 12V serio
- Step-down 12V -> 5V per ESP32
- Pulsante interno uscita
- LED rosso
- LED verde
- Buzzer
- Router 4G o Wi-Fi stabile
- UPS piccolo 12V consigliato

## Display opzionale ESP32

Il firmware supporta un display OLED SSD1306 I2C 128x64.

Collegamenti tipici:

```text
OLED VCC -> 3.3V
OLED GND -> GND
OLED SDA -> GPIO 21
OLED SCL -> GPIO 22
```

Nel firmware:

```cpp
#define USE_OLED 1
```

Se non vuoi montare il display:

```cpp
#define USE_OLED 0
```

Il sistema continua a funzionare normalmente.

## Livello Pulizie

Per la donna delle pulizie crea una tessera con:

```text
Livello accesso: Pulizie - illimitato
```

Comportamento:
- accesso senza scadenza
- accesso anche fuori dagli orari normali
- registrazione automatica nel diario pulizie
- log porta normale conservato

## Sicurezza

Da fare prima dell'uso reale:
- cambiare password Admin
- cambiare password Bar demo
- cambiare `DEVICE_KEY` ESP32
- usare HTTPS se il server è online
- non lasciare il database esposto pubblicamente
- fare backup periodici
- usare tessere NFC decenti, sapendo che alcuni UID sono clonabili

## Deploy

GitHub Pages mostra solo pagine statiche e non esegue Node.js, SQLite o API.
Per il sistema vero usare:
- Render
- Railway
- VPS
- Mini PC locale
- NAS con Node.js

Per GitHub va bene salvare il codice e collegarlo a un servizio che esegue Node.js.

## Stato progetto

Questa è una base funzionante e personalizzabile. Per produzione reale servono ancora:
- autenticazione più robusta con sessioni/JWT
- password hash con bcrypt invece di SHA-256 semplice
- HTTPS
- gestione backup automatica schedulata
- test su hardware reale
- hardening API ESP32
