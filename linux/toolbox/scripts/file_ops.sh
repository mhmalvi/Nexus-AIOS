#!/bin/bash
# Nexus Toolbox - File Operations
# Safe, auditable file management scripts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${NEXUS_DATA:-/var/lib/nexus}/logs/toolbox.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Safely list directory contents
list_dir() {
    local path="$1"
    local max_depth="${2:-1}"
    
    # Security: Prevent path traversal
    if [[ "$path" == *".."* ]]; then
        echo "ERROR: Path traversal not allowed"
        return 1
    fi
    
    log "list_dir: $path (depth: $max_depth)"
    find "$path" -maxdepth "$max_depth" -type f -o -type d 2>/dev/null | head -100
}

# Safely read file with size limit
read_file() {
    local path="$1"
    local max_size="${2:-1048576}"  # 1MB default
    
    if [[ "$path" == *".."* ]]; then
        echo "ERROR: Path traversal not allowed"
        return 1
    fi
    
    if [[ ! -f "$path" ]]; then
        echo "ERROR: File not found: $path"
        return 1
    fi
    
    local size=$(stat -c%s "$path" 2>/dev/null || stat -f%z "$path" 2>/dev/null)
    if (( size > max_size )); then
        echo "ERROR: File too large ($size bytes > $max_size limit)"
        return 1
    fi
    
    log "read_file: $path ($size bytes)"
    cat "$path"
}

# Safely write file (creates backup)
write_file() {
    local path="$1"
    local content="$2"
    
    if [[ "$path" == *".."* ]]; then
        echo "ERROR: Path traversal not allowed"
        return 1
    fi
    
    # Create backup if file exists
    if [[ -f "$path" ]]; then
        cp "$path" "${path}.bak"
        log "write_file: backup created ${path}.bak"
    fi
    
    # Ensure directory exists
    mkdir -p "$(dirname "$path")"
    
    echo "$content" > "$path"
    log "write_file: $path (${#content} chars)"
    echo "OK"
}

# Safely delete file (moves to trash)
delete_file() {
    local path="$1"
    local trash_dir="${NEXUS_DATA:-/var/lib/nexus}/trash"
    
    if [[ "$path" == *".."* ]]; then
        echo "ERROR: Path traversal not allowed"
        return 1
    fi
    
    if [[ ! -e "$path" ]]; then
        echo "ERROR: Path not found: $path"
        return 1
    fi
    
    mkdir -p "$trash_dir"
    local basename=$(basename "$path")
    local timestamp=$(date +%s)
    
    mv "$path" "$trash_dir/${basename}.${timestamp}"
    log "delete_file: $path -> trash"
    echo "OK: Moved to trash"
}

# Main dispatcher
case "${1:-help}" in
    list)
        list_dir "${2:-/tmp}" "${3:-1}"
        ;;
    read)
        read_file "$2" "${3:-1048576}"
        ;;
    write)
        write_file "$2" "$3"
        ;;
    delete)
        delete_file "$2"
        ;;
    help|*)
        echo "Nexus Toolbox - File Operations"
        echo "Usage: $0 {list|read|write|delete} [args...]"
        echo ""
        echo "Commands:"
        echo "  list <path> [depth]       List directory contents"
        echo "  read <path> [max_size]    Read file contents"
        echo "  write <path> <content>    Write to file (creates backup)"
        echo "  delete <path>             Move file to trash"
        ;;
esac
