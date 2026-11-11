import http.client, subprocess, os, json, time, random, shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
port=33000+random.randint(0,3000)
env={**os.environ,'PORT':str(port),'ADMIN_PASSWORD':'test-password-random-long-20chars','NODE_ENV':'development'}
p=subprocess.Popen(['node','server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)

def call(path,method='GET',data=None,token=None):
    conn=http.client.HTTPConnection('127.0.0.1',port,timeout=10)
    headers={}
    if data is not None:
        headers['Content-Type']='application/json'
    if token:
        headers['Authorization']='Bearer '+token
    conn.request(method,path,body=json.dumps(data) if data is not None else None,headers=headers)
    r=conn.getresponse();data=r.read();conn.close()
    return r.status,json.loads(data)
try:
    for attempt in range(50):
        try:
            status,health=call('/api/health');break
        except (ConnectionRefusedError,ConnectionResetError,TimeoutError):time.sleep(.1)
    assert status==200
    status,login=call('/api/admin/login','POST',{'password':'test-password-random-long-20chars'});assert status==200,login
    admin=login['token']
    status,r=call('/api/admin/rooms','POST',{'name':'Integración 20 jugadores'},admin); assert status==201,r
    code=r['code']
    joined=[]
    for i in range(20):
        status,result=call('/api/join','POST',{'room':code,'name':f'Jugador {i+1}'})
        assert status==201,(status,result)
        joined.append(result)
    status,out=call('/api/join','POST',{'room':code,'name':'Jugador 21'})
    assert status==400 and '20' in out['error'],(status,out)
    status,out=call('/api/join','POST',{'room':code,'name':'Jugador 1'})
    assert status==400,(status,out)
    status,public=call('/api/room/'+code)
    assert status==200 and public['playerCount']==20 and 'players' not in public
    status,admin_room=call('/api/room/'+code,token=admin)
    assert status==200 and len(admin_room['players'])==20
    status,denied=call('/api/room/'+code+'/draw','POST',{},joined[0]['token'])
    assert status==401,denied
    status,started=call('/api/room/'+code+'/start','POST',{},admin);assert status==200,started
    status,draw=call('/api/room/'+code+'/draw','POST',{},admin);assert status==200,draw
    chosen=draw['id']
    status,before=call('/api/room/'+code);assert before['current']['id'] is None and before['draws']==[]
    player=next((j for j in joined if chosen in sum(call('/api/room/'+code,token=j['token'])[1]['me']['card'].values(),[])),None)
    if player:
        status,fail=call('/api/room/'+code+'/mark','POST',{'id':chosen,'marked':True},player['token'])
        assert status==400,(status,fail)
    status,rev=call('/api/room/'+code+'/reveal','POST',{},admin);assert status==200,rev
    status,public=call('/api/room/'+code)
    assert public['draws'][0]['id']==chosen
    if player:
        status,mark=call('/api/room/'+code+'/mark','POST',{'id':chosen,'marked':True},player['token'])
        assert status==200,(status,mark)
    status,again=call('/api/room/'+code+'/draw','POST',{},admin)
    assert status==200 and again['id']!=chosen,(status,again)
    print('INTEGRACIÓN REAL APROBADA: admin, 20 ingresos, 21 rechazado, duplicado rechazado, permisos, secuencia oculta/revelada, marcas válidas, sorteos únicos.')
finally:
    p.terminate()
    try:p.communicate(timeout=3)
    except subprocess.TimeoutExpired:p.kill();p.communicate()
    shutil.rmtree(root/'data',ignore_errors=True)
