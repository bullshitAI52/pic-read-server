"""Offline desktop entry point. No external server or OCR installation needed."""
import os
import sys
import socket
import threading
import time
import shutil
from pathlib import Path

root = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'Library' / 'Application Support')) / 'PicReadOffline'
root.mkdir(parents=True, exist_ok=True)
os.environ['NEWSPAPER_RUNTIME_DIR'] = str(root)
os.environ['PIC_READ_OFFLINE'] = '1'

import uvicorn
from newspaper_reader.app import app


def main():
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, host='127.0.0.1', port=port))
    worker = threading.Thread(target=server.run, kwargs={'sockets': [sock]}, daemon=True)
    worker.start()
    for _ in range(200):
        if server.started:
            break
        if not worker.is_alive():
            raise RuntimeError('Local service failed to start')
        time.sleep(.05)
    else:
        raise RuntimeError('Local service startup timed out')
    if '--smoke-test' in sys.argv:
        import urllib.request
        assert urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health').status == 200
        assert b'cropSave' in urllib.request.urlopen(f'http://127.0.0.1:{port}/').read()
        server.should_exit = True
        worker.join(10)
        return
    import webview

    class Bridge:
        def save_image(self, token):
            if not isinstance(token, str) or len(token) != 32 or any(c not in '0123456789abcdef' for c in token):
                return {'error': 'Invalid image'}
            source = root / 'shared_images' / (token + '.png')
            if not source.is_file():
                return {'error': 'Image not found'}
            dest = window.create_file_dialog(webview.FileDialog.SAVE, save_filename='cropped-hd.png', file_types=('PNG (*.png)',))
            if not dest:
                return {'cancelled': True}
            path = dest[0] if isinstance(dest, (list, tuple)) else dest
            shutil.copyfile(source, path)
            return {'saved': True}

    window = webview.create_window('高清图片裁剪 · 离线版', f'http://127.0.0.1:{port}/', js_api=Bridge(), width=1100, height=800)
    try:
        webview.start()
    finally:
        server.should_exit = True
        worker.join(10)
        sock.close()


if __name__ == '__main__':
    main()
