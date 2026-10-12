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

## Nächste Schritte (vorgeschlagen)

- **Kennzahlen als eine Karte mit zwei Spalten** statt fünf Kacheln, wie die `statlist` in Nebel. Das ist ruhiger und auf dem Handy kürzer.
- **Ein Satz zuerst:** Oben auf der Auswertung steht eine Zusammenfassung in Klartext. Tabellen sind erst auf Wunsch offen, etwa Nächte, Monate und Katheter.
- **Farbe nur für Schwellen.** Nebel ist unbunt, Farbe gibt es nur unter 70 und über 180 („ein guter Tag sieht langweilig aus“). Die blauen Linien der Auswertung könnten tintenfarben werden.
- **Bottom-Sheets für Eingaben** statt Einstellungsseiten, zum Beispiel für den Clarity-Import mit Anleitung.
