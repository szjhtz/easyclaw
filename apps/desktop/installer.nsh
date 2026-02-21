; Custom NSIS macros for EasyClaw installer (included via electron-builder).
;
; The gateway child process runs as EasyClaw.exe (with ELECTRON_RUN_AS_NODE=1,
; detached=true) and can survive after the user quits the main Electron app.
; When the user manually reinstalls/upgrades, NSIS detects this orphaned
; EasyClaw.exe and shows "EasyClaw cannot be closed" — even though the user
; already quit the app. These macros kill orphaned processes before the
; default CHECK_APP_RUNNING logic runs.

!macro customInit
  ; Kill all EasyClaw.exe processes (main app + orphaned gateway children).
  ; At this point the installer is starting, so any running EasyClaw.exe
  ; instances should be terminated to release file locks.
  nsExec::ExecToLog 'taskkill /f /im EasyClaw.exe'
  Pop $0 ; discard exit code (fails silently if no process found)
  ; Also kill openclaw binaries in case they were spawned as separate executables
  nsExec::ExecToLog 'taskkill /f /im openclaw-gateway.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /f /im openclaw.exe'
  Pop $0
  ; Remove gateway lock files from the temp directory so the newly installed
  ; version doesn't hit "gateway already running" on first start.
  ; The lock dir is %TEMP%\openclaw\ (no uid suffix on Windows).
  RMDir /r "$TEMP\openclaw"
  ; Wait for file handles to be released
  Sleep 2000
!macroend

!macro customUnInit
  ; Same cleanup for the uninstaller
  nsExec::ExecToLog 'taskkill /f /im EasyClaw.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /f /im openclaw-gateway.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /f /im openclaw.exe'
  Pop $0
  RMDir /r "$TEMP\openclaw"
  Sleep 2000
!macroend
