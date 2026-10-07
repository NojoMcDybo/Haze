# Prüfbericht – Haze 1.1.0 – 20. September 2026

## Umgebung

Windows 11, Build 26200, x64. Node.js 24.19.0 für Tests, Electron 44.4.3. Entwicklung unter eingeschränktem Codex-Sandbox-Desktop. Browseransicht im Codex-Browser geprüft.

## Bestanden

- TypeScript-Prüfung ohne Fehler und produktiver Frontend-Build.
- Sechs automatisierte Testgruppen (`tests/model.test.mjs`): Grenzwerte 69/70/71/179/180/181; identische Einstufung trotz Einheitenwechsel; Rundung 70→3,9 und 180→10,0; fehlende Werte als Gedankenstrich; Sortierung und Deduplizierung; Sensorfehler; Zukunftszeitstempel; Alter ausschließlich aus Messzeit; strikt mehr als zehn Minuten; Delta mit tatsächlichem Abstand; große Datenlücke ohne erfundene Änderungsrate; sichtbare Fensterkoordinaten nach simuliertem Monitorverlust; Authentifizierungsfehler, Netzwerkfehler und leere Serverantwort getrennt.
- Nightscout-Liveabruf gegen die vorhandene Instanz: 304 gültige Messungen, neuester Messwert bei Prüfung ungefähr fünf Minuten alt, keine verworfenen oder zukünftigen Zeitstempel. Messwerte werden nicht im Bericht gespeichert.
- Browser: Dark und Light visuell kontrolliert; Themewechsel; mmol/L-Umrechnung auch an Diagrammgrenzen; Messpunktauswahl mit Maus und Pfeiltaste; Fokus wechselte dabei auf den vorherigen Messpunkt.
- Browser: Minimal-Overlay bei 230×190 CSS-Pixeln visuell geprüft. Haupttext, Sekundärtext und Statusfarben erreichen auf ihren Kartenhintergründen rechnerisch mindestens 5,49:1 Kontrast; dies ersetzt keinen vollständigen Audit aller Zustände.
- Browser: schmale Dashboard-Ansicht bei 390×844 CSS-Pixeln ohne horizontales Überlaufen.
- Browser: Overlay-Verlaufsansicht bei 260×260 CSS-Pixeln zeigt Wert, Trend, Einheit, Messwertalter und Punktkurve. Die ausgelieferte Mindestgröße ist für zusätzliche Fehlerhinweise großzügiger (Verlauf 260×300, Minimal 230×190).
- NSIS-Installer erfolgreich erzeugt. Bezogene NSIS-Binärdatei anhand des in electron-builder hinterlegten SHA-256 geprüft.
- Haze-Testbuild auf dem normalen Windows-Desktop geöffnet: Das reduzierte Widget zeigt Wert, Trend, Einheit und Messwertalter ohne Werkzeugleiste. Die Browser-Konturprüfung zeigt die echte Bézierform in Dark/Light und Klar/Liquid-Glass-Ersatzdarstellung an allen vier Kanten. Die neue Logik verwendet `BrowserWindow.setShape`; transparente Randbereiche bleiben dadurch für Anwendungen darunter durchlässig.
- Normaler Start über die Verknüpfung öffnet das Dashboard; „nur Widget“ wird nur beim `--autostart`-Start berücksichtigt. Ein laufendes Profil mit Sperre/Durchklicken kann über den Infobereich oder das Profil „Arbeit“ wieder bearbeitbar gemacht werden.
- Acht neue Widget-Testgruppen: idempotente Migration der alten `nebel-glucose`-Ablage, hit-test-freie transparente Ecken, vier Kanten/Monitorübergänge/Taskleistenabstand, Layout-Hysterese, direkte Größenanpassung, reduzierte Bewegung und unterbrochene Animationen.

## Implementiert, in dieser Umgebung nicht vollständig abnehmbar

Der Electron-Hauptprozess konnte gestartet werden und stellte die zentrale Webansicht bereit. Electron-Renderer/Tray scheiterten im isolierten Windows-Desktop an `mojo platform_channel: Zugriff verweigert` bzw. den Windows-Sandbox-Zugriffsrechten. Die Schutzmaßnahmen wurden nicht deaktiviert.

Daher nicht als bestanden ausgeben:

