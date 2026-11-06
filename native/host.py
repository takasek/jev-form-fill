#!/usr/bin/env python3
"""Chrome native messaging host for explicitly registered 1Password fields."""
import json
import os
import re
import unicodedata
from pathlib import Path
import struct
import subprocess
import sys


BUILTIN_ROLES = {'firstname': 'given-name', 'lastname': 'family-name', 'company': 'organization',
                 'address': 'street-address', 'defphone': 'tel', 'homephone': 'tel',
                 'cellphone': 'tel', 'busphone': 'tel', 'email': 'email'}
LABEL_ROLES = {
    '氏名': 'name', '氏名姓名': 'name', '氏名名姓': 'name', 'fullname': 'name', '氏名カナ': 'name-kana', 'フリガナ': 'name-kana',
    '姓': 'family-name', '名': 'given-name', 'セイ': 'family-kana', 'メイ': 'given-kana',
    '姓カナ': 'family-kana', '名カナ': 'given-kana', '姓ふりがな': 'family-kana', '名ふりがな': 'given-kana',
    '郵便番号': 'postal-code', 'zipcode': 'postal-code', 'postalcode': 'postal-code',
    '都道府県': 'address-level1', '市区町村': 'address-level2', '番地': 'parcel', '地番': 'parcel',
    '建物名': 'address-line2', '住所': 'street-address', 'メールアドレス': 'email',
    'address': 'street-address', '住所1': 'address-line1', '住所2': 'address-line2',
    'ふりがな': 'name-kana', '氏名フリガナ': 'name-kana', '氏名ふりがな': 'name-kana',
    '姓フリガナ': 'family-kana', '名フリガナ': 'given-kana',
    'firstname': 'given-name', 'lastname': 'family-name', 'メール': 'email',
    'phone': 'tel', 'phonenumber': 'tel', 'email': 'email', '電話番号': 'tel', '携帯電話': 'tel', '会社名': 'organization'
}


def profile_fields(item):
    if item.get('category') != 'IDENTITY':
        return []
    sources = []
    for field in item.get('fields', []):
        label, value = field.get('label', ''), field.get('value')
        kind = field.get('type')
        if (field.get('purpose') or kind not in {'STRING', 'EMAIL', 'ADDRESS', 'PHONE'}
                or not isinstance(value, str) or not value.strip() or len(value) > 4096):
            continue
        key = re.sub(r'[\s_()（）-]', '', unicodedata.normalize('NFKC', label).lower())
        base_key = re.sub(r'^(?:仕事用|勤務先|職場|自宅|work|business|home)(?:の)?', '', key)
        role = BUILTIN_ROLES.get(field['id']) or LABEL_ROLES.get(key) or LABEL_ROLES.get(base_key)
        if not role:
            role = {'EMAIL': 'email', 'ADDRESS': 'street-address', 'PHONE': 'tel'}.get(kind)
        if not role:
            continue
        scope = ''
        if field['id'] == 'busphone' or re.search(r'仕事用|勤務先|職場|会社|work|business', label, re.I):
            scope = 'work'
        elif field['id'] == 'homephone' or re.search(r'自宅|home', label, re.I):
            scope = 'home'
        elif field['id'] == 'cellphone' or re.search(r'携帯|mobile|cell', label, re.I):
            scope = 'mobile'
        sources.append({'role': role, 'label': label, 'scope': scope, 'value': value})
        if role == 'street-address':
            codes = re.findall(r'〒\s*([0-9０-９]{3}[-－][0-9０-９]{4})(?!\d)', value)
            if len(codes) == 1:
                sources.append({'role': 'postal-code', 'label': label + ' (〒)', 'scope': scope, 'value': codes[0]})
    return sources


def handle(request, config, read, read_item=None):
    if not isinstance(request, dict):
        return {'error': 'unknown-field'}
    if 'profile' in config or 'profiles' in config:
        if request == {'op': 'list'}:
            if 'profiles' in config:
                return {'profiles': [{'id': key, 'label': value['label']} for key, value in config['profiles'].items()]}
            return {'profile': True}
        if 'profiles' in config:
            if (set(request) != {'op', 'id'} or request['op'] != 'profile'
                    or not isinstance(request.get('id'), str) or request['id'] not in config['profiles']):
                return {'error': 'unknown-field'}
            registered = config['profiles'][request['id']]
        else:
            if request != {'op': 'profile'}:
                return {'error': 'unknown-field'}
            registered = config['profile']
        fields = profile_fields(read_item(registered['vault'], registered['item']))
        if len(json.dumps(fields, ensure_ascii=False).encode('utf-8')) > 800_000:
            return {'error': 'profile-too-large'}
        return {'fields': fields}
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


def run_op(op, *args):
    env = {k: v for k, v in os.environ.items() if not k.startswith('OP_')}
    result = subprocess.run([op, *args], stdin=subprocess.DEVNULL,
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
        op = config['op']
        reply = handle(request, config, lambda ref: run_op(op, 'read', '--no-newline', ref),
                       lambda vault, item: json.loads(run_op(op, 'item', 'get', item, '--vault=' + vault, '--format=json')))
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
