# Haze – Glukose im Blick

Persönliches Dashboard und minimalistisches Windows-Widget für eine vorhandene Nightscout-Instanz. Haze verwendet weiterhin die bestehende interne Datenablage `nebel-glucose`, damit gespeicherte Profile, Fensterpositionen und DPAPI-geschützte Zugangsdaten beim Update erhalten bleiben.

> **Kein Medizinprodukt.** Haze ist ein privates Projekt und nicht als Medizinprodukt zugelassen. Angezeigte Werte, Trends und Hinweise können verzögert, unvollständig oder falsch sein, etwa wenn Nightscout, Dexcom oder die Verbindung ausfallen. Therapieentscheidungen (z. B. Insulin, Kohlenhydrate) nur auf Grundlage deines zugelassenen CGM-Systems oder einer Blutzuckermessung treffen. Haze ersetzt keine Alarme des CGM-Systems.

## Installieren und einrichten

1. Den Installer `Haze-Setup-<version>.exe` von der [Releases-Seite](https://github.com/NojoMcDybo/Haze/releases) laden (oder selbst bauen, siehe unten) und im Windows-Datei-Explorer starten. Die Installation erfolgt für dein Windows-Konto unter `%LOCALAPPDATA%\Programs\Nebel`.
2. Danach **Haze** über die Desktop-Verknüpfung oder das Startmenü öffnen. Alte PowerShell-Overlays können geschlossen werden.
3. Zunächst **Demo erkunden** wählen oder **Nightscout verbinden**.
4. Die Adresse deiner Nightscout-Instanz eingeben, bei lokaler Installation zum Beispiel `http://127.0.0.1:1337`. Falls erforderlich einen Nightscout-Token mit Leserechten verwenden, keinen Dexcom-Benutzernamen und kein Dexcom-Passwort.
5. **Verbindung testen** zeigt den letzten gültigen Wert mit Datum und Uhrzeit. „Server erreichbar“ allein bedeutet nicht „aktuelle Messung“.
6. Einheit, Theme und Startoptionen wählen und die Verbindung übernehmen.

Ein normaler Start über die Desktop- oder Startmenü-Verknüpfung öffnet das Dashboard. Die Option „Beim Start nur Widget anzeigen“ gilt nur für den Windows-Autostart. Wenn das Widget nicht greifbar ist, im Infobereich **Position entsperren / Bearbeiten** wählen oder im Dashboard das Profil **Arbeit** auswählen; „Gaming“ kann bewusst Sperre und Durchklicken speichern.

Nightscout und seine Datenbank laufen separat und müssen selbst eingerichtet werden. Haze kann unter Windows automatisch nach der Anmeldung starten. Die persönliche Nightscout-Installation und ihre Zugangsdaten sind nicht Teil dieses Repositorys. Bei Verbindungsfehlern versucht Haze alle fünf Sekunden erneut zu verbinden.

Das Paket ist lokal gebaut und **nicht mit einem Publisher-Zertifikat signiert**. Eine offizielle Veröffentlichungsquelle ist noch nicht eingerichtet. Automatische App-Updates sind noch nicht eingerichtet.

## Widget und Andocken

Das Widget zeigt Wert, Trend, Einheit, Messwertalter und eine kleine Änderungszahl in Klammern direkt hinter dem Messwert. Es hat keine Werkzeugleiste und keine Hover-Schaltflächen. In **Einstellungen → Widget** kannst du die Schrift stufenlos ändern, Horizontal/Vertikal/Automatisch wählen, Klar oder das farblose Liquid Glass mit nativer Randbrechung und einstellbarer Weichzeichnung verwenden, die Anzeige sperren und Durchklicken einschalten.

Das Widget bewegt sich wie im nativen Widget Lab: Nahe einer Bildschirmkante (20 px) bildet sich ein Hals zur Kante. Zieht man weiter, dehnt und verjüngt er sich und reißt erst nach der **Haftstrecke** ab; das Widget streckt sich dabei kurz. Beim Loslassen federt es an die Kante und staucht sich. **Flüssigkeitseffekt** (0–100 %) und **Haftstrecke** (35–145 px) sind in **Einstellungen → Widget** einstellbar; mit „Bewegung reduzieren“ entfallen Federn, Stauchen und Dehnen, die Endformen bleiben gleich. **Doppelklick** auf das Widget öffnet die App (auch bei gesperrter Position). Mit „Rahmen passt sich der Schrift an“ (Standard) umschließt der Rahmen den Text und wächst mit der Schriftgröße; ausgeschaltet lässt sich die Größe an den Rändern frei ziehen. Unter **Ablösen vom Rand** wählst du das Verhalten: *Flüssig* (Verbindung dehnt sich bis zur Haftstrecke), *Direkt* (löst sich sofort ohne Verbindung und rastet erst beim Loslassen nahe einer Kante ein) oder *Gesperrt* (gleitet nur am Rand entlang; lösen über „Vom Rand lösen“). An Kanten zwischen zwei Monitoren wird nicht angedockt. Transparente Bereiche außerhalb der Kontur werden als Windows-Fensterregion ausgeschlossen und blockieren darunterliegende Anwendungen nicht.

Die **Schriftfarbe** des Widgets ist unabhängig vom App-Theme wählbar (hell für dunkle, dunkel für helle Hintergründe) – wichtig beim Glas, wo der Desktop durchscheint.

### Aussehen

Haze spricht seit 1.4 dieselbe Designsprache wie Folio, Helio und die Notch-Einstellungen (Quelle `D:\Dev\nojo-design`, Kopie unter `src/nojo/`): Folio-Grau statt Petrol, Karten ohne harte Ränder, **Liquid Glass** wie in Folio für alles Schwebende (klare Mitte, der Rand bricht, was darunter liegt, Lichtkante oben links: Fensterknöpfe, Farbschema und Einstellungen im Kopf, das Einstellungsfenster mit schwebenden Reitern, Hinweise, Meldungen und die Ablesung im Diagramm, die als Glaspille über der Kurve dem Zeiger folgt), Licht als Information. Die Einstellungen kommen mit wenig Text aus; Erklärungen stehen als Tooltip am Element. Symbole kommen aus der gemeinsamen Bibliothek (`src/Icon.tsx` liest `src/nojo/nojo-icons.ts`, der Desktop-Teil `shared/nojo-icons.json`; Quelle `nojo-design/assets/icons.mjs`) – dieselben wie in Notch, Helio und Arena, statt lucide-react. Statt einer Bildlaufleiste zeigt eine dünne **Lichtleiste** am rechten Rand die Position (leuchtet beim Scrollen kurz auf, lässt sich ziehen). Elemente mit Doppelfunktion: die **Zeitbereich-Knöpfe** tragen ihre Zeit im Zielbereich als feinen Strich; unter dem Alter füllt sich ein **Messwert-Strich** bis zum nächsten erwarteten Wert und leuchtet kurz bei einem neuen; das **Einstellungs-Symbol** bekommt einen Punkt, wenn ein Update bereitliegt. Das Widget selbst bleibt unverändert.

### Notch

Läuft die Notch-App, schickt Haze den aktuellen Wert, Trend (Sensorwert, sonst aus den letzten 15 Min. nach Dexcom-Schwellen 1/2/3 mg/dL pro Minute), Änderung zum vorherigen Messwert und die letzten 24 h als Verlauf an `http://127.0.0.1:47800` (nur Loopback, kein Proxy; Aktivität `haze:bg`). Die Notch zeigt zugeklappt Wert, Pfeil und Änderung, aufgeklappt den Graphen mit Zielbereich 70–180 und den Zeitbereichen 3/6/12/24 Std. Beim Wechsel in einen anderen Bereich (hoch/niedrig) setzt Haze einmal `alert`; die Alarmlogik bleibt in Haze, die Notch zeigt nur an. Die Aktivität hat 900 s TTL und wird jede Minute erneuert; beim Beenden entfernt Haze sie. Nach einem Absturz graut die Notch den Wert nach 12 Min. aus und zeigt nach Ablauf der TTL „keine Daten“. **Doppelklick auf den Graphen in der Notch** holt das Dashboard nach vorn, auch aus dem Tray oder minimiert. **Doppelklick auf den Wert** (die große Zahl in der aufgeklappten Notch) blendet das Widget ein oder aus – wie im Tray-Menü. Haze fragt dafür alle 200 ms `GET /events` ab (Ereignisse `open` und `widget`). Abschaltbar unter **Einstellungen › Widget › Wert an Notch senden**. Läuft die Notch nicht, passiert nichts.

„Anzeige an der Taskleiste“ ist eine separate schmale Anzeige unmittelbar außerhalb der Taskleiste. Windows 11 stellt dafür keine zuverlässige frei gestaltbare native Textfläche bereit; Haze verändert daher weder Explorer noch die Shell.

## Bedienung

- Oben: Hell, Dunkel oder Windows-Systemdarstellung, Profil und Einstellungen.
- Verlauf: 3, 6, 12 oder 24 Stunden. Jeder Punkt entspricht einer tatsächlichen Messung; es gibt keine Verbindungslinien oder interpolierten Werte. Punkt anklicken oder mit Tab fokussieren, dann Pfeil links/rechts verwenden.
- Widget: über den Button öffnen. An Kanten und Ecken frei skalieren. Alle Einstellungen liegen in der Haupt-App oder im Infobereich.
- In den Einstellungen: Einrasten, Positionssperre, Durchklicken. Größe und Position werden automatisch gespeichert.
- **Strg + Umschalt + G** schaltet Durchklicken um. Beim Zurückschalten wird die Positionssperre ebenfalls gelöst. Die Kombination ist konfigurierbar; belegte Kombinationen werden gemeldet.
- Der Infobereich neben der Uhr bietet Dashboard, Overlay, Profilwahl, Durchklicken, Entsperren, Rücksetzen und vollständiges Beenden. Das Dashboard-X blendet nur das Dashboard aus.
- Änderungen an einem Profil mit **Im Profil speichern** ausdrücklich sichern. Arbeit und Gaming sind manuell auswählbar; keine automatische Spielerkennung.
- Bei verschwundenem oder gesperrtem Overlay: im Infobereich **Overlay-Position und Größe zurücksetzen**. Das entfernt auch Durchklicken und Sperre.

Für Rocket League und andere Spiele **Fenstermodus oder randloses Vollbild** verwenden. Über exklusivem Vollbild wird keine universelle Sichtbarkeit versprochen. Es gibt keine Eingriffe in Spielprozesse. Messwertupdates fordern keinen Tastaturfokus an.

## Webansicht

In der installierten App: **Einstellungen → App → Lokale Webansicht öffnen**. Adresse: `http://127.0.0.1:17834/`. Die App muss dabei laufen. Der Browser erhält dieselben Daten aus dem einen zentralen Abruf wie Dashboard und Overlay. Browser schließen beendet den Abruf nicht.

Die Webansicht ist ausschließlich an Loopback gebunden. API-Endpunkte verlangen ein HttpOnly/SameSite-Sitzungscookie, Zustandsänderungen zusätzlich einen passenden Origin-Header. Es werden keine Tokens an die Oberfläche ausgegeben. Diese Version ist **kein öffentlich gehosteter Webdienst**. Für externes Hosting fehlen Benutzeranmeldung, TLS-Betrieb und eine separate geschützte Serverbereitstellung.

## Daten und Zugangsdaten

- Interne Werte bleiben ungerundete mg/dL. mmol/L = mg/dL ÷ 18. Farbe wird vor Rundung bestimmt: ≤70 niedrig, ≥180 hoch, dazwischen normal.
- Abruf alle 60 Sekunden. Altersanzeige alle 15 Sekunden. Nach Standby und bei einem Online-Ereignis wird zusätzlich aktualisiert.
- Standardmäßig sind Werte nach **mehr als 10 Minuten** veraltet. Die Frist ist einstellbar. Veraltete Trends werden ausgeblendet.
- Sensorcodes, ungültige Messungen und zukünftige Zeitstempel werden ausgeschlossen. Zukunftszeitstempel lösen einen Datenhinweis aus. Keine automatische Rückkehr zu Demo bei Live-Fehlern.
- Änderungen verwenden den tatsächlichen Abstand zum vorherigen Wert; bei mehr als 20 Minuten Abstand ist die Änderungsanzeige nicht verfügbar.
- Die Statistik „Im Bereich“ ist der Anteil vorhandener Messpunkte, keine zeitgewichtete klinische Auswertung bei Datenlücken.
- Windows speichert den Lesetoken verschlüsselt über Electron `safeStorage` (DPAPI). Einstellungen liegen im Electron-Benutzerdatenordner `nebel-glucose` unter `%APPDATA%`. Diese Dateien nicht zusammen mit dem Quellcode weitergeben.
- Die App sendet ausschließlich GET-Anfragen an Nightscout. Nightscout-Lesetokens werden für dessen API intern als Tokenparameter übertragen, nicht in öffentliche Links oder App-Protokolle geschrieben. HTTPS ist bei entfernten Servern erforderlich.

## Updates

Die installierte Version wird angezeigt. Mangels fester vertrauenswürdiger Veröffentlichungsquelle meldet die Updateansicht ausdrücklich, dass keine Onlineprüfung möglich ist. Automatischer Download, Signaturprüfung und In-App-Installation einer neuen veröffentlichten Version sind daher **noch nicht eingerichtet**. Keine vorgetäuschte Erfolgsmeldung, kein erzwungener Neustart.

**Updates:** Ab 1.3.1 sieht Haze beim Start und alle 6 Stunden in den [Releases](https://github.com/NojoMcDybo/Haze/releases) nach. Gibt es eine neue Version, erscheint im Dashboard ein Hinweis mit **Installieren** (auch unter Einstellungen › App). Geladen wird nur nach Klick; die Datei wird gegen die SHA-512-Summe aus `latest.yml` geprüft, dann schließt Haze kurz, installiert still und startet neu. Einstellungen und verschlüsselte Zugangsdaten bleiben erhalten. Die Installer sind nicht code-signiert: Updates sind so vertrauenswürdig wie das GitHub-Konto, das sie veröffentlicht.

Version 1.3.0 und älter einmal von Hand aktualisieren: Haze im Infobereich beenden und den neuen Installer ausführen.

Neue Version veröffentlichen: `version` in `package.json` anheben, per PR nach `main`, dann Tag `v<version>` auf `main` pushen. Der Release-Workflow baut den Installer und lädt ihn mit `latest.yml` hoch.

## Quellcode und Build

Voraussetzung: Node.js 22 oder neuer auf Windows. Für `npm run package` muss zuvor das native Glasmodul mit dem unten genannten PowerShell-Skript gebaut werden. Ohne dieses Modul verwendet die App die transparente Ersatzdarstellung.

```powershell
npm ci
npm test
npm run build
# Optional für natives Glas: Visual Studio C++ Build Tools und Windows SDK benötigt
powershell -ExecutionPolicy Bypass -File desktop/native-glass/build.ps1
npm start
npm run package
```

`shared/model.mjs` enthält Normalisierung, Altersprüfung, Einheiten und Grenzwerte; `shared/provider.mjs` den ausschließlich lesenden Nightscout-Anbieter. Alle Ansichten verwenden `src/main.tsx` und dieselben Komponenten. `desktop/main.cjs` verantwortet Abruf, verschlüsselte Speicherung, Fenster, Profile, Tray und lokale Webansicht.

Der gelieferte Installer wurde wegen der Prozessbeschränkungen der Arbeitsumgebung direkt mit dem beigefügten NSIS-Skript gebaut. Das alternative Standard-Build über electron-builder ist konfiguriert, wurde hier jedoch nicht vollständig ausgeführt. Der konkrete Paketablauf steht in `docs/BUILD.md`.

Eine reine Designvorschau lässt sich nach dem Build mit `node desktop/preview-server.cjs` starten: `http://127.0.0.1:17836/?preview=1`. Diese Vorschau ist ausdrücklich Demo und ersetzt keine Desktop-Funktionsprüfung.

## Prüfstand

Siehe `docs/PRUEFBERICHT.md`. Kernlogik und Browseransicht wurden geprüft. Autostart nach tatsächlicher Anmeldung, echte Monitorwechsel, Gaming, Tray und Durchklicken brauchen noch die Abnahme auf dem normalen Windows-Desktop. Eigene Alarme, Prognosen und Therapieempfehlungen sind nicht Bestandteil dieser Anwendung.

Details zur Integration, lokaler Hintergrundverarbeitung und Grenzen: [Farbloses Glas](docs/COLORLESS-GLASS.md).

## Vordergrund und Spiele

Das Widget ist nicht fokussierbar und wird ohne Aktivierung regelmäßig nach vorne gesetzt. Für Spiele den randlosen Fenstermodus verwenden; exklusives Vollbild wird nicht zuverlässig unterstützt.

## Garmin Forerunner 265 – direkter Live-Puls (1.2.2)

1. Bluetooth am Windows-PC aktivieren.
2. Uhr: UP halten → Gesundheit und Wellness → Herzfrequenz am Handgelenk → Herzfrequenz senden → START.
3. Unter **Einstellungen → Garmin** auf **Uhr verbinden** klicken und die eigene Uhr auswählen.
4. Nach dem ersten gültigen Paket erscheinen Puls und Empfangsalter im Dashboard sowie ein Herzsymbol mit Puls im Widget.

Die Uhr muss weiter senden und in Reichweite bleiben. Nach einem App-Neustart erneut verbinden. Das Dashboard darf über X ausgeblendet werden; Haze muss im Infobereich weiterlaufen. Nach 15 Sekunden ohne neue Messung wird kein Live-Puls mehr angezeigt. Optional vom Sensor gesendete RR-Intervalle und Energie werden separat angezeigt; sie werden nicht erfunden oder als Garmin-HRV/Body-Battery interpretiert. Es werden keine Garmin-Kontodaten benötigt und keine Pulswerte auf die Festplatte geschrieben.

Stress, Body Battery, Schlaf und Schritte sind über den Standard-Bluetooth-Herzfrequenzdienst nicht verfügbar. Garmin-Connect-Import ist noch nicht implementiert. Die lokale Browseransicht zeigt empfangene Werte, die Bluetooth-Verbindung wird ausschließlich im Desktop-Dashboard hergestellt.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Der Hinweis „kein Medizinprodukt“ oben gilt unabhängig davon.
