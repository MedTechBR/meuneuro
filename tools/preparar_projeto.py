#!/usr/bin/env python3
"""Liga as APIs que as funções usam e cria o bucket padrão do Storage no projeto refilmed.
Usa as credenciais padrão do Google da máquina. Só funciona depois de o plano Blaze estar ativo."""
import json, sys, urllib.request, urllib.error
import google.auth, google.auth.transport.requests as gr
PROJ = 'refilmed'
APIS = ['cloudfunctions', 'cloudbuild', 'artifactregistry', 'run', 'eventarc', 'pubsub', 'secretmanager', 'aiplatform', 'storage', 'firebasestorage', 'firestore', 'iamcredentials']
cred, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
cred.refresh(gr.Request())
def chama(url, corpo=None):
    q = urllib.request.Request(url, data=json.dumps(corpo).encode() if corpo is not None else None, method='POST' if corpo is not None else 'GET', headers={'Authorization': 'Bearer ' + cred.token, 'x-goog-user-project': PROJ, 'Content-Type': 'application/json'})
    try: return urllib.request.urlopen(q).status, ''
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:400]
st, txt = chama(f'https://serviceusage.googleapis.com/v1/projects/{PROJ}/services:batchEnable', {'serviceIds': [a + '.googleapis.com' for a in APIS]})
print('APIs:', st, txt)
if st >= 400:
    if 'billing' in txt.lower(): sys.exit('O plano Blaze ainda não está ativo no projeto refilmed.')
    sys.exit(1)
st, txt = chama(f'https://firebasestorage.googleapis.com/v1alpha/projects/{PROJ}/defaultBucket', {'location': 'southamerica-east1', 'storageClass': 'REGIONAL'})
print('Bucket do Storage:', st, 'já existia' if st == 409 else txt)
