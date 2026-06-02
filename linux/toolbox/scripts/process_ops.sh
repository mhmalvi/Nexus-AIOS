#!/bin/bash
# Nexus Toolbox - Process Management
# Safe process monitoring and control scripts

set -euo pipefail

LOG_FILE="${NEXUS_DATA:-/var/lib/nexus}/logs/toolbox.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# List running processes (filtered)
list_processes() {
    local filter="${1:-}"
    
    log "list_processes: filter='$filter'"
    
    if [[ -n "$filter" ]]; then
        ps aux | grep -i "$filter" | grep -v grep | head -50
    else
        ps aux --sort=-%mem | head -20
    fi
}

# Get process details by PID
get_process() {
    local pid="$1"
    
    if ! [[ "$pid" =~ ^[0-9]+$ ]]; then
        echo "ERROR: Invalid PID"
        return 1
    fi
    
    log "get_process: $pid"
    
    if [[ -d "/proc/$pid" ]]; then
        echo "PID: $pid"
        echo "Command: $(cat /proc/$pid/comm 2>/dev/null || echo 'N/A')"
        echo "Cmdline: $(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null || echo 'N/A')"
        echo "Status: $(grep -E '^(State|VmRSS|VmPeak|Threads)' /proc/$pid/status 2>/dev/null || echo 'N/A')"
    else
        echo "ERROR: Process not found"
        return 1
    fi
}

# Check system resource usage
system_stats() {
    log "system_stats"
    
    echo "=== CPU ==="
    grep -E '^(model name|cpu MHz|processor)' /proc/cpuinfo | head -10
    echo ""
    echo "Load Average: $(cat /proc/loadavg)"
    
    echo ""
    echo "=== Memory ==="
    free -h
    
    echo ""
    echo "=== Disk ==="
    df -h | grep -E '^/dev/'
    
    echo ""
    echo "=== Network ==="
    ip -brief addr 2>/dev/null || ifconfig 2>/dev/null | grep -E '^[a-z]|inet '
}

# Monitor a specific process
monitor_process() {
    local pid="$1"
    local duration="${2:-5}"
    
    if ! [[ "$pid" =~ ^[0-9]+$ ]]; then
        echo "ERROR: Invalid PID"
        return 1
    fi
    
    log "monitor_process: $pid for ${duration}s"
    
    for i in $(seq 1 "$duration"); do
        if [[ -d "/proc/$pid" ]]; then
            local mem=$(grep VmRSS /proc/$pid/status 2>/dev/null | awk '{print $2}')
            local cpu=$(ps -p "$pid" -o %cpu= 2>/dev/null)
            echo "t=${i}s: CPU=${cpu}%, Mem=${mem}kB"
        else
            echo "Process $pid terminated"
            break
        fi
        sleep 1
    done
}

# Main dispatcher
case "${1:-help}" in
    list)
        list_processes "${2:-}"
        ;;
    get)
        get_process "$2"
        ;;
    stats)
        system_stats
        ;;
    monitor)
        monitor_process "$2" "${3:-5}"
        ;;
    help|*)
        echo "Nexus Toolbox - Process Management"
        echo "Usage: $0 {list|get|stats|monitor} [args...]"
        echo ""
        echo "Commands:"
        echo "  list [filter]          List processes (optional filter)"
        echo "  get <pid>              Get process details"
        echo "  stats                  System resource overview"
        echo "  monitor <pid> [secs]   Monitor process for N seconds"
        ;;
esac
