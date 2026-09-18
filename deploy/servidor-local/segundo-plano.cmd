@echo off
rem Inicia o servidor sem janela. A saida vai para servidor.log (recriado a cada inicio).
powershell -NoProfile -Command "if (Get-Process FinanceControl.Api -ErrorAction SilentlyContinue | Where-Object Path -eq '%~dp0app\FinanceControl.Api.exe') { exit 1 }" || (
  echo O servidor ja esta rodando. Use parar.cmd para encerra-lo.
  exit /b 0
)
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0iniciar.cmd' -ArgumentList '--sem-pausa' -WorkingDirectory '%~dp0' -WindowStyle Hidden -RedirectStandardOutput '%~dp0servidor.log' -RedirectStandardError '%~dp0servidor-erros.log'"
echo Servidor iniciado em segundo plano. Logs: %~dp0servidor.log
