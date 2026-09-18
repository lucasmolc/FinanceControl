@echo off
rem Compila a interface e publica a aplicação integrada em deploy\servidor-local\app.
rem Pare o servidor antes de publicar (o executável fica bloqueado enquanto roda).
setlocal
cd /d "%~dp0..\.."
call npm ci || exit /b 1
call npm run build --workspace @lmm/finance-control-web || exit /b 1
dotnet publish src\FinanceControl.Api -c Release -o "%~dp0app" || exit /b 1
echo.
echo Publicado em %~dp0app. Inicie com iniciar.cmd.
