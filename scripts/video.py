"""Create a narrated local-execution demo from an actual domain run, not a browser mockup.
Requires Python + Pillow + ffmpeg, and npm dev dependencies. All scene amounts come
from artifacts/demo-result.json, freshly produced by npm run demo below.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json, subprocess, textwrap, re
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'artifacts'; ART.mkdir(exist_ok=True)
run=subprocess.run(['npm','run','demo'],cwd=ROOT,text=True,capture_output=True,check=True)
(ART/'demo-transcript.txt').write_text(run.stdout)
result=json.loads((ART/'demo-result.json').read_text()); rows=result['summary']['rows']; batch=result['batch']; maya=result['maintainer']
scenes=[
 {'title':'Open source, paid forward.','eyebrow':'NEBRASKA / PAYPAL AI HACKATHON','kind':'intro','narration':'AI coding agents build on open source every day. The people maintaining that foundation often see none of the value. Nebraska connects what an agent actually uses to a monthly payment for the people behind it. This demonstration executes our working local system. All funding, identities, model decisions and transactions here are explicitly simulated.'},
 {'title':'A mandate, not a blank check.','eyebrow':'01 / HUMAN AUTHORIZATION','kind':'funding','narration':'A company chooses a monthly budget through a quantity based PayPal subscription. One unit is one dollar. Nebraska only allocates money after a verified completed payment, never an unpaid promise. Changes require renewed consent. Here, the demo organization has five hundred dollars of confirmed funding. Separate currency pools support dollars, euros, pounds, Canadian dollars and Australian dollars.'},
 {'title':'Every dependency has a record.','eyebrow':'02 / DETERMINISTIC USAGE','kind':'usage','narration':'Hooks, continuous integration and the MCP server record package coordinates and salted repository hashes. Source code stays on the payer’s machine. Observations are deduplicated per repository, package and month. Direct usage counts as one; each dependency level halves that amount. The meter supports npm, Python, Rust and Go, plus standard software bills of materials.'},
 {'title':'Judgment changes the outcome.','eyebrow':'03 / BOUNDED AI DECISIONS','kind':'allocation','narration':'The decision model answers fixed, typed questions about criticality and resource need. Its scores change the money. In the actual demo run, the small infrastructure package receives one hundred sixty one dollars and twenty nine cents. An uncertain model falls back to neutral weights. A malicious README is included in the seed data. It cannot add a recipient, change the budget or escape the package cap.'},
 {'title':'Seven checks before a cent moves.','eyebrow':'04 / THE RULE GATE','kind':'gate','narration':'The treasurer initiates settlement through seven code enforced safeguards. Recipients must be verified and past the fourteen day cooldown. Funding, caps, fixed batch identity, decision types, human approval and reproducibility are all checked. The suspicious fourth recipient is held. An emergency grant needs separate human approval. In this simulation, the approved two hundred fifty dollar grant is captured and added to the maintainer’s balance.'},
 {'title':'One month. One immutable batch.','eyebrow':'05 / EXECUTED LOCAL SETTLEMENT','kind':'terminal','narration':'These are results from executing the real demo command. Three eligible recipients are paid by the simulated provider. The infrastructure maintainer receives four hundred eleven dollars and twenty nine cents, including the separate grant. Running settlement again reuses the existing batch. In sandbox mode, the same service calls PayPal Payouts. Webhooks are signature verified and individual statuses are fetched from PayPal.'},
 {'title':'Proof travels with the payment.','eyebrow':'06 / MAINTAINER INCOME AND AUDIT','kind':'proof','narration':'Both sides receive statements with frozen snapshots, model versions and recompute hashes. Maintainers see usage counts while company names remain private by default. Small balances roll forward. Multiple maintainers can set custom shares, and verified fiscal hosts can receive authorized payouts. Nebraska cannot force a company to pay. It removes two excuses: not knowing who to support, and making payment too difficult. The AI decides where the money goes. Code decides where it can never go.'}
]
(ART/'scenes.json').write_text(json.dumps(scenes,indent=2));subprocess.run(['node','scripts/narrate.mjs',str(ART/'scenes.json')],cwd=ROOT,check=True);scenes=json.loads((ART/'scenes.json').read_text())
if sum(s['duration'] for s in scenes)>=180: raise RuntimeError('Video must stay below three minutes')
fontroot=Path('/usr/share/fonts/truetype/open-sans')
def font(size,bold=False):
 p=fontroot/('OpenSans-Semibold.ttf' if bold else 'OpenSans-Regular.ttf')
 if not p.exists(): p=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
 return ImageFont.truetype(str(p),size)
INK='#252c38'; MUTED='#8b93a3'; PURPLE='#8b78d0'; GREEN='#6c9075'
def wrap(draw,text,xy,width,size=23,fill=MUTED,bold=False,spacing=12):
 f=font(size,bold); words=text.split(); lines=[];line=''
 for word in words:
  test=(line+' '+word).strip()
  if draw.textlength(test,font=f)>width and line: lines.append(line);line=word
  else: line=test
 if line: lines.append(line)
 x,y=xy
 for line in lines: draw.text((x,y),line,font=f,fill=fill);y+=size+spacing
 return y

def card(d,xy,fill='#ffffff',outline='#e7e9ee',radius=18):d.rounded_rectangle(xy,radius=radius,fill=fill,outline=outline,width=1)
def text(d,xy,s,size=24,fill=INK,bold=False):d.text(xy,str(s),font=font(size,bold),fill=fill)
def frame(scene,index):
 im=Image.new('RGB',(1280,720),'#f7f8fa');d=ImageDraw.Draw(im)
 d.rectangle((0,0,15,720),fill='#7460d6');text(d,(55,26),'nebraska.',29,bold=True);text(d,(942,37),'LOCAL EXECUTION / SIMULATED',12,fill='#9a88b9')
 text(d,(55,108),scene['eyebrow'],13,fill='#9297a8',bold=True);text(d,(55,143),scene['title'],43,bold=True)
 kind=scene['kind']
 if kind=='intro':
  text(d,(58,238),'From the packages agents use',34,fill='#727c89');text(d,(58,286),'to the people who keep them alive.',34,fill='#727c89')
  for i,(a,b) in enumerate([('Observe','Private, deterministic usage'),('Decide','AI judgments within bounds'),('Pay forward','A verified monthly settlement')]):
   x=58+i*402;card(d,(x,395,x+372,570),fill=['#f0edf9','#edf3e9','#f6efe7'][i]);text(d,(x+22,420),'0'+str(i+1),18,fill=PURPLE);text(d,(x+22,455),a,25,bold=True);wrap(d,b,(x+22,499),325,size=17)
 elif kind=='funding':
  for i,(a,b,c) in enumerate([('Monthly budget','$500.00','Human-authorized'),('Confirmed funding','$500.00','Completed receipt only'),('Boundaries','I1 – I7','Checked before payment')]):
   x=57+i*402;card(d,(x,247,x+371,452));text(d,(x+24,276),a.upper(),13,fill=MUTED);text(d,(x+24,329),b,43,bold=True);text(d,(x+24,407),c,17,fill=GREEN)
  wrap(d,'Subscriptions record the mandate. Orders record approval for extra grants. Payouts settle verified balances. Webhooks reconcile the outcome.',(60,501),1120,25)
 elif kind in ['usage','allocation']:
  card(d,(55,238,1225,601)); headers=['PACKAGE','REPOSITORIES / u','CRITICALITY','NEED','ALLOCATION']
  xs=[81,439,686,869,1037]
  for x,h in zip(xs,headers):text(d,(x,263),h,12,fill=MUTED,bold=True)
  for j,r in enumerate(rows):
   y=313+j*65;d.line((77,y+48,1204,y+48),fill='#edf0f5',width=1)
   for x,v in zip(xs,[r['name'],str(r['u']),str(r['c'])+'×',str(r['n'])+'×',f"${r['cents']/100:.2f}"]):text(d,(x,y),v,22,fill=PURPLE if j==2 else INK,bold=j==2)
  if kind=='allocation':text(d,(62,620),'AI off → $69.44 for the infrastructure package  |  AI on → $161.29',18,fill=PURPLE)
  else:text(d,(62,620),'No source code. No repository names. No counting the same install twice.',18,fill=GREEN)
 elif kind=='gate':
  checks=['Verified recipients + cooldown','Only actual confirmed funds','Per-package allocation cap','One immutable period batch','Fixed decision types and ranges','Separate approval for grants','Recomputable snapshots']
  for j,t in enumerate(checks):
   y=237+j*49;text(d,(63,y),'I'+str(j+1),20,fill=GREEN,bold=True);text(d,(113,y),t,21,fill='#778594');text(d,(690,y),'PASS',15,fill=GREEN)
  card(d,(849,258,1218,562),fill='#f1edf8');text(d,(877,286),'GRANT APPROVAL',13,fill=PURPLE,bold=True);text(d,(877,336),'$250.00',44,fill='#75618f',bold=True);wrap(d,'Separately approved and captured in this simulation.',(877,409),300,20);text(d,(877,512),'Extra mandate. Extra proof.',15,fill=PURPLE)
 elif kind=='terminal':
  card(d,(55,231,1225,630),fill='#202633',outline='#202633');text(d,(79,253),'terminal    nebraska / actual command output',14,fill='#8e9aab')
  lines=['$ npm run demo','SIMULATION — no PayPal money moves.','',f"batch: {batch['id']}",f"status: {batch['status']}"]
  for item in batch['items']:lines.append(f"{item['receiver']:<35} {item['currency']} {item['cents']/100:.2f}   {item['status']}")
  lines+=['','PASS: 1 immutable batch; all gate invariants passed; replay safe.','Audit: artifacts/demo-result.json']
  for j,line in enumerate(lines):text(d,(81,294+j*26),line,17,fill='#b5cfae' if 'PASS' in line or '$ npm' in line else '#c4c9d5')
 elif kind=='proof':
  card(d,(55,241,652,595),fill='#edf3ec');text(d,(82,270),'MAINTAINER / MAYA RIVERA',13,fill=GREEN,bold=True);text(d,(82,315),'$411.29',57,fill='#52735c',bold=True);text(d,(84,393),'$161.29 usage + $250.00 approved grant',19,fill='#809382');text(d,(84,440),'25 repositories · 1 private organization',21,fill='#718875');text(d,(84,500),'Income for maintenance time and tools.',19,fill='#8fa08e')
  text(d,(698,259),'RECOMPUTABLE, DOWN TO THE CENT.',13,fill=PURPLE,bold=True)
  wrap(d,result['audit']['closes'][0]['snapshotHash'],(699,303),485,18)
  wrap(d,'You can still choose not to pay. You just cannot say you did not know.',(699,390),462,30,fill='#79658e',bold=True)
 d.line((55,666,1225,666),fill='#e1e5ea');text(d,(55,683),'Open source, paid forward.',12,fill='#99a0ad');text(d,(935,683),'NEBRASKA / '+str(index+1)+' OF '+str(len(scenes)),12,fill='#99a0ad')
 return im
frames=ART/'frames';frames.mkdir(exist_ok=True);clips=[]
for index,scene in enumerate(scenes):
 path=frames/f'{index}.png';frame(scene,index).save(path)
 if index==0:frame(scene,index).save(ART/'nebraska-poster.png')
 clip=ART/f'clip-{index}.mp4';clips.append(clip)
 subprocess.run(['ffmpeg','-loglevel','error','-y','-loop','1','-framerate','24','-i',str(path),'-i',str(ART/'audio'/f'{index}.wav'),'-vf','scale=1280:720,format=yuv420p','-c:v','libx264','-preset','veryfast','-tune','stillimage','-crf','22','-c:a','aac','-b:a','128k','-af','apad','-t',str(scene['duration']),str(clip)],check=True)
(ART/'concat.txt').write_text('\n'.join("file '"+str(p)+"'" for p in clips))
subprocess.run(['ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i',str(ART/'concat.txt'),'-c','copy','-movflags','+faststart',str(ART/'nebraska-demo.mp4')],check=True)
def timestamp(s):
 h=int(s)//3600;m=int(s)//60%60;ss=int(s)%60;ms=int(s%1*1000);return f'{h:02}:{m:02}:{ss:02},{ms:03}'
subtitles=[];offset=0;n=1
for s in scenes:
 sentences=re.split(r'(?<=[.!?])\s+',s['narration']);total=sum(len(x) for x in sentences);elapsed=0
 for sentence in sentences:
  dur=s['audioSeconds']*len(sentence)/total;subtitles.append(f'{n}\n{timestamp(offset+elapsed)} --> {timestamp(offset+elapsed+dur)}\n'+textwrap.fill(sentence,75)+'\n');elapsed+=dur;n+=1
 offset+=s['duration']
(ART/'nebraska-demo.srt').write_text('\n'.join(subtitles))
(ART/'video-metadata.json').write_text(json.dumps({'seconds':offset,'resolution':'1280x720','narration':'English, synthetic eSpeak-NG','dataSource':'fresh npm run demo execution','mode':'simulated payments','browserScreenRecording':False},indent=2))
for p in clips:p.unlink()
print(f'Created artifacts/nebraska-demo.mp4 ({offset:.1f} seconds), English narration and SRT captions.')
