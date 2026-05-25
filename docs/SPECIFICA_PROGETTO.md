# Specifica Proloco Gym Access

## Obiettivo
Gestire l'accesso alla palestra tramite tessere NFC numerate, abbonamenti, rinnovi da bar/ristorante, log accessi e porta elettronica con ESP32.

## Flusso cliente
1. Cliente riceve tessera con codice stampato.
2. La tessera ha un seriale NFC collegato al profilo.
3. Se appoggiata al telefono può aprire la pagina pubblica della palestra.
4. Alla porta, il lettore legge il seriale e l'ESP32 verifica la cache locale.
5. Se abbonamento valido/non revocato, apre la porta.

## Rinnovi
- Giornaliero: +1 giorno
- Mensile: +31 giorni
- Annuale: +366 giorni
- Se l'abbonamento è ancora attivo, i giorni vengono aggiunti alla scadenza attuale.
- Se è scaduto, i giorni partono da oggi.

## Sezioni
- Admin Proloco: gestione completa.
- Amministrazione Bar: rinnovi e ingressi singoli.
- Totem interno palestra: controllo tessera e informazioni.
- Pagina pubblica: informazioni e regolamento.
- ESP32: lettura NFC, cache offline, log accessi.

## Sicurezza
- Admin protetto da password.
- Operator login per bar/ristoranti.
- API key segreta per ESP32.
- Log IP/ora/azione.
- Consigliato HTTPS se online.

## Da completare prima della produzione
- NTP reale su ESP32 per controllo preciso date offline.
- Sincronizzazione log offline accumulati.
- Gestione allegati documenti/certificati.
- Stampa ricevuta PDF.
- Privacy/GDPR e informativa dati.
