# Farbloses Glas in Haze 1.2

Der native Materialrenderer aus dem bereitgestellten Ordner `Haze-Colorless-Glass` wird in die bestehende Electron-App eingebunden. Die separate Demo-App und ihre Beispielwerte werden nicht übernommen.

## Bewusster Kompromiss

- Die vorhandenen Nightscout-Daten, Zugangsdaten, Autostart-Einstellungen, Profile und Taskleistenanzeige bleiben erhalten.
- Der Messwert behält die kleine Änderung in Klammern. Die native Ebene erhält ausschließlich Position, Kontur, Weichzeichnung und Effektstärke, keine Messwerte oder Zugangsdaten.
- Die vorhandene konkave Kontur und Andockanimation bestimmen auch die Glasmaske. Transparente Außenflächen und die optische Ebene fangen keine zusätzlichen Mausaktionen ab.
- Die künstliche blaue Tönung und aufgemalten Lichtkanten entfallen. Randbrechung und Weichzeichnung stammen vom wirklichen Monitorhintergrund.
- Transparenz bleibt von 0 bis 95 % regelbar. Eine neutrale helle/dunkle Deckfläche macht 0 % tatsächlich deckend. Bei 95 % bleibt eine schwache neutrale Deckfläche zur Lesbarkeit; dies ist bewusst keine farbige Glastönung. Die Schrift bleibt unabhängig davon sichtbar.
- Weichzeichnung ist zusätzlich von 0 bis 18 Bildschirm-Pixeln einstellbar. Bei 0 bleibt die Mitte klar, die Randbrechung bleibt erhalten.
- „Echte Hintergrundbrechung“ lässt sich ausschalten. Dann bleibt eine normale transparente Fläche ohne Desktop-Verarbeitung.

## Verarbeitung und Grenzen

DXGI liefert Monitorbilder direkt in den Grafikspeicher. Es werden keine Hintergrundbilder gespeichert, hochgeladen oder zur CPU zurückgelesen. Nur die Shader-Selbsttests lesen künstlich erzeugte Testbilder zurück. Der Hintergrundrenderer und das Textfenster werden aus Bildschirmaufnahmen ausgeschlossen, um optische Rückkopplungen zu vermeiden; das Widget kann daher in Screenshots und Bildschirmfreigaben fehlen.

Die Aktualisierung ist auf ungefähr 30 Prüfungen pro Sekunde begrenzt. Ausblenden, Abschalten, deckende Darstellung, Windows-Kontrastmodus, Sperrbildschirm und Standby geben die aktive Aufnahme frei. Bei Fehlern bleibt die transparente Messwertanzeige bestehen; der Status steht in den Widget-Einstellungen. Erneute Startversuche erfolgen frühestens nach fünf Sekunden.

Der Zusatz benötigt Windows, Direct3D 11 und einen unterstützten SDR-Monitor. HDR und gedrehte Monitore werden vom Zusatz abgelehnt und verwenden die transparente Ersatzanzeige. Exklusives Vollbild, mehrere GPUs, Remote Desktop und langfristige Spielelast sind nicht allgemein zugesichert. Ein kurzer lokaler Funktionstest ersetzt keinen Gaming-Dauertest.

Die Browser-Vorschau zeigt die neutrale Deckfläche; echte Hintergrundbrechung gibt es nur im Desktop-Widget.
