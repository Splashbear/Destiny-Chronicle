@echo off
REM Home / dedicated PC API launcher. All paths from home-pc.env (or environment).
REM Does not enable gap lean unless ENABLE_GAP_LEAN=true in the env file.
setlocal
cd /d "%~dp0.."

if exist "%~dp0home-pc.env" (
  call "%~dp0home-pc.env"
) else if exist "%~dp0home-pc.env.cmd" (
  call "%~dp0home-pc.env.cmd"
) else (
  echo ERROR: missing api-server\scripts\home-pc.env — copy home-pc.env.example and edit.
  exit /b 1
)

if not defined PGCR_API_PORT set PGCR_API_PORT=3001
if not defined PGCR_LOG_DIR set PGCR_LOG_DIR=%TEMP%\pgcr-api-logs
if not exist "%PGCR_LOG_DIR%" mkdir "%PGCR_LOG_DIR%"

if not exist "dist\server.js" (
  echo Building api-server...
  call npm run build
  if errorlevel 1 exit /b 1
)

echo Starting PGCR API on :%PGCR_API_PORT%  ENABLE_GAP_LEAN=%ENABLE_GAP_LEAN%
echo Compact=%COMPACT_INDEX_ROOT%
echo Gap=%GAP_INDEX_ROOT%
node dist\server.js 1>> "%PGCR_LOG_DIR%\pgcr_api.out.log" 2>> "%PGCR_LOG_DIR%\pgcr_api.err.log"
exit /b %ERRORLEVEL%
