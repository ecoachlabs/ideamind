@echo off
REM Apply Performance Indexes to Database (Windows)

echo ================================================
echo IdeaMine Database Index Migration
echo ================================================
echo.

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo ERROR: DATABASE_URL environment variable not set
    echo.
    echo Please set DATABASE_URL before running this script:
    echo   set DATABASE_URL=postgresql://user:password@localhost:5432/ideamine
    echo.
    pause
    exit /b 1
)

echo DATABASE_URL is set
echo.

REM Check if psql is available
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: psql command not found
    echo.
    echo Please install PostgreSQL from:
    echo   https://www.postgresql.org/download/windows/
    echo.
    pause
    exit /b 1
)

echo psql is available
echo.

REM Test database connection
echo Testing database connection...
psql "%DATABASE_URL%" -c "SELECT 1;" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Cannot connect to database
    echo.
    echo Please check:
    echo   1. Database is running
    echo   2. DATABASE_URL is correct
    echo   3. Network connectivity
    echo.
    pause
    exit /b 1
)

echo Database connection successful
echo.

REM Apply the migration
set MIGRATION_FILE=packages\orchestrator-core\migrations\001_performance_indexes.sql

if not exist "%MIGRATION_FILE%" (
    echo ERROR: Migration file not found: %MIGRATION_FILE%
    pause
    exit /b 1
)

echo Applying indexes...
echo.

psql "%DATABASE_URL%" -f "%MIGRATION_FILE%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ================================================
    echo Migration completed successfully!
    echo ================================================
    echo.
    echo Expected performance improvement: 10-100x faster queries
    echo.
) else (
    echo.
    echo Migration failed. Check error messages above.
    pause
    exit /b 1
)

pause
