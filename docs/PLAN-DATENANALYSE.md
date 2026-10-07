# Plan: Haze 2.0 – Datensammlung, Nachsynchronisierung und Analyse

Stand: 7. Oktober 2026 (abends) · Status: Phase 1–4 umgesetzt (ungemergt, Branch `claude/plan-datenanalyse`); Garmin mit echtem Konto geprüft; tconnectsync und echter Clarity-Export noch offen

## Umsetzungsstand

| Teil | Dateien | Stand |
|---|---|---|
| Analyse-Engine | `shared/analysis/` (time, stats, glucose, artifacts, context, insights, index, synthetic) | fertig, getestet |
| Datenbank `haze.db` | `shared/store.mjs` (node:sqlite, WAL, Rohdaten-Tabelle, Sicherung 7 Tage + 8 Wochen) | fertig, getestet, in Electron geprüft |
| Nightscout-Historie | `shared/sync/nightscout.mjs` (Fenster, Cursor, tconnectsync-Formate) | getestet mit Attrappe; echte Instanz offen |
| Lücken | `shared/sync/gaps.mjs` (pro Tag, max. 2 Versuche) | fertig, getestet |
| Tandem | `shared/sync/tandem.mjs`, `desktop/tandem.cjs` (Haze startet tconnectsync stündlich + für Lücken mit `CGM`) | gebaut; braucht tconnectsync + .env |
| Clarity-Import | `shared/sync/clarity.mjs` | getestet mit Beispieldateien; echte Datei offen |
| Garmin Connect | `shared/sync/garmin-connect.mjs`, `desktop/garmin-connect.cjs`, Spike `spikes/garmin-connect.cjs` | **mit echtem Konto geprüft** (7. Okt.): Web-API `connect.garmin.com/gc-api/` + Header der Web-App (Connect-Csrf-Token), Abruf nur im Seitenkontext (Hauptprozess: 403), Sitzung bleibt erhalten; 5 Tage in 36 s; 180 Tage zurück verfügbar; 7 Nächte am Stück ohne Bremse |
| Hintergrunddienst | `desktop/data.cjs`, `desktop/analysis-worker.mjs`, Anbindung in `desktop/main.cjs` | im Testmodus der echten App geprüft |
| Oberfläche | `src/Analysis.tsx` (Auswertung im Dashboard), `src/Data.tsx` (Einstellungen › Daten), `src/analysis.css` | Vorschau geprüft (hell/dunkel, 375 px) |

Bekannte Grenzen: Hinweistexte nennen Glukose immer in mg/dL; Nightscout zeigt in Tagen mit nachgeholten Pumpenwerten doppelte Punkte (Haze selbst nicht); Kompressionstief-Erkennung ist eine Heuristik.


Ziel: Glukose (Dexcom über Nightscout) mit Bewegung, Schlaf, Stress und Puls (Garmin Forerunner 265) zusammenführen, Lücken nach PC-Pausen automatisch nachholen und daraus belastbare Auswertungen machen.

> Haze bleibt **kein Medizinprodukt**. Die Analyse beschreibt Zusammenhänge in den eigenen Daten. Sie gibt keine Dosis- oder Therapieempfehlungen und behauptet keine Ursachen.

---

## 1. Ausgangslage (geprüft im Code und im lokalen Setup)

| Baustein | Heute | Folge |
|---|---|---|
| Nightscout | lokal unter `C:\Users\nojod\Nightscout` (Node + MongoDB auf 127.0.0.1), Daten über `nightscout-connect` aus **Dexcom Share** | läuft nur, solange der PC an ist |
| Dexcom Share | liefert höchstens die letzten **24 h** (288 Werte) | PC länger als 24 h aus = **Lücke für immer** |
| Haze-Abruf | `shared/provider.mjs` holt nur `entries/sgv.json?count=600` (≈ 2 Tage) | keine Historie, keine Behandlungen, kein Gerätestatus |
| Haze-Speicher | nur `settings.json` und `heart-rate.json` (Puls, 24 h, Minutenmittel) | keine Datenbank, keine Auswertung über Wochen |
| Garmin | nur Live-Puls per Bluetooth (Standard-Herzfrequenzdienst) | Schlaf, Stress, Body Battery, Schritte, Aktivitäten fehlen |
| Statistik | „Im Bereich“ = Anteil der Messpunkte, nicht zeitgewichtet | bei Lücken verzerrt |

