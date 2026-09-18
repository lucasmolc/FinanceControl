@echo off
rem Cria um atalho na pasta Inicializar do usuario: o servidor sobe em segundo plano ao entrar no Windows.
powershell -NoProfile -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\LMM Finance Control.lnk'); $s.TargetPath = '%~dp0segundo-plano.cmd'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()" || exit /b 1
echo Adicionado a inicializacao do Windows. Para remover: remover-inicializacao.cmd
