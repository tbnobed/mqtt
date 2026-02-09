#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; exit 1; }

install_docker() {
  log "Docker not found. Installing Docker on Ubuntu..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  log "Docker installed successfully."
  warn "You were added to the docker group. If docker commands fail with permission errors,"
  warn "log out and back in, then re-run this script."
}

check_deps() {
  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker is not installed."
    read -p "Install Docker now? (y/n): " install_choice
    if [ "$install_choice" = "y" ] || [ "$install_choice" = "Y" ]; then
      install_docker
    else
      err "Docker is required. Install it manually: https://docs.docker.com/engine/install/ubuntu/"
    fi
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    err "docker compose is required but not installed."
  fi
}

setup_env() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      warn "Created .env from .env.example — edit it with your production values before continuing."
      warn "At minimum, change POSTGRES_PASSWORD and SESSION_SECRET."
      read -p "Press Enter after editing .env, or Ctrl+C to abort..."
    else
      err ".env.example not found. Create a .env file manually."
    fi
  fi
  log "Loading .env file..."
  set -a; source .env; set +a
}

ACTION="${1:-deploy}"

case "$ACTION" in
  deploy)
    log "Starting deployment..."
    check_deps
    setup_env

    log "Building Docker images..."
    $COMPOSE build --no-cache

    log "Starting services..."
    $COMPOSE up -d

    log "Waiting for services to start..."
    sleep 5

    if $COMPOSE ps | grep -q "Up"; then
      log "Deployment successful!"
      log "App is running at http://$(hostname -I | awk '{print $1}'):${PORT:-5000}"
      log ""
      log "Useful commands:"
      log "  View logs:      $COMPOSE logs -f"
      log "  View app logs:  $COMPOSE logs -f app"
      log "  Stop:           $COMPOSE down"
      log "  Restart:        $COMPOSE restart"
      log "  Rebuild:        ./deploy.sh deploy"
    else
      err "Some services failed to start. Check logs with: $COMPOSE logs"
    fi
    ;;

  stop)
    check_deps
    log "Stopping services..."
    $COMPOSE down
    log "Services stopped."
    ;;

  restart)
    check_deps
    log "Restarting services..."
    $COMPOSE restart
    log "Services restarted."
    ;;

  logs)
    check_deps
    $COMPOSE logs -f "${2:-}"
    ;;

  status)
    check_deps
    $COMPOSE ps
    ;;

  update)
    log "Pulling latest code and redeploying..."
    check_deps
    setup_env
    git pull origin main 2>/dev/null || warn "Git pull failed or not a git repo — using local files."
    $COMPOSE build --no-cache
    $COMPOSE up -d
    log "Update complete!"
    ;;

  db-backup)
    check_deps
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    log "Backing up database to $BACKUP_FILE..."
    $COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-boattracker}" "${POSTGRES_DB:-boattracker}" > "$BACKUP_FILE"
    log "Backup saved to $BACKUP_FILE"
    ;;

  db-restore)
    check_deps
    RESTORE_FILE="${2:-}"
    if [ -z "$RESTORE_FILE" ]; then
      err "Usage: ./deploy.sh db-restore <backup_file.sql>"
    fi
    if [ ! -f "$RESTORE_FILE" ]; then
      err "Backup file not found: $RESTORE_FILE"
    fi
    warn "This will overwrite the current database. Are you sure?"
    read -p "Type 'yes' to confirm: " confirm
    if [ "$confirm" = "yes" ]; then
      log "Restoring database from $RESTORE_FILE..."
      $COMPOSE exec -T db psql -U "${POSTGRES_USER:-boattracker}" "${POSTGRES_DB:-boattracker}" < "$RESTORE_FILE"
      log "Database restored."
    else
      log "Restore cancelled."
    fi
    ;;

  *)
    echo "Usage: ./deploy.sh {deploy|stop|restart|logs|status|update|db-backup|db-restore}"
    echo ""
    echo "Commands:"
    echo "  deploy      Build and start all services"
    echo "  stop        Stop all services"
    echo "  restart     Restart all services"
    echo "  logs        View live logs (optionally: ./deploy.sh logs app)"
    echo "  status      Show service status"
    echo "  update      Pull latest code and redeploy"
    echo "  db-backup   Backup the database to a SQL file"
    echo "  db-restore  Restore database from a backup file"
    exit 1
    ;;
esac
