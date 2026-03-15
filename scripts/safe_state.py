#!/usr/bin/env python3
"""
Safe JSON state file handler with file locking.
Prevents race conditions when multiple scripts access the same state file.
"""
import json
import fcntl
import os
import time
from pathlib import Path

class StateFile:
    """Handles reading/writing state file with file locking"""
    
    def __init__(self, filepath, max_retries=3, retry_delay=0.5):
        self.filepath = Path(filepath)
        self.max_retries = max_retries
        self.retry_delay = retry_delay
    
    def load(self, default=None):
        """Load JSON with file locking and retry on failure"""
        if default is None:
            default = {}
        
        for attempt in range(self.max_retries):
            try:
                with open(self.filepath, 'r') as f:
                    fcntl.flock(f.fileno(), fcntl.LOCK_SH)  # Shared lock for reading
                    try:
                        data = json.load(f)
                        return data
                    finally:
                        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            except json.JSONDecodeError as e:
                # File might be corrupted due to concurrent write
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                    continue
                else:
                    print(f"[WARN] JSON corrupted, returning default: {e}")
                    return default
            except FileNotFoundError:
                return default
        return default
    
    def save(self, data):
        """Save JSON with file locking (atomic write)"""
        # Write to temp file first, then rename (atomic)
        temp_path = self.filepath.with_suffix('.tmp')
        
        for attempt in range(self.max_retries):
            try:
                with open(temp_path, 'w') as f:
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX)  # Exclusive lock for writing
                    try:
                        json.dump(data, f, indent=2)
                        f.flush()
                        os.fsync(f.fileno())
                    finally:
                        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                
                # Atomic rename
                os.replace(temp_path, self.filepath)
                return True
            except Exception as e:
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                    continue
                else:
                    print(f"[ERROR] Failed to save state: {e}")
                    return False
        return False


# Convenience functions for lurker_state.json
def load_state(state_file='lurker_state.json'):
    """Load state with safe file handling"""
    handler = StateFile(state_file)
    return handler.load(default={'schema': 'lurker', 'meta': {}, 'tokens': {}})

def save_state(data, state_file='lurker_state.json'):
    """Save state with safe file handling"""
    handler = StateFile(state_file)
    return handler.save(data)


if __name__ == '__main__':
    # Test
    print("Testing safe state file handler...")
    
    # Test loading
    state = load_state()
    print(f"Loaded state with keys: {list(state.keys())}")
    
    # Test saving
    state['test'] = {'timestamp': time.time()}
    save_state(state)
    print("Saved state successfully")