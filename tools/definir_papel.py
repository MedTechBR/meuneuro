#!/usr/bin/env python3
"""Dá ou tira um papel (medico, atendente, admin) de uma conta do RefilMed, sem precisar das funções.

Usa as credenciais padrão do Google deste computador (Application Default Credentials) — nenhuma
senha ou chave fica no código. Uso:
    python3 tools/definir_papel.py email@exemplo.com medico
    python3 tools/definir_papel.py email@exemplo.com admin
    python3 tools/definir_papel.py email@exemplo.com medico --tirar
    python3 tools/definir_papel.py --listar
"""
import sys, json, datetime
import google.auth
from google.auth.transport.requests import AuthorizedSession

PROJETO = 'refilmed'
cred, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
s = AuthorizedSession(cred)
H = {'x-goog-user-project': PROJETO}
IDT = f'https://identitytoolkit.googleapis.com/v1/projects/{PROJETO}'

def conta_por_email(email):
    r = s.post(f'{IDT}/accounts:lookup', json={'email': [email]}, headers=H)
    r.raise_for_status()
    u = (r.json().get('users') or [None])[0]
    if not u: sys.exit(f'Nenhuma conta com o e-mail {email}. A pessoa precisa criar a conta pelo site primeiro.')
    return u

def listar():
    r = s.get(f'{IDT}/accounts:batchGet', params={'maxResults': 200}, headers=H)
    r.raise_for_status()
    for u in r.json().get('users', []):
        if not u.get('email'): continue
        print(u['email'].ljust(40), u.get('customAttributes', '{}'))

def main():
    if '--listar' in sys.argv: return listar()
    if len(sys.argv) < 3: sys.exit(__doc__)
    email, papel = sys.argv[1].lower(), sys.argv[2]
    if papel not in ('medico', 'atendente', 'admin'): sys.exit('Papel deve ser medico, atendente ou admin.')
    ativo = '--tirar' not in sys.argv
    u = conta_por_email(email)
    claims = json.loads(u.get('customAttributes') or '{}')
    claims[papel] = ativo
    r = s.post(f'{IDT}/accounts:update', json={'localId': u['localId'], 'customAttributes': json.dumps(claims)}, headers=H)
    r.raise_for_status()
    if papel == 'medico':
        agora = datetime.datetime.utcnow().isoformat() + 'Z'
        doc = f'https://firestore.googleapis.com/v1/projects/{PROJETO}/databases/(default)/documents/medicos/{u["localId"]}'
        s.patch(doc, params={'updateMask.fieldPaths': ['aprovado', 'aprovadoEm']},
                json={'fields': {'aprovado': {'booleanValue': ativo}, 'aprovadoEm': {'stringValue': agora}}}, headers=H).raise_for_status()
    print(f'{email}: {papel} = {ativo}. Permissões agora: {claims}. A pessoa precisa sair e entrar de novo no site.')

main()