---

## 2. Recherche: Was liefern die Quellen?

### Dexcom

| Weg | Inhalt | Historie | Verzögerung | Aufwand / Haken |
|---|---|---|---|---|
| **Share** (heute) | Glukosewert + Trend | 24 h | live | inoffiziell, sonst nichts |
| **Clarity-Export (CSV)** | Glukosewerte, Ereignisse (Kohlenhydrate, Insulin, Sport, Gesundheit), Alarme, Kalibrierungen, Geräteinfos | komplett | – | manuell unter clarity.dexcom.eu, dafür ohne Freigabe |
| **Dexcom API v3** (`api.dexcom.eu`) | `egvs`, `events`, `alerts`, `calibrations`, `devices`, `dataRange` | komplett | **3 h außerhalb der USA** | OAuth; „Limited Access“ (bis 5 Nutzer) muss bei Dexcom beantragt werden, Ablehnung möglich |

Was Dexcom über die Glukosewerte hinaus für die Analyse bringt:
- **Ereignisse** aus der Dexcom-App (Mahlzeiten, Insulin, Sport): wichtig, weil Bewegung und Glukose ohne Essen und Insulin kaum sauber zu deuten sind.
- **Alarmverlauf**: Nachtalarme zeigen, ob ein Tief den Schlaf gestört hat.
- **Geräte und Sensorsitzungen**: markieren Aufwärmphase, Sensorwechsel und den ersten Tag, an dem Werte oft ungenauer sind. So lassen sich unsichere Abschnitte ausklammern.
- `dataRange` zeigt sofort, für welchen Zeitraum Daten vorliegen. Das ist ideal für die Lückenerkennung.

### Garmin

| Weg | Inhalt | Historie | Haken |
|---|---|---|---|
| Bluetooth-Puls (heute) | Puls, ggf. RR-Intervalle | nur live | kein Schlaf, Stress usw. |
| **Garmin Connect (inoffiziell)** | alles: Schlafphasen und Schlafwert, Stress, Body Battery, HRV, Ruhepuls, Schritte, Intensitätsminuten, Aktivitäten, Trainingsbereitschaft | komplett | Garmin hat im **März 2026** die Anmeldung umgestellt und erkennt Nicht-Browser-Clients am TLS-Fingerabdruck. `garth` ist dadurch tot; `python-garminconnect` ab 0.3 läuft wieder, mit Mobil-Login und `curl_cffi`. Inoffiziell, kann jederzeit brechen |
| **Uhr per USB (MTP)** | FIT-Dateien in `GARMIN/Monitor`, `Sleep`, `HRVStatus`, `Metrics` | nur das, was noch auf der Uhr liegt (Tage bis wenige Wochen) | komplett lokal, offizielles JS-SDK `@garmin/fitsdk`; manche Felder (Schlafphasen, Body Battery) sind nicht offiziell dokumentiert |
| **DSGVO-Export** | Zip mit JSON (u. a. `sleepData.json` inkl. Phasen, SpO2, Atmung) und FIT-Aktivitäten | komplett | manuell, 24–48 h Wartezeit |
| Garmin Health API (offiziell) | alles | komplett | nur für Firmen, für ein Privatprojekt nicht realistisch |

**Empfehlung Garmin:** Garmin Connect als Hauptweg, aber **über Chromium in Electron** statt über einen eigenen HTTP-Client:
- Die Anmeldung läuft in einem Haze-Fenster direkt auf Garmins eigener Seite (inkl. MFA). Haze sieht das Passwort nie.
- Die Sitzung liegt in einer eigenen Electron-Partition (`persist:garmin`). Chromium verschlüsselt die Cookies unter Windows per DPAPI.
- Weil die Abfragen aus Chromium selbst kommen, haben sie einen echten Browser-Fingerabdruck. Das ist genau das, woran andere Bibliotheken seit März 2026 scheitern.
- Python muss nicht mitgeliefert werden.

Ob das mit Garmins aktuellen Web-Endpunkten sauber klappt, ist **noch nicht bewiesen** → Spike in Phase 0. Als Reserve dienen USB/FIT für die letzten Tage und der DSGVO-Export für die Erstbefüllung.

---

## 3. Lücken, die geschlossen werden müssen

