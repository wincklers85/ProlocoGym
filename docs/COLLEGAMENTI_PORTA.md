# Collegamenti porta consigliati

## Componenti
- ESP32 DevKit
- PN532 NFC I2C
- Modulo relè optoisolato
- Elettroserratura 12V o incontro elettrico
- Alimentatore 12V 3A
- Step-down 12V -> 5V per ESP32
- Pulsante uscita interno
- LED verde/rosso + buzzer

## Pin firmware
- Relè: GPIO 26
- LED verde: GPIO 27
- LED rosso: GPIO 14
- Buzzer: GPIO 12
- Pulsante uscita: GPIO 25
- PN532 I2C/IRQ/RESET: vedere sketch

## Nota sicurezza
Prevedere sempre apertura meccanica o sistema di emergenza. Non affidare l'unico accesso a elettronica/Internet.
