#!/usr/bin/env python3
"""Chrome native messaging host for explicitly registered 1Password fields."""
import json
import os
from pathlib import Path
import struct
import subprocess
import sys


def handle(request, config, read):
    fields = config['fields']
    if request == {'op': 'list'}:
        return {'fields': [{'id': key, 'label': field['label']} for key, field in fields.items()]}
    if (not isinstance(request, dict) or set(request) != {'op', 'id'}
            or request['op'] != 'read' or not isinstance(request['id'], str)
            or request['id'] not in fields):
        return {'error': 'unknown-field'}
    value = read(fields[request['id']]['ref'])
    if not value or len(value.encode('utf-8')) > 65536:
        return {'error': 'invalid-value'}
    return {'value': value}


def read_field(op, ref):
    env = {k: v for k, v in os.environ.items() if not k.startswith('OP_')}
    result = subprocess.run([op, 'read', '--no-newline', ref], stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=180, check=True, env=env)
    return result.stdout.decode('utf-8')


def main():
    try:
        config = json.loads(Path(__file__).with_name('fields.json').read_text(encoding='utf-8'))
        if sys.argv[1:2] != [config['origin']]:
            raise ValueError('origin')
        length, = struct.unpack('=I', sys.stdin.buffer.read(4))
        if length > 1024:
            raise ValueError('message')
        request = json.loads(sys.stdin.buffer.read(length))
        reply = handle(request, config, lambda ref: read_field(config['op'], ref))
    except subprocess.TimeoutExpired:
        reply = {'error': 'timeout'}
    except subprocess.CalledProcessError as error:
        # Never forward CLI diagnostics; they may contain the reference or account details.
        message = (error.stderr or b'').lower()
        if b'authoriz' in message or b'biometric' in message or b'cancel' in message:
            reply = {'error': 'authorization'}
        else:
            reply = {'error': 'cli-error'}
    except (OSError, ValueError, KeyError, struct.error):
        reply = {'error': 'unavailable'}
    data = json.dumps(reply, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(data)) + data)


if __name__ == '__main__':
    main()
