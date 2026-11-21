# Base de datos PostgreSQL propia del proyecto (desarrollo local).
# Uso: npm run db:start | db:stop | db:status
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')

$bin  = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path $env:LOCALAPPDATA 'emc-academy'
$data = Join-Path $root 'pgdata'
$log  = Join-Path $root 'postgres.log'
$port = 5433

switch ($Action) {
  'status' {
    & "$bin\pg_isready.exe" -h localhost -p $port
  }
  'start' {
    & "$bin\pg_isready.exe" -h localhost -p $port -q
    if ($LASTEXITCODE -eq 0) { "PostgreSQL ya está encendido (puerto $port)."; break }
    # Ventana oculta: evita que la consola quede enlazada al proceso del servidor.
    $p = Start-Process -FilePath "$bin\pg_ctl.exe" -WindowStyle Hidden -Wait -PassThru `
      -ArgumentList @('-D', "`"$data`"", '-o', "`"-p $port -c listen_addresses=localhost`"", '-l', "`"$log`"", '-w', 'start')
    if ($p.ExitCode -eq 0) { "PostgreSQL encendido (puerto $port)." } else { "No se pudo encender. Revisa $log"; exit 1 }
  }
  'stop' {
    & "$bin\pg_ctl.exe" -D $data stop
  }
}
