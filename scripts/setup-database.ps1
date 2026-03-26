# DoxieGuard Database Setup Script
# Solucion facil para PostgreSQL usando Docker Compose

param(
    [switch]$UseDocker = $true,
    [switch]$UseExistingPostgres = $false,
    [string]$PostgresPath = "C:\Program Files\PostgreSQL\15\bin"
)

Write-Host "DoxieGuard Database Setup" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

function Write-Success {
    param([string]$Message)
    Write-Host "SUCCESS: $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "INFO: $Message" -ForegroundColor Cyan
}

# Check if Docker is available
if ($UseDocker) {
    Write-Info "Checking Docker availability..."
    $dockerCheck = docker --version 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Docker found: $dockerCheck"
        
        Write-Info "Starting PostgreSQL using Docker Compose..."
        Set-Location (Join-Path $PSScriptRoot "..\infra")
        
        # Stop any existing container
        docker-compose down 2>&1 | Out-Null
        
        # Start PostgreSQL container
        $composeResult = docker-compose up -d
        if ($LASTEXITCODE -eq 0) {
            Write-Success "PostgreSQL container started successfully"
            
            # Wait for PostgreSQL to be ready
            Write-Info "Waiting for PostgreSQL to be ready..."
            Start-Sleep -Seconds 10
            
            # Test connection
            $testQuery = docker exec doxie_db psql -U doxieroot -d doxiedb -c "SELECT version();" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "PostgreSQL is ready!"
                Write-Host ""
                Write-Host "Connection Details:" -ForegroundColor Yellow
                Write-Host "   Host: localhost"
                Write-Host "   Port: 5432"
                Write-Host "   Database: doxiedb"
                Write-Host "   Username: doxieroot"
                Write-Host "   Password: doxiepassword123"
                Write-Host ""
                
                # Update .env file
                Write-Info "Updating Backend/.env with database credentials..."
                $envPath = Join-Path $PSScriptRoot "Backend\.env"
                
                if (Test-Path $envPath) {
                    $envContent = Get-Content $envPath -Raw
                    $envContent = $envContent -replace 'DATABASE_URL=.*', 'DATABASE_URL="postgresql://doxieroot:doxiepassword123@localhost:5432/doxiedb?schema=public"'
                    Set-Content -Path $envPath -Value $envContent -NoNewline
                    Write-Success ".env updated successfully"
                }
                
                Write-Host ""
                Write-Host "Database setup complete! Next steps:" -ForegroundColor Green
                Write-Host "1. cd Backend"
                Write-Host "2. npx prisma migrate deploy"
                Write-Host "3. npm run dev"
                Write-Host ""
                
            } else {
                Write-Error "PostgreSQL connection failed"
                Write-Host "Error: $testQuery"
            }
        } else {
            Write-Error "Docker Compose failed: $composeResult"
        }
        
    } else {
        Write-Error "Docker not found. Please install Docker Desktop."
        Write-Host "Download: https://www.docker.com/products/docker-desktop"
        Write-Host ""
        Write-Host "Alternative: Install PostgreSQL and add to PATH" -ForegroundColor Yellow
    }
    
} elseif ($UseExistingPostgres) {
    # Use existing PostgreSQL installation
    Write-Info "Attempting to use existing PostgreSQL installation..."
    
    # Try to find psql
    $psqlPath = Join-Path $PostgresPath "psql.exe"
    
    if (-not (Test-Path $psqlPath)) {
        Write-Info "psql not found at $psqlPath"
        Write-Info "Searching for PostgreSQL installation..."
        
        $possiblePaths = @(
            "C:\Program Files\PostgreSQL\16\bin",
            "C:\Program Files\PostgreSQL\15\bin",
            "C:\Program Files\PostgreSQL\14\bin",
            "C:\Program Files (x86)\PostgreSQL\15\bin"
        )
        
        foreach ($path in $possiblePaths) {
            $testPath = Join-Path $path "psql.exe"
            if (Test-Path $testPath) {
                $psqlPath = $testPath
                Write-Success "Found PostgreSQL at: $path"
                break
            }
        }
    }
    
    if (Test-Path $psqlPath) {
        Write-Success "Using psql from: $psqlPath"
        
        Write-Info "Creating database..."
        $createResult = & $psqlPath -U postgres -c "CREATE DATABASE doxieguard;" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Database 'doxieguard' created"
        } elseif ($createResult -match "already exists") {
            Write-Info "Database already exists"
        } else {
            Write-Error "Failed to create database: $createResult"
        }
        
        Write-Info "Creating user..."
        $userResult = & $psqlPath -U postgres -c "CREATE USER doxieguard WITH PASSWORD 'doxiepassword123';" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "User 'doxieguard' created"
        } elseif ($userResult -match "already exists") {
            Write-Info "User already exists"
        }
        
        Write-Info "Granting privileges..."
        & $psqlPath -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE doxieguard TO doxieguard;" | Out-Null
        & $psqlPath -U postgres -d doxieguard -c "GRANT ALL ON SCHEMA public TO doxieguard;" | Out-Null
        
        Write-Success "Database setup complete!"
        
        Write-Host ""
        Write-Host "Connection Details:" -ForegroundColor Yellow
        Write-Host "   Host: localhost"
        Write-Host "   Port: 5432"
        Write-Host "   Database: doxieguard"
        Write-Host "   Username: doxieguard"
        Write-Host "   Password: doxiepassword123"
        Write-Host ""
        
        # Update .env file
        Write-Info "Updating Backend/.env..."
        $envPath = Join-Path $PSScriptRoot "Backend\.env"
        
        if (Test-Path $envPath) {
            $envContent = Get-Content $envPath -Raw
            $envContent = $envContent -replace 'DATABASE_URL=.*', 'DATABASE_URL="postgresql://doxieguard:doxiepassword123@localhost:5432/doxieguard?schema=public"'
            Set-Content -Path $envPath -Value $envContent -NoNewline
            Write-Success ".env updated"
        }
        
    } else {
        Write-Error "PostgreSQL installation not found"
        Write-Host ""
        Write-Host "Solutions:" -ForegroundColor Yellow
        Write-Host "1. Use Docker: .setup-database.ps1 -UseDocker"
        Write-Host "2. Install PostgreSQL: https://www.postgresql.org/download/windows/"
        Write-Host "3. Add PostgreSQL bin to PATH and restart terminal"
    }
}

Write-Host ""