- Sichtbares natives Dashboard/Overlay und echtes stufenloses Ziehen an Windows-Fensterrändern.
- Durchklicken, globale Tastenkombination, Tray-Zugriff und Rücksetzen bei tatsächlicher Sperre.
- Fokusbeibehaltung bei Rocket League bzw. einem anderen Spiel, Fenster und randloses Vollbild.
- Gleichzeitiger Themewechsel über mehrere native Fenster.
- Autostart nach echter Windows-Anmeldung; Installation und Deinstallation im normalen Benutzerkonto.
- Reale Monitorwechsel, unterschiedliche DPI-Skalierungen, Standby und Langzeitbetrieb.
- Netzwerkunterbrechung während des laufenden nativen Overlays: Datenlogik geprüft, vollständiges Szenario offen.
- Upgrade einer installierten älteren Version und Erhalt ihrer Einstellungen.
- Vollständiger Screenreader-/Kontrastaudit aller Fehlerzustände. Sichtbare Fokusmarkierungen und textliche Statusmeldungen sind implementiert; grundlegende Tastaturbedienung wurde geprüft.
- Die konkrete Abnahme des neuen nativen Randziehens, der vier Windows-Kanten, der Taskleistenposition und von Rocket League bleibt auf dem Zielrechner erforderlich; der separate Haze-Testbuild konnte nur geöffnet und visuell geprüft werden, nicht in einer echten Spielsitzung.

## Leistung

Eine Stichprobe des Electron-Hauptprozesses ohne funktionierende Renderer ergab ungefähr **102 MiB Arbeitsspeicher** und etwa **eine CPU-Sekunde kumuliert** nach rund 25 Minuten. Das ist **keine valide Messung der vollständigen App** und erlaubt keine Aussage über Gaming oder GPU-Verbrauch.

Verwertbare CPU-, GPU- und Speicherwerte für die komplette App im Leerlauf und während eines Spiels stehen aus. Keine Effizienzwerte erfunden. `desktop/Leistung-messen.ps1` zeichnet nach der Installation CPU und Arbeitsspeicher der Haze-Prozesse über 60 Sekunden auf; GPU und Spielfokus sind zusätzlich über Windows zu prüfen.

## Updates und Veröffentlichung

Keine Veröffentlichungsquelle und kein Codesignatur-Zertifikat vorhanden. Online-Updateprüfung meldet diesen Zustand ausdrücklich. Installer nicht signiert. Keine automatische Veröffentlichung und kein Upload von Gesundheitsdaten.

## Abnahme auf dem Benutzerdesktop

1. Installer starten; Demo ansehen, beide Themes wechseln.
2. Nightscout testen und den Zeitstempel mit der Dexcom-App vergleichen.
3. Overlay in beiden Ansichten ziehen und skalieren, Dashboard schließen; neuen Messwert abwarten.
4. Gaming-Profil wählen, Durchklicken mit Strg+Umschalt+G aus- und einschalten. Im Tray zurücksetzen.
5. Rocket League randlos starten, Alt-Tab prüfen und einen neuen Datenabruf abwarten; Fokus darf nicht wechseln.
6. Startoptionen aktivieren und tatsächliche Windows-Anmeldung prüfen. Nightscout separat starten.
7. Bei Monitorwechsel und Standby die Rückkehr sowie das Messwertalter prüfen.


## Lokales Update 21.09.2026: Autostart und Änderungszahl
- Nightscout-Autostart für das aktuelle Windows-Konto eingerichtet; Haze-Autostart aktiviert.
- Starthelfer gegen laufenden Server geprüft: kein Neustart, erfolgreiche Aktualisierung in Haze. Ein echter Windows-Neustart wurde nicht durchgeführt.
- TypeScript und alle 15 Testgruppen erfolgreich, einschließlich Vorzeichen, Null, mmol/L, veralteter Werte und Messlücken.
- Aktualisiertes app.asar in der installierten App per Hash geprüft. Live-Verbindung ohne Fehler.
- Desktop-Overlay direkt visuell geprüft: kleine Änderungszahl neben der Einheit sichtbar.

## Glasstil und Klammeranzeige
- Änderung direkt hinter dem Wert, kleiner und in Klammern; Mindestbreite berücksichtigt die zusätzliche Zahl.
- Transparente Glasfläche mit gerichteten Reflexen und Glaskante entlang der bestehenden Kontur. Keine native Desktop-Unschärfe oder Lichtbrechung.
- TypeScript, acht Geometrie-Testgruppen und Änderungsberechnung bestanden.
- Installiertes Desktop-Overlay visuell geprüft: 100 (+3), keine abgeschnittene Zahl, Glasstil aktiv, Live-Verbindung ohne Fehler.

