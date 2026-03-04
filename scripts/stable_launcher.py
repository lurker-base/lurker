#!/usr/bin/env python3
"""
LURKER Stable Launcher
Wraps all LURKER scripts and keeps them running forever
Automatically restarts if they crash
"""
import subprocess
import time
import signal
import sys
from pathlib import Path
import os

SCRIPTS_DIR = Path("/data/.openclaw/workspace/lurker-project/scripts")
LOG_DIR = Path("/data/.openclaw/workspace/lurker-project/logs")

SCRIPTS = [
    {
        "name": "token_importer",
        "script": "token_importer.py",
        "interval": 120  # seconds
    },
    {
        "name": "lifecycle_core",
        "script": "lifecycle_core.py",
        "interval": 180
    },
    {
        "name": "cleanup_tokens",
        "script": "cleanup_tokens.py",
        "interval": 600
    },
    {
        "name": "scanner_cio_ultra",
        "script": "scanner_cio_ultra.py",
        "interval": 300
    },
    {
        "name": "premium_tracker",
        "script": "premium_tracker.py",
        "interval": 300  # 5 min scan
    }
]

processes = {}

def log(name, msg):
    """Log to file and stdout"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_file = LOG_DIR / f"stable_launcher.log"
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(log_file, 'a') as f:
        f.write(f"[{timestamp}] {name}: {msg}\n")
    print(f"[{timestamp}] {name}: {msg}")

def start_script(script_config):
    """Start a script and return process"""
    name = script_config["name"]
    script = script_config["script"]
    
    log_file = LOG_DIR / f"{name}.log"
    err_file = LOG_DIR / f"{name}_error.log"
    
    cmd = ["python3", str(SCRIPTS_DIR / script)]
    
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=open(log_file, 'a'),
            stderr=open(err_file, 'a'),
            cwd=str(SCRIPTS_DIR.parent),
            preexec_fn=os.setsid
        )
        log(name, f"Started PID {proc.pid}")
        return proc
    except Exception as e:
        log(name, f"Failed to start: {e}")
        return None

def run():
    """Main loop - manage all scripts"""
    log("LAUNCHER", "=" * 60)
    log("LAUNCHER", "LURKER Stable Launcher Starting")
    log("LAUNCHER", "=" * 60)
    
    # Start all scripts
    for script_config in SCRIPTS:
        name = script_config["name"]
        proc = start_script(script_config)
        if proc:
            processes[name] = {
                "proc": proc,
                "config": script_config,
                "last_start": time.time()
            }
    
    # Main loop
    while True:
        time.sleep(30)  # Check every 30 seconds
        
        for name, info in list(processes.items()):
            proc = info["proc"]
            config = info["config"]
            
            # Check if process is still running
            if proc.poll() is not None:
                # Process died - restart it
                log(name, f"Process died (exit code {proc.returncode}), restarting...")
                
                # Wait a bit before restart
                time.sleep(5)
                
                new_proc = start_script(config)
                if new_proc:
                    processes[name]["proc"] = new_proc
                    processes[name]["last_start"] = time.time()
                else:
                    log(name, "Failed to restart!")
            else:
                # Check if it's time to restart (for recurring scripts)
                elapsed = time.time() - info["last_start"]
                if elapsed > config["interval"] * 2:
                    # Script running too long - restart it
                    log(name, f"Running too long ({elapsed:.0f}s), restarting...")
                    proc.terminate()
                    time.sleep(2)
                    if proc.poll() is None:
                        proc.kill()
                    
                    new_proc = start_script(config)
                    if new_proc:
                        processes[name]["proc"] = new_proc
                        processes[name]["last_start"] = time.time()

def signal_handler(sig, frame):
    log("LAUNCHER", "Received signal, shutting down...")
    for name, info in processes.items():
        log(name, "Terminating...")
        info["proc"].terminate()
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    run()