1. **Glukose-Lücken nach mehr als 24 h PC-Pause.** Das ist die größte Lücke. → entschieden: über Tandem Source nachholen (Abschnitt 6). Ursprünglich geprüfte Optionen:
   - a) Nightscout dauerhaft laufen lassen (Raspberry Pi, kleiner Server). Das ist die einfachste echte Lösung, weil Share dann rund um die Uhr abgefragt wird.
   - b) Lücken per **Clarity-CSV-Import** in Haze nachtragen (ohne Freigabe, manuell).
   - c) **Dexcom API v3** automatisch für Lücken älter als 3 h (Antrag nötig).
   - d) Upload direkt vom Handy (xDrip+/Juggluco unter Android). Das hängt von Sensor und Handy ab.
2. **Keine Mahlzeiten- und Insulindaten.** Ohne sie wird jede Aussage wie „nach Sport fällt der Wert“ von Essen und Insulin überlagert. → gelöst über die t:slim X2 und Tandem Source (Abschnitt 6).
3. **Keine Datenbank, keine Historie in Haze.**
4. **Garmin-Daten jenseits des Live-Pulses fehlen.**
5. **Keine Sicherung** der Nightscout-MongoDB und künftig der Haze-Datenbank.
6. **Zeitzonen, Sommerzeit, Uhrabweichung:** alles intern in UTC-Millisekunden, Tageszuordnung in Ortszeit. Garmin ordnet den Schlaf dem Aufwachtag zu.
7. **Statistik nicht zeitgewichtet** (siehe oben).
8. **Messartefakte:** Kompressionstiefs (auf dem Sensor liegen) erscheinen nachts als falsche Tiefs und würden die Schlafanalyse verfälschen. Erkennen und kennzeichnen.
9. **Doku-Widerspruch:** Die README sagt, Pulswerte würden nicht auf die Festplatte geschrieben. `desktop/garmin.cjs` speichert aber 24 h Minutenmittel in `heart-rate.json`. Das wird mit der Datenbank ohnehin bereinigt.

---

## 4. Architektur

```
Dexcom Share ─► Nightscout (lokal/Server) ─┐
Tandem Source ─► tconnectsync ─► Nightscout ┤
Clarity-CSV / Dexcom API v3 (Lücken) ──────┤
Garmin Connect (Chromium-Sitzung) ─────────┼─► Sync-Engine ─► haze.db (SQLite) ─► Analyse-Engine ─► Dashboard / Analyse / Webansicht
Garmin USB-FIT / DSGVO-Export ─────────────┤        ▲                                │
Garmin Bluetooth-Puls (live) ──────────────┘        └── Cursor + Lückentabelle        └─► Notch / Widget (wie bisher)
```

### Speicher: `haze.db` im Ordner `nebel-glucose`
- **`node:sqlite`** (in Node eingebaut) statt `better-sqlite3`: kein natives Modul, kein Neubau für Electron. In Phase 0 prüfen, ob die Electron-44-Laufzeit es ohne Flag anbietet. Sonst `better-sqlite3`.
- WAL-Modus, tägliche Sicherung per `VACUUM INTO` (7 Tage + 8 Wochen behalten).
- Tabellen (Entwurf):
  - `glucose(ts PK, mgdl, trend, source, device)`: ungerundete mg/dL wie bisher.
  - `treatment(id PK, ts, type, carbs, insulin, duration, notes, source)`
  - `device_event(ts, type, detail)`: Sensorstart/-ende, Aufwärmphase, Alarme.
  - `hr(ts PK, bpm, source)`: Minutenwerte, aus Bluetooth und Garmin.
  - `series(ts, kind, value, source)` mit `kind` aus `stress`, `body_battery`, `steps`, `respiration`, `spo2`.
  - `sleep(night PK, start, end, score, deep, light, rem, awake, hrv_avg, rhr)` und `sleep_stage(start, end, stage)`
  - `activity(id PK, start, end, type, avg_hr, max_hr, kcal, training_effect, load)`
  - `daily(date PK, steps, intensity_min, rhr, stress_avg, bb_min, bb_max, hrv_status)`
  - `sync_state(source PK, cursor, last_ok, last_error)`
  - `gap(source, start, end, status)`: offen, nachgeholt, nicht verfügbar.

