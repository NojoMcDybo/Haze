# Plan: Langzeit, Muster, Prognose-Experiment, KI-Erklärer

Stand: 12. Oktober 2026 · Status: D gemergt (#23, 1.9.0), E gemergt (#26, 1.10.0); F Teil 1 gemergt (#27, 1.11.0); **F Teil 2 umgesetzt** (Branch `claude/prognose-ttm`, 1.12.0); G offen

Nojos Wunsch: Veränderungen über Wochen und Monate erkennen und dort Zusammenhänge finden, wiederkehrende Muster lernen, eine Kurzzeitprognose als klar gekennzeichneten Test. Es gelten dieselben Regeln wie bisher: Alles läuft lokal, die Ergebnisse sind beschreibend, Haze gibt keine Therapiehinweise, und es werden keine Hypothesen über Insulin- oder KH-Mengen geprüft.

## Werkzeugwahl (Recherche 11. Oktober)

- **Laya** (NandhaKishorM/laya) ist ein Text-Entscheidungsmodell (ModernBERT/mmBERT). Es passt nicht: Zahlenreihen müssten erst in Text umgewandelt werden, ohne Nachtraining liegt es unter der Mehrheitsantwort, und laut README ist es überkonfident.
- **Zeitreihen-Grundmodelle** für die Prognose (F):
  - IBM Granite TTM r2: unter 1 Mio. Parameter, Apache 2.0, CPU.
  - Chronos-Bolt / Chronos-2: Apache 2.0.
  - TimesFM 2.5: Apache 2.0; Version 3.0 ist nur nichtkommerziell.

  GlucoFM-Bench (2026) zeigt, dass Chronos-2 und TimesFM ohne Training stark sind. Ein kleines LSTM gewinnt erst mit viel eigenem Training.
- **CGM-Modelle:** GluFormer, GlucoFM und CGM-LSM sind bisher Forschung, offene Gewichte sind unklar. Sie werden beobachtet, aber noch nicht genutzt.
- **Erklärbare Verfahren** für D und E sind in JavaScript ohne Abhängigkeiten umgesetzt bzw. geplant: Theil-Sen, Mann-Kendall, Wendepunkte, Matrix Profile, Clustering und Isolation Forest.
- **Ausführung:** Modelle laufen als ONNX mit onnxruntime-web (WebAssembly) im Analyse-Thread. Es braucht weder ein natives Modul noch Python oder die Grafikkarte. Die Modelldatei hat eine feste Prüfsumme und wird nur nach Opt-in geladen.

## PR D – Langzeit (1.9.0, umgesetzt)

`shared/analysis/longterm.mjs`, `src/Longterm.tsx`; Aktion `analysis` mit `kind:'longterm'` (bis 365 Tage, führende Tage ohne Daten werden abgeschnitten).

- **Wochen** (Mo–So) und **Kalendermonate:** zeitgewichtete Glukose-Kennzahlen, dazu Mittelwerte von Schritten, Training, Schlaf, HRV, Ruhepuls, Stress, Bereitschaft und Tagesinsulin. Das Tagesinsulin ist nur beschreibend und nur an Tagen mit Basal von der Pumpe. Eine Woche zählt ab 4 Tagen mit mindestens 12 h Tragezeit, ein Monat ab 10.
- **Vergleiche:**
  - letzte 4 Wochen gegen die 4 davor;
  - letzte 4 Wochen gegen die 12 davor;
  - letzter voller Monat gegen den davor.

  Grundlage sind die Tagesmittel. Das Intervall ist ein **AR(1)-korrigiertes t-Intervall** mit gemeinsamer Autokorrelation, Verzerrungskorrektur und effektiver Stichprobengröße. Der Block-Bootstrap wurde verworfen: Bei 28 gegen 28 Tagen lagen 13 % Fehlalarme vor statt 5 %. Mit dem t-Intervall sind es 3 bis 8 % bei Autokorrelation 0 bis 0,6.
  - Mindestgröße: 14 Tage je Seite.
  - Einordnung nach FDR (q ≤ 0,05), nur wenn der Unterschied spürbar ist (Zeit im Bereich 5 Prozentpunkte, unter 70 1, Mittelwert 10 mg/dL …): „klar höher/niedriger“.
  - „Stabil“: Das ganze Intervall liegt unter der spürbaren Grenze.
  - Sonst „offen“.
- **Trends:** Theil-Sen-Steigung und Mann-Kendall über gültige Wochen, ab 8 Wochen. Als Trend gilt nur, was mit q ≤ 0,1 abgesichert ist und über den Zeitraum spürbar ausfällt.
- **Wendepunkte** in Zeit im Bereich, Mittelwert und Zeit unter 70:
  - Verfahren: binäre Segmentierung mit mindestens 14 Tagen je Abschnitt, höchstens 3 Wendepunkte.
  - Strafterm: Langzeitvarianz der Reste um die Abschnitte, iterativ bestimmt.
  - Simulation mit 200 Läufen: höchstens 1,5 % Scheinbrüche, auch bei AR(1) 0,7. Treffer bei Brüchen von 2 Standardabweichungen: 100 % (unabhängig), 94 % (AR 0,5), 73 % (AR 0,7).
  - **Gleichzeitig:** Kontextgrößen 4 Wochen davor gegen 4 Wochen danach, nur bei Effektstärke ≥ 0,5 und spürbarem Unterschied.
- **Zusammenhänge zwischen Wochen** (11 feste Fragen, ab 12 Wochen):
  - Beide Reihen werden vorher vom Theil-Sen-Trend befreit, damit zwei steigende Reihen nicht scheinbar zusammenhängen.
  - Statistik: Spearman, Permutationstest, Bootstrap, FDR; Schwelle |ρ| ≥ 0,4.
- **Oberfläche:**
  - Wochenverlauf mit Kennzahl-Wahl, Trendlinie (nur bei klarem Trend) und Wendepunkt-Markierung.
  - Vergleichstabelle mit Intervall und Einordnung, Wendepunkte mit gleichzeitigen Veränderungen, Wochen-Zusammenhänge, Monatstabelle.
  - Eine Fehlergrenze um die Auswertung: Ein Fehler dort leert nie das Dashboard.

## PR E – Muster (1.10.0, umgesetzt)

Umgesetzt in `shared/analysis/patterns.mjs` und `src/Patterns.tsx`, als eigener Abschnitt „Muster“ zwischen Zeitraum-Auswertung und Langzeit:
- **Tagestypen:**
  - Jeder Tag mit mindestens 70 % Tragezeit wird zu 24 Stundenmitteln, bis zu 4 fehlende Stunden werden ergänzt. Gruppiert wird mit k-Medoids (k = 2–4, Auswahl nach Silhouette).
  - Typen gibt es erst ab 28 Tagen und einer Silhouette ab 0,25, sonst „keine klaren Typen“.
  - Namen entstehen aus dem Verlauf: „Ruhiger Tag“ oder „Höher/Niedriger + Tageszeit“.
  - Gemeinsame Merkmale (Wochenende, Training, kurze Nacht, Katheter ab Tag 2, Tief in der Nacht davor) werden per Fisher-Test mit FDR geprüft und brauchen mindestens 20 Prozentpunkte Unterschied.
- **Wiederkehrende Regeln:**
  - 8 feste Fragen, jeweils gegen eine Vergleichsgruppe: Fisher-Test, FDR, mindestens 5 Fälle, Faktor 1,5 und 15 Prozentpunkte Unterschied.
  - Bestätigung: Die Regel ist vor den letzten 6 Wochen schon zu sehen (einseitig p ≤ 0,1) und zeigt sich in den 6 Wochen erneut.
  - Gedächtnis in `meta.pattern-memory`: wann zuerst und zuletzt gesehen; verschwundene Regeln bleiben sichtbar.
- **Ungewöhnliche Tage:** gemessen an den 28 Tagen davor mit robustem z-Wert ≥ 3,5 (Median, MAD mit Mindeststreuung). Zusätzlich muss der Abstand spürbar sein und der Wert außerhalb von allem liegen, was in diesen 28 Tagen vorkam.
- **Verschoben:** Matrix Profile (wiederkehrende Verlaufsstücke innerhalb eines Tages). Tagestypen und Regeln decken das Ziel verständlicher ab.

### Ursprünglicher Plan

- **Tagestypen:** Clustering der 24-h-Verläufe, danach die Frage, was den Typ vorhersagt (Wochentag, Training, Schlaf, Katheter-Tag).
- **Wiederkehrende Verläufe:** Matrix Profile (Motive) und Regeln wie „Tief 2–6 h nach Training am Nachmittag ohne Sportmodus: 4 von 6“, mit Häufigkeit, Trefferquote und FDR.
- **Persönlicher Normalbereich:** gleitend über 28 Tage; ungewöhnliche Tage und Nächte werden markiert (Isolation Forest bzw. Median und MAD).
- **Lernen durch Bestätigung:** Ein Muster wird in älteren Daten gefunden und muss sich in neueren bestätigen. Es wird mit „zuerst gesehen / zuletzt bestätigt / verschwunden“ in `haze.db` gespeichert.

## PR F – Prognose-Experiment

### Teil 1 (1.11.0, umgesetzt)

Umgesetzt in `shared/analysis/forecast.mjs` und `src/Forecast.tsx`:
- **Modelle:**
  - einfache Fortschreibung;
  - gedämpfter Trend (Steigung der letzten 15 min, Dämpfung 0,85 je Schritt);
  - **AR(6) auf 5-Minuten-Differenzen**, gelernt per Ridge-Kleinstquadrate auf 28 Tagen und mehrstufig rekursiv.
- **Rückwärtsprüfung:** Das AR-Modell lernt nur auf den 28 Tagen **vor** den letzten 7 Tagen. Geprüft wird alle 15 Minuten auf 15, 30, 45 und 60 Minuten (RMSE, MAE, Bias, 10/90-Quantile der Fehler).
  - Gezeigt wird das Modell mit dem kleinsten Fehler bei 30 Minuten, aber nur, wenn es die Fortschreibung um mindestens 5 % schlägt. Sonst wird ehrlich die Fortschreibung gezeigt.
  - Das 80-%-Band stammt aus den Fehlerquantilen. Ein Test prüft, dass es in der Folgewoche 70–90 % der echten Werte enthält.
- **Ergebnisse:**
  - Künstliche Daten: Fortschreibung RMSE 19 mg/dL bei 30 min, AR 17 (11 % besser).
  - Echte Daten: noch zu wenige zusammenhängende Wochen, deshalb gewinnt die Fortschreibung.
- **Anzeige:**
  - Standardmäßig aus. Eingeschaltet wird nur über die Karte „Kurzzeit-Prognose“ auf der Auswertung, mit Bestätigung „nicht belastbar“.
  - Danach erscheint sie im Verlauf auf „Jetzt“ als blasse, gestrichelte Linie mit Band hinter einer „jetzt“-Linie, beschriftet „Experiment · nicht belastbar“; beim Zeigen gibt es einen eigenen Text.
  - Nie im Widget, in der Notch oder in Alarmen.

### Teil 2 (1.12.0, umgesetzt): IBM TTM r2

- **Test mit 7 Varianten** auf derselben Prüfwoche (künstliche Daten, 668 Startpunkte, RMSE bei 30 min gegen die Fortschreibung):

  | Variante | Vorlauf | RMSE 30 min | gegen Fortschreibung |
  |---|---|---|---|
  | 52-16 | 4,3 h | 20,4 | −2 % |
  | 90-30 | 7,5 h | 21,3 | −7 % |
  | 90-30-l1 | 7,5 h | 20,7 | −4 % |
  | 180-60-l1 | 15 h | 22,4 | −12 % |
  | **360-60-l1** | **30 h** | **17,8** | **+11 %** |
  | 512-48 | 43 h | 18,1 | +10 % |
  | 512-96 | 43 h | 18,7 | +7 % |

  Kurze Vorläufe schlagen die Fortschreibung nicht. **360-60-ft-l1-r2.1** ist die beste Variante, bei 60 min sogar 17 % besser.
- **Export:** Der TorchScript-Exporter scheitert am Frequenz-Token (MatMul-Größen). Der dynamo-Exporter mit Opset 18 funktioniert: größte Abweichung 7·10⁻⁶, eine Datei mit 5,8 MB (`tools/export-ttm.py`).
- **Laufzeit:** onnxruntime-web 1.30.0. Nur 3 Dateien (14,3 MB) liegen in `desktop/vendor/` statt 139 MB `node_modules`. Das WASM wird per `wasmBinary` aus der Datei gelesen, also ohne `fetch`. In Node, in Electron und aus `app.asar` geprüft: 5,5 ms je Lauf, 0,3 s Laden.
- **Sicherheit:** Alle Dateien liegen im Paket, mit festen SHA-256-Prüfsummen. Vor dem Laden wird geprüft, eine Abweichung führt zur Ablehnung (Test). Kein Netz, kein Python, kein natives Modul.
- **Einbindung:**
  - `evaluate` ist jetzt asynchron und nimmt ein Modell von außen an. Dieses braucht 30 h am Stück; alle Modelle werden dann auf denselben Startpunkten verglichen, sonst bleibt es außen vor, mit Begründung.
  - Live: `kind:'forecast-live'` rechnet den TTM-Pfad im Analyse-Thread aus frischen Nightscout-Werten plus Historie aus `haze.db`, bei jedem neuen Messwert.
- **Ergebnisse:**
  - Künstliche Daten im Analyse-Thread: TTM 16,2, AR 16,7, Fortschreibung 18,9 mg/dL bei 30 min. TTM wird gezeigt (14 % besser).
  - Echte DB-Kopie: nur 51 Startpunkte mit 30 h am Stück, deshalb bleibt TTM außen vor, und die Karte sagt warum.
- Chronos-Bolt ist nicht umgesetzt: TTM ist kleiner, und der Export ist erprobt.

### Ursprünglicher Plan F

- Vorher prüfen: Lassen sich TTM r2 und Chronos-Bolt nach ONNX exportieren und laufen sie in onnxruntime-web?
- Die Vorhersage reicht 30 bis 60 Minuten nur aus CGM, Tageszeit und persönlichem Profil. Tandem-Daten kommen mit Stunden Verzögerung, deshalb kennt die Prognose weder aktuelles Insulin noch aktuelle KH.
- Jede Prognose wird gespeichert und mit dem echten Wert verglichen: mittlerer Fehler gegen naive Fortschreibung.
- Standardmäßig aus, nur im Dashboard, ohne Widget und ohne Alarme. Darstellung als blasse, gestrichelte Linie mit Band und dauerhaft mit „Experiment – nicht belastbar, keine Grundlage für Entscheidungen“.

## PR G – KI-Erklärer (optional)

Ein lokales Sprachmodell (Llama oder Qwen über llama.cpp/Vulkan; RX 6700 XT mit 12 GB) bekommt nur Engine-Ergebnisse. Es muss jede Aussage mit einer Zahl belegen und darf keine Therapiehinweise geben. Ein Cloud-Modell kommt höchstens als ausdrückliches Opt-in und nur mit zusammengefassten Zahlen.
