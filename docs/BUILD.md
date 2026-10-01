# Build des gelieferten Pakets

Frontend: `node desktop/build.cjs` bündelt React/TypeScript und CSS mit esbuild ohne externe Webfonts oder CDNs. Vorher `node node_modules/typescript/bin/tsc --noEmit`.

Standard außerhalb der eingeschränkten Entwicklungsumgebung: `npm ci`, `npm run package` (electron-builder, NSIS, Windows x64). Diese Konfiguration ist als Alternative enthalten.

Der tatsächlich verwendete Paketweg:

1. Electron 44.4.3 über das offizielle npm-Paket und dessen Installationsskript beziehen; dessen Download prüft die von Electron veröffentlichten Prüfsummen.
2. `node_modules/electron/dist` in einen separaten Paketordner kopieren, `electron.exe` in `Nebel.exe` umbenennen.
3. Nur `desktop`, `shared`, `dist` und `package.json` in einen separaten App-Stagingordner kopieren. Keine Daten, Tokens, Testkonten oder `node_modules` einpacken.
4. Mit `node node_modules/@electron/asar/bin/asar.js pack STAGING PAKET/resources/app.asar` packen. `desktop/nebel.ico` zusätzlich im Paket-Hauptverzeichnis ablegen.
5. NSIS 3.0.4.1 aus dem offiziellen Repository `electron-userland/electron-builder-binaries`, Asset `nsis-3.0.4.1.7z`, verwenden. SHA-256: `9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa`.
6. `desktop/installer.nsi` mit `makensis.exe` übersetzen. Das Skript erwartet den Staging-Paketordner hier unter `../../../work/nebel-package` relativ zu `desktop`; bei einem unabhängigen Checkout diesen Buildpfad anpassen.

Die NSIS-Datei ist vollständig lesbar im Quellcode. Sie installiert pro Benutzer, legt Startmenü- und Desktop-Verknüpfungen an und registriert eine Deinstallation. Die Benutzerdaten werden beim Installieren oder Deinstallieren nicht gelöscht. Der Installer wird nicht automatisch gestartet.

`release/SHA256SUMS.txt` enthält den Hash des fertigen Installers. Eine Prüfsumme ermöglicht die Erkennung einer geänderten Datei, ersetzt aber keine digitale Herausgebersignatur.

Haze 1.2: Zuerst desktop/native-glass/build.ps1 ausführen. Der selbst gebaute Renderer haze-glass.node muss als resources/haze-glass.node außerhalb von app.asar liegen. Der mitgelieferte Demo-Prototyp wird nicht ausgeliefert. Electron-Builder übernimmt dies über extraResources; beim lokalen NSIS-Build vorher nach work/nebel-package/resources kopieren.