### Sync-Engine (`shared/sync/`, reine Logik, getestet; Ausführung in `desktop/`)
- **Wann:** beim App-Start, nach Standby/Online-Ereignis (gibt es schon), danach stündlich für Historie. Der 60-s-Live-Abruf bleibt unverändert.
- **Nightscout:** schrittweise ab Cursor mit `find[date][$gt]=<cursor>`, seitenweise (je 1000) für `entries`, `treatments`, `devicestatus`, `profile`. Upsert über Zeitstempel und Quelle, also doppelte Werte unschädlich.
- **Garmin:** pro Tag vom letzten vollständigen Tag minus **3 Tage Überlappung** (Garmin rechnet Schlaf und Body Battery nach) bis heute. Erstbefüllung rückwärts bis zu einem einstellbaren Startdatum (Standard 180 Tage). Gedrosselt (ein Tag nach dem anderen, Pause bei HTTP 429, Fortsetzung beim nächsten Lauf).
- **Lückenerkennung:** Glukose-Abstand über 15 min → Eintrag in `gap`. Je nach verfügbarer Quelle automatisch nachholen (Dexcom API) oder im Dashboard anbieten: „Lücke 3.–5. Okt. – Clarity-Export importieren“.
- Jede Quelle ist unabhängig. Fällt Garmin aus, laufen Glukose und Analyse weiter, und der Fehler steht in `sync_state`.

### Analyse-Engine (`shared/analysis/`, reine Funktionen, Tests mit künstlichen Daten)

**Stufe 1 – Standardkennzahlen (internationaler Konsens, Battelino 2019/2023):**
- Mittelwert, SD, **CV** (Ziel ≤ 36 %), **GMI** = 3,31 + 0,02392 × Mittelwert (mg/dL)
- **zeitgewichtet**: TIR 70–180, TBR < 70 / < 54, TAR > 180 / > 250
- **GRI** (Glycemia Risk Index) = 3,0·VLow + 2,4·Low + 1,6·VHigh + 0,8·High
- Datenabdeckung in Prozent; Hinweis, wenn unter 70 % oder weniger als 14 Tage
- **AGP**: 5/25/50/75/95-Perzentile über den Tag
- Episoden: Tief ≥ 15 min (< 70 bzw. < 54), Hoch ≥ 15 min (> 250), getrennt nach Tag und Nacht

**Stufe 2 – Kontextfenster (der eigentliche Mehrwert):**
- **Aktivitäten:** Glukose bei Start, Tiefpunkt und Änderung in 0–2 h, Tiefs in 2–24 h danach (verzögerte Tiefs nach Sport sind bekannt). Gruppiert nach Sportart, Dauer, Intensität und Trainingseffekt.
- **Nächte:** Schlafwert, Phasen, HRV, Ruhepuls gegen nächtliche TIR, CV und Tiefs. Morgenanstieg 3–8 Uhr (Dawn-Phänomen). Alarme in der Nacht gegen Wachphasen.
- **Tage:** Schritte, Intensitätsminuten, Stress und Body Battery gegen Tagesmittel, TIR und CV, auch **zeitversetzt** (heutiges Training → morgige Werte).
- **Intraday:** Puls/Stress und Glukoseänderung in 15-min-Fenstern.

**Stufe 3 – Hinweise mit Leitplanken:**
- Spearman-Korrelation und Gruppenvergleiche mit Bootstrap-Vertrauensintervall
- Mindestanzahl (z. B. ≥ 10 Aktivitäten derselben Art), sonst kein Hinweis
- Formulierung nur beschreibend: „An Tagen mit > 10.000 Schritten lag deine TIR im Mittel 8 Punkte höher (n = 23, 95 %-KI 3–13).“
- Störfaktoren benennen, wenn Mahlzeiten und Insulin fehlen. Kompressionstiefs und Sensor-Aufwärmphasen ausklammern.
- keine Empfehlungen zu Insulin, Kohlenhydraten oder Therapie

### Oberfläche
- Neuer Bereich **Analyse**: Zeitraum (14/30/90 Tage/frei), Kennzahlenkarten, AGP, Tagesansicht mit übereinanderliegenden Spuren (Glukose, Puls, Stress/Body Battery, Schlafphasen, Aktivitäten, Mahlzeiten), Nacht- und Aktivitätslisten, Zusammenhänge.
- **Datenstatus** in den Einstellungen: je Quelle letzter Sync, Abdeckung, offene Lücken mit Aktion.
- Export als CSV; später ein Bericht (PDF) für die Diabetesberatung.

