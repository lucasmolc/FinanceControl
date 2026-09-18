@echo off
rem Remove o atalho criado por adicionar-inicializacao.cmd (nao para o servidor; use parar.cmd).
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Startup') + '\LMM Finance Control.lnk')"
echo Removido da inicializacao do Windows.