Transparenzregler: 0 bis 95 Prozent. Im laufenden UI 0, 95 und 82 Prozent geprüft; 82 Prozent in den gespeicherten Einstellungen bestätigt. Schrift bleibt deckend, Reflexe skalieren mit der Hintergrunddeckkraft. TypeScript und Build erfolgreich.

Transparenzfehler behoben: html/:root hatte weiterhin einen deckenden Hintergrund. Overlay-Dokument, body und root sind jetzt explizit transparent; Farbschema verhindert einen impliziten dunklen Canvas. Installierte App aktualisiert. Native Sichtprüfung zeigt die darunterliegende Spieloberfläche durch das Widget. TypeScript und Build bestanden. Das vorhandene Setup-Paket enthält diesen nachträglichen Fix noch nicht; die installierte App und der Quellcode sind aktualisiert.

Haze 1.2 colorless glass: native addon built (166400 bytes), export smoke test passed, TypeScript and 15 JS/geometry/lifecycle tests passed. Installer built. Full interactive GPU validation was attempted but the desktop launch was blocked by the current approval/usage limit; installer is not installed over the user's running 1.1 version yet.


## Update 1.3.0 – 1. Oktober 2026: Widget-Lab-Integration

Umgebung: Windows 11 x64, Node.js 24.15, Electron 44.4.3, VS Build Tools 18, normaler interaktiver Desktop (kein Sandbox-Desktop). Zwei Monitore (1920×1080 primär, 2560×1440 skaliert).

Bestanden:

- `npm test`: 22 Tests, davon neu: fluide Kontur an allen vier Kanten (bündig, konkave Schultern, transparente Ecken in der Region), Hals verjüngt sich mit dem Abstand, Ziehen/Abreißen/Wiederanhaften an allen vier Kanten inkl. 250-ms-Sperre nach dem Abreißen, Einschwingen auf die Kante, reduzierte Bewegung ohne Timer, Abrissdistanz aus Haftstrecke × Flüssigkeit, keine Andockkante zwischen Monitoren, Notch-Payload (Farben, Trend, Änderung, veraltet, mmol/L), Deduplizierung, einmaliger Alert, TTL-Erneuerung, Abmelden, nicht erreichbare Notch.
- TypeScript-Prüfung und Produktions-Build.
- Natives Glas: Addon gebaut; `create` 0, `configure` 0, Bildzähler steigt, Shader-Selbsttest `test()` = 63 (alle sechs Prüfungen). Vorher `create` = `E_INVALIDARG` (siehe COLORLESS-GLASS.md, Korrektur 1.3).
- Laufende App (Demo, isolierter Datenordner): Glasstatus „Farbloses Glas aktiv“, angedockte Kontur oben mit Schultern, „Vom Rand lösen“ mit Dehnen und Einschwingen, Glas bleibt danach aktiv.
- Notch live: Aktivität `haze-bz` erscheint mit „→ −5 · vor 2 Min.“; nach „Beenden“ entfernt.

Offen: echtes Ziehen mit der Maus an allen Kanten auf dem Zielrechner abnehmen (Gefühl von Flüssigkeit und Haftstrecke), Glas während Rocket League, Mixed-DPI beim Ziehen zwischen Monitoren. Das Widget fehlt mit aktivem Glas absichtlich in Screenshots.


## Branch claude/notch-verlauf - 2. Oktober 2026: Verlauf und Doppelklick in der Notch

