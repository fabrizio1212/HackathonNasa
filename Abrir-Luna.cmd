@echo off
setlocal
cd /d "%~dp0"
py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 (
    py -3 server.py --open
    goto finish
)
python -c "import sys" >nul 2>&1
if not errorlevel 1 (
    python server.py --open
    goto finish
)
for /d %%B in ("%ProgramFiles%\Blender Foundation\Blender *") do (
    for /d %%V in ("%%~fB\*") do (
        if exist "%%~fV\python\bin\python.exe" (
            "%%~fV\python\bin\python.exe" server.py --open
            goto finish
        )
    )
)
echo No se encontro Python 3.
:finish
pause