@echo off
title LMM Finance Control - servidor local (Ctrl+C para parar)
setlocal
set "PORTA=" & set "BANCO=" & set "HOSTS_EXTRAS="
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%~dp0servidor.conf") do set "%%a=%%b"
if not defined PORTA set "PORTA=5074"
if not defined BANCO set "BANCO=%~dp0..\..\src\FinanceControl.Api\Data\finance.db"

if not exist "%~dp0app\FinanceControl.Api.exe" (
  echo Aplicacao nao publicada. Execute publicar.cmd primeiro.
  if not "%~1"=="--sem-pausa" pause
  exit /b 1
)

rem Sem login na aplicacao: aceita apenas nomes desta maquina (protege contra DNS rebinding).
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object IPAddress) -join ';'"`) do set "IPS=%%i"
set "AllowedHosts=localhost;[::1];%COMPUTERNAME%;%IPS%;%HOSTS_EXTRAS%"
set "Urls=http://0.0.0.0:%PORTA%"
set "DATABASE_PATH=%BANCO%"

echo Banco: %DATABASE_PATH%
echo Acesse de outro dispositivo da rede: http://%COMPUTERNAME%:%PORTA%  (ou pelo IP: %IPS%)
echo.
cd /d "%~dp0app"
"%~dp0app\FinanceControl.Api.exe"
if errorlevel 1 (
  echo.
  echo O servidor parou com erro. Veja a mensagem acima ^(porta %PORTA% ja em uso? "npm run dev" aberto?^).
  if not "%~1"=="--sem-pausa" pause
)