Basis: `widget-lab-integration` (PR #1). Nur lokal, nicht gepusht.

Bestanden:

- `npm test`: 38 Tests, davon in `tests/notch.test.mjs` neu oder angepasst: Aktivität `haze:bg` mit Zahlenwert, Trend und Änderung als Zahl, Verlauf `chart` (70/180, 3.9/10 bei mmol/L, Punkte in der Einheit), nur die letzten 24 h (289 Punkte bei 5-Min-Takt), Trend aus Sensor oder nach Dexcom-Schwellen, veraltet ohne Trend und Änderung, einmaliges Abräumen der alten id `haze-bz`, Ereignis „open“ ruft das Dashboard (Altlast beim Start und Neustart der Notch lösen nichts aus).
- TypeScript-Prüfung.

Offen (nur auf dem echten Desktop prüfbar): Doppelklick in der Notch holt das Dashboard nach vorn — aus dem Tray, minimiert und hinter anderen Fenstern; Graph mit echten Nightscout-Werten.


## Branch claude/notch-puls - 2. Oktober 2026: Garmin-Puls in der Notch

Haze schickt den Live-Puls der gekoppelten Garmin als eigene Notch-Aktivität `haze:hr` (Wert, `pulse` für den Herzschlag im Takt, ttl 15 s, Priorität 1 vor Helio). Nur echte Live-Werte: verbunden, höchstens 10 s alt, Hautkontakt nicht als verloren gemeldet. Gesendet wird bei neuem Wert, sonst höchstens alle 5 s; ohne Messung oder bei `notch: false` wird der Eintrag entfernt, beim Beenden ebenfalls.

Bestanden:

- `npm test`: 44 Tests, neu in `tests/notch.test.mjs`: Aktivität aus dem Garmin-Zustand (live, veraltet, ohne Kontakt, Kontakt unbekannt, Klickziel), Senden bei neuem Wert und Wachhalten alle 5 s, Entfernen ohne Messung (nicht doppelt), nichts bei abgeschalteter Notch.

Offen (nur auf dem echten Desktop prüfbar): Puls einer echten Garmin erscheint in der Notch und schlägt im Takt; verschwindet nach Ablegen der Uhr bzw. Trennen.

## Garmin/Notch – Verbindungsreparatur (2026-10-02)

- Ein Verbindungsbesitzer im Dashboard; alte Listener werden beim Abbruch/Trennen entfernt. GATT-Aufbau endet nach 20 Sekunden mit einer erneuten Verbindungsmöglichkeit. Spät abgeschlossene alte Versuche dürfen keine Messwerte veröffentlichen.
- Bluetooth-Verfügbarkeit wird vor der Suche geprüft. Keine automatische zweite Kopplung durch Notch: Haze bleibt Pulsquelle, Notch erhält weiterhin nur `haze:hr` über localhost.
- Notch verwirft auch zukünftige/ungültige Puls-Zeitstempel. Keine Glättung oder Manipulation echter hoher Pulswerte.
- Optionaler Standard-Bluetooth-Akkustand, sofern von der Uhr angeboten, mit Kennzeichnung „beim Verbinden gelesen“. Er ist kein Body-Battery-Wert.
- Tests: Abbruch, Timeout, erneutes Verbinden ohne doppelte Listener, unveränderte Sequenz 72/75/68, nicht verfügbarer Adapter, bestehende Notch-Verträge.
- Offen: echter Vergleich Forerunner-Anzeige vs. Haze vs. Notch; physisches Wiederverbinden und Verfügbarkeit des Akkudienstes. Ein Softwaretest ersetzt diesen Gerätevergleich nicht.

Weitere Garmin-Statistiken: Der Herzfrequenzdienst enthält keine Schritte, Body Battery, Stress- oder Schlafdaten. Garmin Health API bietet synchronisierte Daten nach Freigabe (https://developer.garmin.com/gc-developer-program/health-api/). Connect IQ SensorHistory erlaubt geräteabhängige Verlaufsdaten auf der Uhr (https://developer.garmin.com/connect-iq/api-docs/Toybox/SensorHistory.html); dafür wäre eine eigene Uhren-App mit separatem Transport nötig. Es wurde keine ungeprüfte Cloud-Anmeldung oder zweite konkurrierende BLE-Verbindung ergänzt.

## Branch claude/plan-datenanalyse – 7. Oktober 2026: Datenbank, Nachholen, Analyse-Engine

Plan und Entscheidungen: `docs/PLAN-DATENANALYSE.md`.

### Bestanden

- `npm test`: 75 Tests grün, davon neu `tests/analysis.test.mjs` (12) und `tests/data.test.mjs` (8). Abgedeckt: Ortszeit über beide Zeitumstellungen; Quantile, Ränge mit Bindungen, Spearman, FDR, reproduzierbarer Zufall; Quellenpriorität (Share vor Clarity vor Pumpe); zeitgewichtete Konsens-Kennzahlen (TIR/TBR/TAR, GMI, CV, GRI, 14 Tage/70 %); Episoden mit 15-min-Beginn/-Erholung und Lückenabbruch; AGP; Kompressionstief erkannt, langsames Tief / Tief mit KH / Tagestief nicht; Aktivitätskontext; Nächte ohne Garmin (0–6 Uhr); Basal aus Raten; eingebaute Zusammenhänge in 90 Tagen künstlicher Daten gefunden, reines Rauschen ergibt keinen Hinweis; keine Hinweistexte zu Insulin/KH; Datenbank-Schema, Upsert, Laden, Sicherung, Aufbewahrung; Nightscout-Sync mit Cursor und nur GET; tconnectsync-Formate (aus dessen Quellcode `parser/nightscout.py`); Clarity-CSV englisch/deutsch inkl. mmol/L und Low/High; Garmin-Normalisierung (angenommene Formate); Tagesplan Garmin; Lücken pro Tag mit Aufgeben nach zwei Versuchen.
- `npx tsc --noEmit` und `npm run build` ohne Fehler.
- Electron-Laufzeit (`ELECTRON_RUN_AS_NODE`): `node:sqlite` (SQLite 3.53) ohne Flag, Clarity-Import von 5760 Werten, Analyse im Worker-Thread (90 Tage ≈ 0,25 s), Lückenerkennung, tägliche Sicherung.
- Echte App mit `--smoke` und isoliertem `NEBEL_DATA_DIR`: Hauptprozess startet mit Datenservice; über die lokale Webansicht `analysis` (30 Tage, Demo) und `sync-now` erfolgreich; Sicherung angelegt.
- Browser-Vorschau (`?preview=1`): Auswertung dunkel/hell, 14/90 Tage, schmale Ansicht 375 px ohne horizontales Überlaufen; Einstellungen › Daten rendert. Bereichsfarben mit dem dataviz-Validator geprüft (hell und dunkel bestanden; Kontrastwarnung ausgeglichen durch immer sichtbare Prozentwerte).

### Offen (braucht Zugangsdaten oder echten Desktop)

- tconnectsync gegen Tandem Source EU: `--check-login`, Lauf mit `--features CGM` für einen Zeitraum, deutsche Zeitzone.
- Nightscout-Sync gegen die echte lokale Instanz (lief bei der Prüfung nicht).
- Clarity-Export mit echter Datei (deutsche Spaltennamen sind aus Erfahrungswerten abgeleitet).
- Dateidialoge (Clarity-Import, Pfadwahl) und Garmin-Fenster nur auf dem echten Desktop prüfbar.

### Garmin Connect mit echtem Konto (7. Oktober 2026, abends)

- Anmeldung im Testfenster (Garmin-Seite, Nojo selbst). Die Web-App liegt inzwischen unter `/app/`; die Daten-API unter `https://connect.garmin.com/gc-api/` antwortet nur mit den Headern der Web-App (u. a. `Connect-Csrf-Token`), ohne sie 403. `/modern/` liefert nur HTML. Abruf aus dem Electron-Hauptprozess (`session.fetch`) wird mit 403 abgelehnt, im Seitenkontext klappt er.
- Alle 15 Probe-Endpunkte HTTP 200 (Tageswerte, Schlaf, Stress, Body Battery, Puls, Schritte, Intensitätsminuten, Atmung, SpO2, HRV, Trainingsbereitschaft, Trainingsstatus, Aktivitäten, Schlaf und Tageswerte vor 180 Tagen). Sieben Nächte hintereinander in 12 s ohne Drosselung.
- `shared/sync/garmin-connect.mjs` gegen die echten Antworten: keine fehlenden Felder; Schlafphasen-Kodierung (0 tief, 1 leicht, 2 REM, 3 wach) minutengenau gleich den Garmin-Summen; Body-Battery- und Stressspalten jetzt über die Deskriptor-Listen der Antwort.
- `desktop/garmin-connect.cjs` Ende-zu-Ende in Electron mit der gespeicherten Sitzung: 5 Tage in 36 s nach `haze.db` (5 Tage, 5 Nächte, 109 Schlafphasen, 3276 Pulswerte, 4451 Stress/Body-Battery/Schritt-Werte). Aktivitätenliste über ein Jahr: 21 Läufe, Format passt.
- Rohantworten und Testsitzung liegen außerhalb des Repos unter `D:\Dev\_spike-data\garmin`.