---

## 5. Phasen

Jede Phase entspricht einem oder mehreren PRs. `desktop/main.cjs`, `src/main.tsx` und `package.json` sind Hotspots, daran arbeitet immer nur ein PR gleichzeitig (AGENTS.md).

| Phase | Version | Inhalt | Ergebnis |
|---|---|---|---|
| **0 – Spikes** | – | ~~`node:sqlite` in Electron 44 prüfen~~ (erledigt, läuft); Garmin-Login in Electron-Fenster + Abruf eines Tages Schlaf/Stress; Clarity-CSV-Format anhand eines echten Exports; `tconnectsync` einmal gegen Tandem Source EU laufen lassen (Bolus/KH, Modi, CGM für einen Zeitraum) | Garmin-Weg bestätigt, keine Produktänderung |
| **1 – Datenspeicher + Glukose + Pumpe** | 1.5 | `haze.db`, Schema, Sicherung; Nightscout-Sync mit Cursor (entries, treatments, devicestatus, profile); `tconnectsync` im Nightscout-Start; Lückentabelle + Nachholen aus Tandem Source; Clarity-CSV-Import; TIR zeitgewichtet | Glukose-Historie lückenarm und lokal |
| **2 – Garmin** | 1.6 | Garmin-Anbindung (gewählter Weg), Rückwärts-Befüllung, tägliche Überlappung, Bluetooth-Puls in die Datenbank; DSGVO-Import als Erstbefüllung | Bewegung, Schlaf und Stress in derselben Datenbank |
| **3 – Analyse-Engine** | 1.7 | Stufe 1 + 2 in `shared/analysis/`, vollständig getestet | belastbare Kennzahlen |
| **4 – Analyse-Oberfläche** | 2.0 | Analyse-Bereich, Tagesansicht, Zusammenhänge (Stufe 3), Datenstatus, Export | sichtbarer Mehrwert |
| optional | – | Dexcom API v3 (Alarme, Sensorsitzungen, Lücken), falls Tandem Source und Clarity nicht reichen | – |

---

## 6. Entscheidungen (7. Oktober 2026)

| Frage | Entscheidung | Folge für den Plan |
|---|---|---|
| Glukose-Lücken | **lokal bleiben, Lücken nachholen** | Hauptquelle zum Nachholen ist **Tandem Source** (siehe unten), Clarity-CSV als Handweg, Dexcom API v3 nur noch optional |
| Garmin | **Anmeldung im Haze-Fenster** (Garmin Connect über Chromium) | USB-FIT entfällt als eigener Weg; der DSGVO-Export bleibt für die Erstbefüllung |
| Therapie | **Tandem t:slim X2** (Control-IQ) | Bolus, Basal, Pumpenereignisse, Profile und die G7-Werte der Pumpe kommen aus Tandem Source |
| Sensor / Handy | **Dexcom G7, iPhone** | kein xDrip+/Juggluco-Uploader. Apple Health ist von Windows aus nicht erreichbar. Share bleibt die Live-Quelle |

Geprüft: `node:sqlite` läuft in der Electron-44-Laufzeit (Node 24.21, SQLite 3.53) ohne Flag. Damit braucht die Datenbank kein natives Modul.

### Tandem t:slim X2 über Tandem Source

