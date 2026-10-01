Unicode true
!include "MUI2.nsh"
!define MUI_ICON "nebel.ico"
Name "Haze"
OutFile "..\release\Haze-Setup-1.2.0.exe"
InstallDir "$LOCALAPPDATA\Programs\Nebel"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "1.2.0.0"
VIAddVersionKey "ProductName" "Haze"
VIAddVersionKey "FileDescription" "Haze Setup"
VIAddVersionKey "FileVersion" "1.2.0"
VIAddVersionKey "LegalCopyright" "Personal"
BrandingText "Haze"
!define MUI_WELCOMEPAGE_TITLE "Haze auf deinem PC"
!define MUI_WELCOMEPAGE_TEXT "Persoenliches Nightscout-Dashboard und Windows-Overlay.$\r$\n$\r$\nBitte eine bereits laufende Nebel- oder Haze-App vor dem Installieren im Infobereich vollstaendig beenden.$\r$\n$\r$\nNightscout wird separat betrieben. Diese Installation aendert keine Therapieeintraege."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Haze.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Haze starten"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"
Section "Haze"
 SetShellVarContext current
 SetOutPath "$INSTDIR"
 File /r "..\..\..\work\nebel-package\*.*"
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 Delete "$DESKTOP\Nebel.lnk"
 Delete "$SMPROGRAMS\Nebel\Nebel.lnk"
 RMDir "$SMPROGRAMS\Nebel"
 CreateDirectory "$SMPROGRAMS\Haze"
 CreateShortcut "$SMPROGRAMS\Haze\Haze.lnk" "$INSTDIR\Haze.exe" "" "$INSTDIR\haze.ico"
 CreateShortcut "$DESKTOP\Haze.lnk" "$INSTDIR\Haze.exe" "" "$INSTDIR\haze.ico"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nebel" "DisplayName" "Haze"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nebel" "DisplayVersion" "1.2.0"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nebel" "UninstallString" '"$INSTDIR\Uninstall.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nebel" "InstallLocation" "$INSTDIR"
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nebel" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nebel" "NoRepair" 1
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 Delete "$DESKTOP\Haze.lnk"
 Delete "$SMPROGRAMS\Haze\Haze.lnk"
 RMDir "$SMPROGRAMS\Haze"
 Delete "$DESKTOP\Nebel.lnk"
 Delete "$SMPROGRAMS\Nebel\Nebel.lnk"
 RMDir "$SMPROGRAMS\Nebel"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nebel"
 DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Nebel"
 Delete "$INSTDIR\*.dll"
 Delete "$INSTDIR\*.pak"
 Delete "$INSTDIR\*.bin"
 Delete "$INSTDIR\*.dat"
 Delete "$INSTDIR\*.json"
 Delete "$INSTDIR\LICENSE*"
 Delete "$INSTDIR\version"
 Delete "$INSTDIR\nebel.ico"
 Delete "$INSTDIR\haze.ico"
 Delete "$INSTDIR\Haze.exe"
 Delete "$INSTDIR\Nebel.exe"
 Delete "$INSTDIR\Uninstall.exe"
 RMDir /r "$INSTDIR\resources"
 RMDir /r "$INSTDIR\locales"
 RMDir "$INSTDIR"
 ; User settings and encrypted credentials intentionally remain in AppData.
SectionEnd
