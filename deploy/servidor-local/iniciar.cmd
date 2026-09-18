@echo off
title LMM Finance Control - servidor local (Ctrl+C para parar)
setlocal
set "PORTA=" & set "DADOS=" & set "HOSTS_EXTRAS="
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%~dp0servidor.conf") do set "%%a=%%b"
if not defined PORTA set "PORTA=5074"
if not defined DADOS set "DADOS=%~dp0..\..\src\FinanceControl.Api\Data"

if not exist "%~dp0app\FinanceControl.Api.exe" (
  echo Aplicacao nao publicada. Execute publicar.cmd primeiro.
  if not "%~1"=="--sem-pausa" pause
  exit /b 1
)

rem Aceita apenas nomes desta maquina (protege contra DNS rebinding); a API ainda exige login.
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object IPAddress) -join ';'"`) do set "IPS=%%i"
set "AllowedHosts=localhost;[::1];%COMPUTERNAME%;%IPS%;%HOSTS_EXTRAS%"
set "Urls=http://0.0.0.0:%PORTA%"
set "DATA_DIRECTORY=%DADOS%"

echo Dados: %DATA_DIRECTORY%
echo Neste computador: http://localhost:%PORTA%
echo Em outro PC da rede: http://%COMPUTERNAME%:%PORTA%
echo No celular (use o IP da rede Wi-Fi):
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '  http://' + $_.IPAddress + ':%PORTA%  (' + $_.InterfaceAlias + ')' }"
echo.
cd /d "%~dp0app"
"%~dp0app\FinanceControl.Api.exe"
if errorlevel 1 (
  echo.
  echo O servidor parou com erro. Veja a mensagem acima ^(porta %PORTA% ja em uso? "npm run dev" aberto?^).
  if not "%~1"=="--sem-pausa" pause
)
