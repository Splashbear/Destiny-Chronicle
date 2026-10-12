@echo off
rem Played With summary worker supervisor: runs the worker and restarts it 30 s after any exit.
rem Usage: run-worker.cmd <env file>   (KEY=VALUE lines, # comments; see worker.env.example)
setlocal
set "ENVFILE=%~1"
if "%ENVFILE%"=="" set "ENVFILE=%~dp0worker.env"
for /f "usebackq eol=# tokens=1* delims==" %%a in ("%ENVFILE%") do set "%%a=%%b"
if "%PLAYED_WITH_WORKER_LOG%"=="" set "PLAYED_WITH_WORKER_LOG=%PLAYED_WITH_SUMMARY_DIR%\worker.log"
if not "%PLAYED_WITH_DUCKDB_TEMP_DIR%"=="" (set "TEMP=%PLAYED_WITH_DUCKDB_TEMP_DIR%" & set "TMP=%PLAYED_WITH_DUCKDB_TEMP_DIR%")
cd /d "%~dp0..\.."
:loop
echo {"at":"%date% %time%","msg":"supervisor: starting worker"}>>"%PLAYED_WITH_WORKER_LOG%"
node dist\workers\played-with-summary.worker.js >>"%PLAYED_WITH_WORKER_LOG%" 2>&1
echo {"at":"%date% %time%","msg":"supervisor: worker exited %errorlevel%, restarting in 30 s"}>>"%PLAYED_WITH_WORKER_LOG%"
timeout /t 30 /nobreak >nul
goto loop