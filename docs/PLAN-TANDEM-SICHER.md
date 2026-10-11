# Plan: Tandem sicher anbinden und mehr Daten sammeln

Stand: 11. Oktober 2026 · Status: PR A gemergt (#19, Release v1.6.0); **PR B umgesetzt** (Branch `claude/garmin-mehr`); C offen

Ziel: Pumpendaten aus Tandem Source wieder nutzen, **ohne** Passwort im Klartext, **ohne** Schreibrechte auf Nightscout und ohne weitere Sicherheitslücken. Außerdem möglichst viele zusätzliche Daten für die Auswertung erfassen.

## 1. Was die bisherige Lösung unsicher machte (geprüft im Code von tconnectsync 3.0.3)

| Problem | Beleg |
|---|---|
| Tandem-Passwort im Klartext in einer `.env` | `secret.py` liest `.env` aus dem Arbeitsordner |
| Nightscout-`API_SECRET` mit vollen Rechten nötig | alle Schreibzugriffe in `nightscout.py` |
| Das `API_SECRET` steht zusätzlich **im Klartext in der URL** (`?api_secret=…`) und landet damit in Logs | `upload_entry`, `put_entry`, `delete_entry`, `current_profile` |
| Zugangstoken von Tandem werden als Datei zwischengespeichert (`~/.config/tconnectsync/.creds_cache`, pickle) | `CACHE_CREDENTIALS` ist standardmäßig an |
| Installation ohne feste Version/Prüfsumme | `pip install tconnectsync` |

Nicht betroffen: Mit dem Tandem-Konto lässt sich die Pumpe **nicht steuern**. Ein Bolus vom Handy geht nur über direktes Bluetooth vom einen gekoppelten Handy; die Cloud bekommt nur Uploads. Das verbleibende Risiko ist der Datenschutz der Pumpendaten.

## 2. Sicheres Design

```
Haze (Einstellungen › Daten)
  │ Tandem-E-Mail + Passwort → nur DPAPI-verschlüsselt in settings.json (wie der Nightscout-Lesetoken)
  ▼
Haze startet tconnectsync (feste Version, Prüfsummen, eigener venv im Haze-Datenordner)
  │ Zugangsdaten nur als Umgebungsvariablen des Kindprozesses · Arbeitsordner leer (keine .env)
  │ CACHE_CREDENTIALS=false · NS_URL=http://127.0.0.1:<zufälliger Port>/ · NS_SECRET=<Einmal-Geheimnis>
  ▼
Haze-Empfänger (nur 127.0.0.1, nur während des Laufs, nur bekannte Pfade, prüft das Einmal-Geheimnis)
  │ nimmt Behandlungen, CGM-Werte, Aktivitäten (IOB), Gerätestatus, Profile an
  ▼
haze.db (Quelle „pump“)  ·  Nightscout bleibt unberührt
```

Damit gilt:
1. **Kein Klartext-Passwort auf der Platte.** Eingabe in Haze, Speicherung mit Windows-DPAPI (`safeStorage`), Weitergabe nur im Arbeitsspeicher an den Kindprozess. `tconnectsync` liest Umgebungsvariablen vor einer `.env` (`secret.get` → `os.environ` zuerst).
2. **Keine Schreibrechte auf Nightscout.** tconnectsync spricht mit einem kleinen Nightscout-kompatiblen Empfänger in Haze statt mit Nightscout. Das „Secret“ dafür wird pro Lauf zufällig erzeugt und ist danach wertlos; dass es in der URL steht, schadet damit nicht.
3. **Kein Token-Cache.** `CACHE_CREDENTIALS=false`; tconnectsync meldet sich bei jedem Lauf neu an (stündlich, unkritisch).
4. **Geprüfte Installation.** Haze legt den venv selbst an (`%APPDATA%\nebel-glucose\tconnectsync`) und installiert eine feste Version mit `--require-hashes` aus einer Sperrdatei im Repo. Kein Shell-Aufruf, feste Argumente, Zeitlimit.
5. **Saubere Protokolle.** Haze ersetzt in jeder Ausgabe die tatsächlichen Werte von E-Mail, Passwort und Einmal-Geheimnis durch `***` (nicht nur per Muster).
6. **Nightscout bleibt sauber.** Keine doppelten Punkte mehr; die Pumpen-CGM-Werte gehen direkt nach `haze.db` und füllen dort Lücken (Share hat Vorrang).

Vom Empfänger benötigte Endpunkte (aus `nightscout.py`): `GET api/v1/status.json`; `POST api/v1/{treatments,entries,activity,devicestatus,profile}`; `GET api/v1/treatments?count=1&find[enteredBy]=…&find[eventType]=…` (letzter Upload); `GET api/v1/entries.json?count=1&find[device]=…`; `GET api/v1/activity?find…`; `GET api/v1/devicestatus?find…`; `GET api/v1/profile/current`; `PUT/DELETE api/v1/profile…`. Alles andere: 404.

## 3. Mehr Daten

| Quelle | Neu erfasst | Nutzen in der Auswertung |
|---|---|---|
| Tandem | Bolus mit KH und BZ, Basal, Unterbrechungen, Katheter-/Kartuschenwechsel, **Schlaf- und Sportmodus**, Profile (Basalraten, Faktoren), **CGM-Alarme**, **IOB**, Gerätestatus, **CGM-Werte der Pumpe** (Lücken automatisch) | Störfaktoren bei Sport/Nacht, IOB beim Trainingsstart, Alarme in der Nacht vs. Schlaf, Tage mit Katheterwechsel |
| Garmin (zusätzlich) | Atmung, SpO2, Trainingsbereitschaft, Trainingsstatus, HRV-Einzelwerte der Nacht, Puls/Stress/Body Battery während des Schlafs, **Puls-Zeitreihe je Training** | Erholung vs. Glukose, Verlauf innerhalb eines Trainings |
| Dexcom | Clarity-Ereignisse und Alarme (schon im Import), optional Dexcom API v3 | Alarme, Sensorsitzungen |
| Nightscout | Profil (schon als Rohdaten) | Zielbereiche |

Neue Auswertungen (weiter nur beschreibend, keine Therapiehinweise):
- Training: IOB und Sportmodus beim Start, Abfall getrennt nach „mit/ohne Sportmodus“
- Nächte: CGM-Alarme und Schlafmodus gegen Schlafwert und Wachphasen
- Tage: Katheterwechsel-Tag gegen Folgetage (Glukosemittel, Zeit im Bereich)
- Erholung: Trainingsbereitschaft/HRV gegen Zeit im Bereich am selben Tag

## 4. Arbeitspakete

| PR | Inhalt | Tests |
|---|---|---|
| **A – Tandem sicher** | Zugangsdaten in Haze (DPAPI), venv-Installation mit Prüfsummen, Start mit Umgebungsvariablen, Empfänger `desktop/tandem-sink.cjs` + reine Logik `shared/sync/tandem-sink.mjs` (Abbildung auf `treatment`/`glucose`/`device_event`, Pfad-Whitelist, Geheimnisprüfung), Protokoll-Maskierung, Abschnitt in Einstellungen › Daten | Empfänger mit simulierten tconnectsync-Anfragen (alle Endpunkte, falsches Geheimnis, fremder Pfad, Nicht-Loopback), Maskierung, Planung; echter Lauf mit Nojos Konto |
| **B – Mehr Garmin** | zusätzliche Endpunkte + Normalisierung (Rohdaten liegen teils schon vor), Training-Details | gegen die echten Rohantworten aus dem Spike |
| **C – Auswertung mit Pumpendaten** | IOB/Modi/Alarme/Katheterwechsel in Kontext und Hinweisen | künstliche Daten mit eingebauten Effekten |

Reihenfolge: PR #16–#18 sind gemergt. A ist umgesetzt, danach B und C jeweils als eigener PR auf `main`.

### Umsetzung A (11. Oktober)
- `shared/sync/tandem-sink.mjs`: Empfänger (Pfad-Whitelist, Einmal-Geheimnis zeitkonstant, nur Loopback und passender Host, 10 MB, nur JSON), Abbildung auf `treatment`/`device_event`/`glucose`/`series`, „letzter Upload“ und Löschen wie Nightscout, Protokoll-Maskierung (auch URL-kodiert wie in Python).
- `shared/sync/tandem.mjs`: Laufplanung, minimale Kindumgebung (`CACHE_CREDENTIALS=false`, keine fremden Variablen wie `API_SECRET`).
- `desktop/tandem.cjs`: Installation in `%APPDATA%\nebel-glucose\tconnectsync` mit `desktop/tconnectsync-requirements.txt` (36 Pakete, 572 SHA-256-Prüfsummen, `--require-hashes --no-deps --only-binary=:all:`), Start ohne Shell aus leerem Arbeitsordner.
- `shared/store.mjs`: Schema v2 mit `ns_doc` (Rohdokumente für Abfragen).
- `desktop/main.cjs`: Zugang nur DPAPI-verschlüsselt (`tandemAuth`), Oberfläche sieht nur `hasTandemAuth` und eine gekürzte E-Mail; Tandem-Aktionen über die Webansicht gesperrt.
- Geprüft: Installation über Haze (25 s), echter tconnectsync-Lauf gegen den Empfänger (Nightscout-Teil ohne Fehler, Tandem-Anmeldung mit Test-Zugang erwartungsgemäß abgelehnt), Passwort/E-Mail nicht im Protokoll, Arbeitsordner leer.
- Features: `BASAL BOLUS PUMP_EVENTS PROFILES CGM CGM_ALERTS DEVICE_STATUS` (IOB verarbeitet tconnectsync für Tandem Source nicht).

## 5. Was Nojo tun muss

1. **Alte Klartextdatei löschen:** `C:\Users\nojod\Nightscout\tconnectsync\` (enthält `.env` mit dem Nightscout-`API_SECRET`; das Tandem-Passwort darin war ohnehin falsch).
2. ~~PR #16–#18 mergen~~ (erledigt).
3. Nach PR A: Tandem-Zugang **in Haze** eingeben (Einstellungen › Daten), nicht mehr in eine Datei.
4. Clarity-Export für die Lücke 2.–6. Oktober.

### Umsetzung B (11. Oktober)
- Neue Abrufe je Tag: Atmung, SpO2, Trainingsbereitschaft, Trainingsstatus. Aus der bereits gespeicherten Schlafantwort zusätzlich: SpO2 (Mittel, Tiefstwert), Atmung, Schlafstress, unruhige Momente, Body-Battery-Erholung, Wachphasen, sowie Epochen (HRV 5 min, Atmung und SpO2 je Minute, SpO2 nur mit Vertrauen ≥ 2).
- Trainingsdetails: Puls, Tempo, Leistung, Höhe je Training (höchstens 10 neue pro Lauf). **GPS wird nicht gespeichert** (`stripLocation` vor `putRaw`).
- `planFetch`: pro Tag nur fehlende oder vorläufige Datenarten; neue Datenarten werden für alte Tage einzeln nachgeholt.
- `reprocess`: einmalige Neuauswertung aus Rohdaten nach Updates (`meta.garmin-normalizer`).
- Schema v3: neue Spalten in `sleep` und `daily`.
- Geprüft gegen echte Garmin-Antworten (Spike-Rohdaten vom 7./11. Oktober). Ende-zu-Ende-Lauf offen: Die kopierte Testsitzung ist abgelaufen (Garmin erneuert die Anmeldung beim Abruf; in Haze bleibt die Sitzung im selben Profil und wird mit erneuert).
