"""Build the reverse index once before starting the API; preserve the dictionary README."""
import os
from pathlib import Path

import jageocoder

if __name__ == '__main__':
    root = Path(os.environ.get('DATA_DIR', '/data'))
    jageocoder.init(db_dir=str(root / 'dictionary'), mode='a')
    print('Building/warming reverse-geocoding index...', flush=True)
    print(jageocoder.reverse(139.6917, 35.6896, level=7), flush=True)
    print('Reverse index ready', flush=True)
