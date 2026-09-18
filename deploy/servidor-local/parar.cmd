@echo off
rem Encerra o servidor publicado (nao afeta o "npm run dev"). O SQLite em modo WAL tolera o encerramento forcado.
powershell -NoProfile -Command "$p = Get-Process FinanceControl.Api -ErrorAction SilentlyContinue | Where-Object Path -eq '%~dp0app\FinanceControl.Api.exe'; if ($p) { $p | Stop-Process -Force; 'Servidor parado.' } else { 'O servidor nao estava rodando.' }"
