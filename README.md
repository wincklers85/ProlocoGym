
# Proloco Gym Access

Sistema completo gestione accessi palestra con NFC/RFID sviluppato per la Proloco.

## Funzioni principali

### Accesso palestra
- Apertura porta tramite tessera NFC/RFID
- Controllo scadenza abbonamento online
- Cache offline ESP32
- Log accessi
- Accessi negati registrati
- Entrata singola temporanea
- Revoca tessera
- Anti passback
- Fasce orarie configurabili

### Admin Proloco
Accesso protetto con password admin.

Funzioni:
- Gestione clienti
- Gestione tessere
- Gestione prezzi
- Gestione operatori bar
- Gestione accessi
- Gestione pagamenti
- Gestione log
- Gestione ESP32
- Apertura remota porta
- Backup database
- Esportazione CSV/Excel
- Statistiche
- Gestione documenti e certificati

Password admin iniziale:
- Username: admin
- Password: babyjake

## Sezione Bar / Ristorante

Operatore demo configurato:

- Nome: Bar Il Gallo Nero
- Username: gallonero
- Password: gallo123

Funzioni:
- Rinnovo abbonamenti
- Entrata singola
- Storico movimenti
- Ricerca cliente
- Ricerca tessera
- Registrazione pagamenti
- Tracciamento IP e data/ora

## Totem palestra

Il totem interno permette:
- Controllo scadenza
- Visualizzazione storico accessi
- Informazioni palestra
- Regolamento
- Stato tessera
- Dati iscrizione

## Struttura progetto

/backend
- server Node.js
- API REST
- SQLite

/frontend
- admin
- bar
- totem
- public

/esp32
- firmware ESP32
- gestione cache
- lettura NFC
- controllo porta

/database
- database SQLite

/uploads
- documenti
- certificati
- loghi

## Tecnologie utilizzate

- Node.js
- Express
- SQLite
- HTML5
- CSS3
- JavaScript
- ESP32 Arduino Framework

## Installazione locale

Installare Node.js.

Aprire terminale nella cartella progetto:

```bash
npm install
npm start
```

Aprire browser:

Admin:
http://localhost:3100/admin

Bar:
http://localhost:3100/bar

Totem:
http://localhost:3100/totem

## Deploy GitHub

1. Creare repository GitHub
2. Caricare tutti i file
3. Installare dipendenze su server
4. Avviare con:

```bash
npm install
npm start
```

## Deploy consigliato

Consigliato:
- Render
- Railway
- VPS Ubuntu
- Mini PC locale

## Hardware consigliato

### Porta palestra
- ESP32
- PN532 NFC
- Elettroserratura 12V
- Alimentatore 12V
- Relè
- Pulsante uscita
- LED rosso/verde
- Buzzer

### Totem palestra
- Tablet Android
oppure
- Mini PC touch

### Bar
- Tablet Android
oppure
- PC Windows

## API ESP32

Access list:
`/api/esp32/access-list`

Invio log:
`/api/esp32/log`

Heartbeat:
`/api/esp32/ping`

## Sicurezza

- Password hashate
- API key ESP32
- Cache offline
- Log IP
- Sessioni protette
- Revoca tessere
- Backup automatici

## Idee future

- App mobile
- QR code accesso
- Pagamenti automatici
- Statistiche avanzate
- Telegram bot
- WhatsApp notifiche
- Multi palestra
- Tornelli
- Prenotazione corsi
- Monitor palestra live

## Note

Questo progetto è stato progettato specificatamente per:
- Proloco
- Palestre locali
- Associazioni
- Sale sportive
- Accessi controllati

Sviluppato per Stephan Winckler.
