@echo off
title JAMANVAAR Server Launcher
color 0A

echo ================================================================
echo           🍽️  JAMANVAAR RESTAURANT OPERATING SYSTEM
echo                 All Servers Launcher (Windows)
echo ================================================================
echo.
echo Select the launch profile:
echo [1] Launch ALL Servers (Cloud API + Super Admin + All Terminals)
echo [2] Launch Cloud SaaS Suite Only (Cloud API :4000 + Super Admin :5180)
echo [3] Launch Restaurant Terminal Suite (POS, Admin, KDS, Captain, Kiosk)
echo [4] Launch Super Admin Web Only (:5180)
echo [5] Launch Cloud API Backend Only (:4000)
echo [6] Exit
echo.

set /p choice="Enter your choice (1-6) [default: 1]: "
if "%choice%"=="" set choice=1

if "%choice%"=="1" goto ALL
if "%choice%"=="2" goto CLOUD
if "%choice%"=="3" goto RESTAURANT
if "%choice%"=="4" goto SUPER
if "%choice%"=="5" goto API
if "%choice%"=="6" goto EXIT

:ALL
echo Starting All Servers...
npm run dev:all
goto END

:CLOUD
echo Starting Cloud SaaS Suite (API + Super Admin)...
npm run dev:cloud
goto END

:RESTAURANT
echo Starting Restaurant Terminal Suite...
npm run dev
goto END

:SUPER
echo Starting Super Admin Web (:5180)...
npm run dev:super-admin
goto END

:API
echo Starting Cloud API Backend (:4000)...
npm run dev:cloud-api
goto END

:EXIT
echo Exiting.
exit /b 0

:END
pause
