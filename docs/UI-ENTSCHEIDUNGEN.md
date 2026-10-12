# UI-Entscheidungen (aus Nebel übernommen)

Stand: 12. Oktober 2026. Nojos Vorgabe: Die wachsende Zahl an Funktionen darf die Bedienung nicht unintuitiv machen. Vorbild ist Nebel (`NojoMcDybo/nebel`, `app/template.html`).

## Übernommen in 1.9.1

- **Seitenwechsel als aufgelegtes Blatt.**
  - Die ankommende Seite schiebt sich von rechts über die vorige. Ihre linken Ecken sind abgerundet (26 px), dahinter liegt ein Schatten.
  - Die untere Seite bleibt stehen, wird unscharf (9 px) und blasser (bis −26 %).
  - Maus, Touch und Touchpad führen die Seite 1:1, am Rand mit Gummiband (×0,32).
  - Beim Loslassen entscheidet die Geschwindigkeit (±0,45 px/ms), sonst die halbe Breite.
  - Einrasten in 0,56 s mit der Feder `cubic-bezier(.22,.9,.24,1)` (`--spring`).
  - Nach dem Einrasten wird die verdeckte Seite ausgeblendet, damit die Unschärfe nichts kostet.
  - Jede Seite merkt sich ihre Scrollposition.
- **Wisch-Hinweis am Seitenende:** eine Karte mit wandernden Pfeilen („Auswertung · nach links wischen“), damit man die zweite Seite findet, ohne es zu wissen.
- **Handlungen dort, wo man sie braucht.** Die Datenquellen stehen oben auf der Auswertung, als vier Kacheln mit Status und genau einer nächsten Handlung: verbinden, anmelden, einrichten oder importieren. Das Tandem-Einrichten klappt direkt dort auf. Einstellungen › Daten bleibt für Details und Seltenes.
- **Aufklappen statt Dauertext.** Erklärungen („Wie lese ich das?“) und Grenzen („Wie belastbar ist das?“) sind zu, bis man sie öffnet. Das Plus dreht sich zum Kreuz, der Inhalt gleitet auf.

## Bewegung (1.13)

Bewegung zeigt, was sich geändert hat, und hört dann auf (`src/motion.ts`, `src/motion.css`). Die Federkurven kommen aus dem Design-System (`--n-ease`, `--n-spring`).
- **Werte gleiten statt zu springen:**
  - der große Glukosewert, die Kennzahlen und die Legende der Bereiche zählen zum neuen Wert;
  - das Tagesprofil morpht beim Wechsel 14/30/90 Tage;
  - der Wochenverlauf morpht beim Kennzahl-Wechsel, die Achsen gleiten mit.
- **Verlauf auf „Jetzt“:**
  - Die Zeit- und Glukoseachse gleiten, so zoomt der Wechsel 3/6/12/24 Std.
  - Der neueste Messwert springt herein und sendet einen Ring aus.
  - Punkte wachsen unter dem Zeiger.
  - Die Prognose blendet ein.
- **Erstes Erscheinen:**
  - Karten, Kacheln und Listen kommen gestaffelt leicht von unten, sobald sie sichtbar werden.
  - Linien (Median, Wochenverlauf, Tagestypen) zeichnen sich.
  - Balken wachsen von links.
- **Laden:** Schimmernde Platzhalter in der Form der Seite statt „wird berechnet …“.
- **Abschalten:** „Bewegung reduzieren“ in Haze oder in Windows schaltet alles ab. Bei verdecktem Fenster springen Werte sofort ans Ziel, weil der Browser dort die Bildwiederholung pausiert. Ein Rückfall sorgt dafür, dass keine Karte unsichtbar bleibt.

## Schlaf und Tag (1.14)

- **Gemeinsame Zeitachse:** Garmin-Werte stehen unter der Glukose auf derselben Zeitachse, mit einem Zeiger für alle Streifen. So sieht man zusammen, was zusammen passiert ist.
- **Unbunt wie in Nebel:** Verläufe in Tinte, Stress und Schritte als blasse Balken. Farbe tragen nur die Schwellen 70 und 180.
- **Tage blättern** statt Zeitraum wählen: Eine Nacht und ein Tag sind die natürliche Einheit.

## Schlaf und Tag, Ausbau (1.15)

Nojo wollte die Werte deutlicher hervorgehoben, Vergleiche im selben Element und beides: Durchschnitt und einzelner Tag.
- **Farbe gezielt eingesetzt** (mit dem dataviz-Validator geprüft: Farbsehschwäche, Unterscheidbarkeit, Kontrast; hell und dunkel mit eigenen Stufen):
  - Schlafphasen: Wach Gelb, REM Magenta, Leicht Blau, Tief Türkis, in dieser Nachbarschaft geprüft.
  - Body Battery Violett, Stress Orange. Schritte bleiben neutral.
  - Glukose bleibt Tinte und färbt sich unter 70 rot und über 180 gelb, dicker gezeichnet. Abweichungen stechen hervor, ein guter Verlauf bleibt ruhig.
- **Vergleich im selben Element:**
  - Hinter jeder Kurve liegt der übliche Bereich der 14 Tage davor als Band, mit gestrichelter Medianlinie; bei Schritten ist das Übliche je Stunde als Strich markiert.
  - Phasenanteile als 100-%-Balken: „Diese Nacht“ gegen „Üblich“.
  - Kennzahlen mit „(Ø …)“.
  - 4-Wochen-Kacheln mit Balken „heute gegen üblichen Bereich“; außerhalb des Bereichs gibt es Rahmen, Pfeil und den Abstand zum Median.
- **Umschalter Tag / Ø 7 / Ø 14 / Ø 30 Tage:**
  - Im Durchschnitt werden Nächte ab dem Einschlafen übereinandergelegt (Phasenanteile als gestapelte Fläche, Glukose als Median mit mittlerer Hälfte).
  - Tage werden nach Uhrzeit zusammengefasst, Schritte als Mittel je Stunde.
- **Legende** unter jedem Diagramm, damit Farbe nie allein trägt; Prozentwerte direkt in den Balken.

## Nächste Schritte (vorgeschlagen)

- **Kennzahlen als eine Karte mit zwei Spalten** statt fünf Kacheln, wie die `statlist` in Nebel. Das ist ruhiger und auf dem Handy kürzer.
- **Ein Satz zuerst:** Oben auf der Auswertung steht eine Zusammenfassung in Klartext. Tabellen sind erst auf Wunsch offen, etwa Nächte, Monate und Katheter.
- **Farbe nur für Schwellen.** Nebel ist unbunt, Farbe gibt es nur unter 70 und über 180 („ein guter Tag sieht langweilig aus“). Die blauen Linien der Auswertung könnten tintenfarben werden.
- **Bottom-Sheets für Eingaben** statt Einstellungsseiten, zum Beispiel für den Clarity-Import mit Anleitung.
