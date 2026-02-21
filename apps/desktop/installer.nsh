; Custom NSIS macros for EasyClaw installer (included via electron-builder).
;
; The gateway child process runs as EasyClaw.exe (with ELECTRON_RUN_AS_NODE=1,
; detached=true) and can survive after the user quits the main Electron app.
; When the user manually reinstalls/upgrades, NSIS detects this orphaned
; EasyClaw.exe and shows "EasyClaw cannot be closed" — even though the user
; already quit the app. These macros kill orphaned processes before the
; default CHECK_APP_RUNNING logic runs.

!macro customInit
  ; Kill all EasyClaw.exe processes AND their entire process trees (/t).
  ; /f = force, /t = tree (kills child processes too — node workers, gateway).
  nsExec::ExecToLog 'taskkill /f /t /im EasyClaw.exe'
  Pop $0 ; discard exit code (fails silently if no process found)
  ; Also kill openclaw binaries in case they were spawned as separate executables
  nsExec::ExecToLog 'taskkill /f /t /im openclaw-gateway.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /f /t /im openclaw.exe'
  Pop $0
  ; Kill any stray node.exe that might hold locks on vendor .node files
  ; (e.g. better-sqlite3). Only targets node.exe with "easyclaw" in the
  ; command line to avoid killing unrelated Node processes.
  nsExec::ExecToLog 'wmic process where "name='"'"'node.exe'"'"' and commandline like '"'"'%easyclaw%'"'"'" call terminate'
  Pop $0
  ; Remove gateway lock files from the temp directory so the newly installed
  ; version doesn't hit "gateway already running" on first start.
  ; The lock dir is %TEMP%\openclaw\ (no uid suffix on Windows).
  RMDir /r "$TEMP\openclaw"
  ; Wait for Windows to fully release file handles on native modules (.node,
  ; .dll). 2 seconds was insufficient for some users upgrading from v1.4.8.
  Sleep 5000
!macroend

!macro customUnInit
  ; Same cleanup for the uninstaller
  nsExec::ExecToLog 'taskkill /f /t /im EasyClaw.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /f /t /im openclaw-gateway.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /f /t /im openclaw.exe'
  Pop $0
  nsExec::ExecToLog 'wmic process where "name='"'"'node.exe'"'"' and commandline like '"'"'%easyclaw%'"'"'" call terminate'
  Pop $0
  RMDir /r "$TEMP\openclaw"
  Sleep 5000
!macroend