- Die **t:slim-App** (in Deutschland seit Mai 2026 auch für iPhone) lädt die Pumpendaten **stündlich** nach Tandem Source, unabhängig vom PC. Tandem Source hat damit die komplette Historie.
- **`tconnectsync`** (MIT, aktiv gepflegt, v3.0.3 vom 1. Okt. 2026, Region `EU` einstellbar, läuft laut README auch nativ unter Windows) holt diese Daten und schreibt sie in **das lokale Nightscout**. Haze holt sie dort wie alles andere ab. Die Haze-Architektur bleibt also gleich.
- Was kommt: `BASAL`, `BOLUS`, `PUMP_EVENTS` (Alarme, Unterbrechung/Fortsetzung, Kartuschen- und Katheterwechsel, **Schlaf- und Sportmodus**), `PROFILES` (Basalraten, Korrekturfaktor, KH-Faktor). Optional `CGM`: die G7-Werte, die die Pumpe empfangen hat, mit mehr als 30 min Verzögerung.
- **Damit schließen sich die Glukose-Lücken ohne Dexcom-Antrag:** Nach einer PC-Pause holt Haze für die Lücke die Pumpen-CGM-Werte. Live bleibt Share. In `haze.db` gewinnt bei gleichem Zeitpunkt (± 2,5 min) Share; Pumpenwerte füllen nur Lücken. Damit Nightscout selbst keine doppelten Kurven zeigt, läuft `tconnectsync` dauerhaft **ohne** `CGM`. Die CGM-Werte holt Haze nur für Lückenzeiträume (Weg im Spike klären: eigener `tconnectsync`-Lauf mit Zeitraum oder direkter Abruf).
- **Schlaf- und Sportmodus** sind für die Analyse wertvoll: Sie markieren, wann Control-IQ anders regelt. Ohne diese Information würden Sport- und Nachtvergleiche verzerrt.
- Kohlenhydrate stehen in den Bolusdaten (Bolusrechner). Ob `tconnectsync` sie als eigenes Feld überträgt, prüft der Spike.
- Einrichtung (macht Nojo selbst, weil `pip install` aus Claude-Befehlen im App-Container landen kann): `pip install tconnectsync`, eigener Ordner mit `.env` (Tandem-Zugang, `TCONNECT_REGION=EU`, `TIMEZONE_NAME=Europe/Berlin`, `NS_URL=http://127.0.0.1:1337`, `NS_SECRET` = Nightscout-`API_SECRET`). **Kein Dauerprozess:** Haze startet tconnectsync bei jedem Abgleich selbst (`--start-date/--end-date`, Features `BASAL BOLUS PUMP_EVENTS PROFILES CGM_ALERTS`; für Lücken `CGM`). Pfad zu `tconnectsync.exe` und Ordner in Einstellungen › Daten eintragen.
- Risiken: Tandem Source ist eine inoffizielle Schnittstelle. Der Autor hat nur US-Zeitzonen getestet. Python 3.14 ist neu; falls Pakete fehlen, die vorhandene 3.11 nehmen.
- Später möglich: Tandem-Abruf direkt in Haze nachbauen (MIT erlaubt das), dann fällt Python weg. Erst sinnvoll, wenn der Python-Weg stabil läuft und die Datenformate bekannt sind.

### Neue Reihenfolge zum Nachholen von Glukose
1. Tandem Source (automatisch, etwa 1 h Verzögerung durch den stündlichen Upload)
2. Clarity-CSV-Import (manuell; deckt auch Zeiten ab, in denen die Pumpe keine Sensorwerte bekam)
3. Dexcom API v3 (optional, nur falls 1 und 2 nicht reichen)

### Rückblick
- **180 Tage** (entschieden), in Einstellungen › Daten änderbar (30/90/180/365).

## Quellen
- Dexcom API v3: [Endpunkte](https://developer.dexcom.com/docs/dexcomv3/endpoint-overview), [dataRange](https://developer.dexcom.com/docs/dexcomv3/operation/getDataRangeV3), [Zugangsstufen](https://developer.dexcom.com/docs/dexcom/scopes-access/), [Überblick inkl. Verzögerung](https://themomentum.ai/blog/dexcom-api-integration-developer-guide)
- [nightscout-connect](https://github.com/bewest/nightscout-connect)
- Tandem: [tconnectsync](https://github.com/jwoglom/tconnectsync), [t:slim-App in Deutschland](https://www.drugdeliverybusiness.com/tandem-launches-tslim-mobile-app-european-countries/), [Datenaustausch App ↔ Tandem Source](https://www.tandemdiabetes.com/support-center/software-and-apps/tandem-source/article/data-sharing-between-tslim-mobile-and-tandem-source)
- Garmin: [garth (eingestellt)](https://garth.readthedocs.io/en/latest/), [python-garminconnect](https://github.com/cyberjunky/python-garminconnect), [GarminDB-Diskussion zu lokalen FIT-Dateien](https://github.com/tcgoetz/GarminDB/discussions/156), [Garmin-Exportleitfaden](https://www.gneta.app/blog/export-garmin-data-guide), [FIT-JavaScript-SDK](https://www.npmjs.com/package/@garmin/fitsdk)
