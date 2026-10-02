# Haze – Regeln für Agenten (Codex, Claude) und Menschen

Haze ist eine Electron-App für Windows: Nightscout-Dashboard, Glukose-Widget mit fluidem Andocken und nativem Liquid Glass, Notch-Anbindung, Garmin-Puls. Hier arbeiten mehrere Agenten auf mehreren PCs. Diese Regeln gelten für alle.

## Git – nicht verhandelbar

1. **Nie direkt auf `main` committen oder pushen.** `main` ist geschützt; Änderungen kommen nur per Pull Request mit grünen Tests rein.
2. **Vor dem Start:** `git switch main && git pull`, dann eigener Branch mit Präfix des Agenten: `claude/<thema>` oder `codex/<thema>`.
3. **Ein Branch = ein Thema, kurz halten.** Lieber nach Stunden mergen als nach Tagen.
4. **Keine Ordnerkopien.** Nur im Git-Klon arbeiten. Kein Arbeiten in entpackten ZIPs oder Kopien ohne `.git`.
5. **Vor dem PR:** `git fetch && git rebase origin/main` (oder `main` mergen), Konflikte selbst lösen, Tests laufen lassen.
6. **PR-Beschreibung ausfüllen** (Vorlage): was, warum, was getestet, was nur auf dem echten Desktop prüfbar ist. Der nächste Agent liest das zuerst.
7. **Nach dem Merge** Branch löschen. Andere offene Branches holen sich `main` per Rebase.
8. **Installer nur aus `main` bauen und installieren.** Nie einen Feature-Branch-Build als „aktuelle Version“ ausliefern.

## Hotspots – nur ein offener PR gleichzeitig

`desktop/main.cjs`, `src/main.tsx`, `src/style.css`, `src/Widget.tsx`, `package.json`, `package-lock.json`.
Vor Änderungen daran prüfen, ob ein anderer offener PR sie schon anfasst: `gh pr list` und `gh pr diff <nr> --name-only`. Wenn ja: abstimmen oder warten, nicht parallel umbauen.

## Befehle

```powershell
npm ci --include=dev        # NODE_ENV=production ist auf Nojos PC gesetzt; ohne --include=dev fehlen Electron/Vite
npm test                    # node --test tests/*.test.mjs
npx tsc --noEmit
npm run build               # Typprüfung + Frontend nach dist/
powershell -ExecutionPolicy Bypass -File desktop/native-glass/build.ps1   # natives Glas (VS Build Tools)
npm start                   # Dev-App; NEBEL_DATA_DIR=<ordner> für einen isolierten Datenordner
npx electron-builder --win nsis --x64   # Installer nach release/ (nur von main)
```

Fehlt `node_modules/electron/dist/electron.exe`: `node node_modules/electron/install.js`.

## Aufbau

- `shared/` – reine Logik, vollständig getestet: `model.mjs` (Werte, Einheiten, Alter), `provider.mjs` (Nightscout, nur GET), `widget.mjs` (fluide Kontur, Regionen, Andockziele), `garmin.mjs`.
- `desktop/main.cjs` – Hauptprozess: Abruf, verschlüsselte Zugangsdaten (DPAPI), Fenster, Tray, lokale Webansicht.
- `desktop/widget-controller.cjs` – Widget-Physik aus dem nativen Widget Lab (Feder, Hals, Haftstrecke, Ablösemodi). Das Fenster ist eine feste Bühne über dem Arbeitsbereich; nur die Fensterregion folgt der Kontur.
- `desktop/optical-glass.cjs` + `desktop/native-glass/GlassAddon.cpp` – natives Glas (DXGI + D3D11 + DirectComposition). Konstantenpuffer müssen Vielfache von 16 Byte sein (`static_assert`).
- `desktop/notch-bridge.cjs` – Wert an die lokale Notch-App (127.0.0.1:47800).
- `desktop/garmin.cjs`, `src/Garmin.tsx` – Bluetooth-Puls.
- `src/` – React-UI (Dashboard, Einstellungen, Widget).

## Regeln für Code

- Bestehenden kompakten Stil beibehalten; Logik nach `shared/` und mit Tests in `tests/` absichern.
- Keine Zugangsdaten, Tokens, `settings.json` oder Messwerte committen.
- Nur verlässliche Aussagen in Doku/PR: Was nur auf dem echten Windows-Desktop prüfbar ist (Ziehen mit der Maus, Glas, Spiele, Autostart), ausdrücklich als offen markieren.
- `docs/PRUEFBERICHT.md` bei größeren Änderungen fortschreiben.
