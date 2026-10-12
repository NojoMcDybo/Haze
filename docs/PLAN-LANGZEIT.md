# Plan: Langzeit, Muster, Prognose-Experiment, KI-Erklärer

Stand: 12. Oktober 2026 · Status: PR D gemergt (#23, 1.9.0); **PR E umgesetzt** (Branch `claude/muster`, 1.10.0); F–G offen

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

## PR F – Prognose-Experiment (geplant, vorher Test)

- Vorher prüfen: Lassen sich TTM r2 und Chronos-Bolt nach ONNX exportieren und laufen sie in onnxruntime-web?
- Die Vorhersage reicht 30 bis 60 Minuten nur aus CGM, Tageszeit und persönlichem Profil. Tandem-Daten kommen mit Stunden Verzögerung, deshalb kennt die Prognose weder aktuelles Insulin noch aktuelle KH.
- Jede Prognose wird gespeichert und mit dem echten Wert verglichen: mittlerer Fehler gegen naive Fortschreibung.
- Standardmäßig aus, nur im Dashboard, ohne Widget und ohne Alarme. Darstellung als blasse, gestrichelte Linie mit Band und dauerhaft mit „Experiment – nicht belastbar, keine Grundlage für Entscheidungen“.

## PR G – KI-Erklärer (optional)

Ein lokales Sprachmodell (Llama oder Qwen über llama.cpp/Vulkan; RX 6700 XT mit 12 GB) bekommt nur Engine-Ergebnisse. Es muss jede Aussage mit einer Zahl belegen und darf keine Therapiehinweise geben. Ein Cloud-Modell kommt höchstens als ausdrückliches Opt-in und nur mit zusammengefassten Zahlen.
