; Custom NSIS macros for EasyClaw installer (included via electron-builder).
;
; The gateway child process runs as EasyClaw.exe (with ELECTRON_RUN_AS_NODE=1,
; detached=true) and can survive after the user quits the main Electron app.
; When the user manually reinstalls/upgrades, NSIS detects this orphaned
; EasyClaw.exe and shows "EasyClaw cannot be closed" — even though the user
; already quit the app.
;
; We use three hooks to prevent this:
;   1. customInit          — early process cleanup in .onInit
;   2. customCheckAppRunning — replaces _CHECK_APP_RUNNING (no dialog)
;   3. customUnInstallCheck  — gracefully handles old-uninstaller failure

; ---------------------------------------------------------------------------
; Shared helper: kill all EasyClaw-related processes
; ---------------------------------------------------------------------------
!macro _killEasyClawProcesses
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
  ; Wait for Windows to fully release file handles on native modules (.node,
  ; .dll). 2 seconds was insufficient for some users upgrading from v1.4.8.
  Sleep 3000
!macroend

; ---------------------------------------------------------------------------
; Hook 1: customInit — runs in .onInit, before CHECK_APP_RUNNING
; ---------------------------------------------------------------------------
!macro customInit
  !insertmacro _killEasyClawProcesses
  ; Remove gateway lock files from the temp directory so the newly installed
  ; version doesn't hit "gateway already running" on first start.
  ; The lock dir is %TEMP%\openclaw\ (no uid suffix on Windows).
  RMDir /r "$TEMP\openclaw"
!macroend

; ---------------------------------------------------------------------------
; Hook 2: customCheckAppRunning — replaces the default _CHECK_APP_RUNNING
;
; The default logic uses PowerShell to detect ANY process under $INSTDIR and
; shows a blocking "cannot be closed" dialog. By defining this macro we
; completely replace that behaviour: just do another round of kills and
; continue silently. No dialog.
; ---------------------------------------------------------------------------
!macro customCheckAppRunning
  !insertmacro _killEasyClawProcesses
!macroend

; ---------------------------------------------------------------------------
; Hook 3: customUnInstallCheck — handles old-uninstaller failure
;
; When upgrading from an older version (e.g. 1.4.8 → 1.5.x), the NEW
; installer runs the OLD uninstaller silently. If the old uninstaller fails
; (e.g. it has its own CHECK_APP_RUNNING that triggers, or file locks), the
; new installer retries 5 times and then shows "$(appCannotBeClosed)".
;
; By defining customUnInstallCheck we intercept handleUninstallResult: log the
; error but don't block. The new installer will overwrite the old files anyway.
; ---------------------------------------------------------------------------
!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint "Old uninstaller exited with code $R0 (ignored — files will be overwritten)."
  ${endif}
!macroend

; ---------------------------------------------------------------------------
; customUnInit — same cleanup for the uninstaller binary
; ---------------------------------------------------------------------------
!macro customUnInit
  !insertmacro _killEasyClawProcesses
  RMDir /r "$TEMP\openclaw"
!macroend
