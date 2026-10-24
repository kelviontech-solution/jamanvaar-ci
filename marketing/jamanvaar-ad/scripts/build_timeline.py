"""Generate editable HyperFrames scenes and FFmpeg audio mix from one manifest."""
import argparse,html,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--format',choices=['portrait','landscape'],default='portrait');args=parser.parse_args()
cfg=json.loads((ROOT/'config/video_config.json').read_text(encoding='utf-8'));portrait=args.format=='portrait';W,H=(1080,1920) if portrait else (1920,1080)

def run(cmd):subprocess.run(cmd,cwd=ROOT,check=True)
def esc(s):return html.escape(s,quote=True)
def lines(s):return ''.join('<span>'+esc(line)+'</span>' for line in s.splitlines())
def image(asset,cls,id):return f'<img id="{id}" class="{cls}" src="{asset}" alt="" data-layout-allow-overlap data-layout-allow-overflow/>'

# Audio is rendered once, shared by both aspect ratios. Source recordings are never overwritten.
voice=json.loads((ROOT/'output/voice-metadata.json').read_text())
mix=ROOT/'assets/voiceover/mix.wav'
cmd=['ffmpeg','-y','-v','error','-i','assets/music/bed.wav']
for v in voice:cmd+=['-i',v['file']]
filters=[]
for i,v in enumerate(voice,1):filters.append(f'[{i}:a]adelay={round(v["start"]*1000)}:all=1[v{i}]')
filters+=[''.join(f'[v{i}]' for i in range(1,len(voice)+1))+f'amix=inputs={len(voice)}:normalize=0,apad,atrim=0:50,asplit=2[voice][side]',
          '[0:a]volume=0.6[bed]',
          '[bed][side]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=260[ducked]',
          '[voice][ducked]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=8,afade=t=out:st=49.5:d=0.5[mix]']
cmd+=['-filter_complex',';'.join(filters),'-map','[mix]','-ar','48000','-ac','2',str(mix)];run(cmd)

base=f'''@font-face{{font-family:Jakarta;src:url('assets/fonts/Jakarta.ttf');font-weight:100 900}}*{{box-sizing:border-box}}#root{{position:absolute;inset:0;width:100%;height:100%;font-family:Jakarta,sans-serif;color:#102e33;overflow:hidden}}.ground{{position:absolute;inset:0;background:#f7f4ec}}.copy{{position:absolute;z-index:3;left:{112 if portrait else 128}px;top:{208 if portrait else 190}px;width:{850 if portrait else 690}px}}h1{{font-size:{88 if portrait else 86}px;line-height:1.06;letter-spacing:-4px;font-weight:750;margin:0}}h1{{white-space:pre-line}}h1 span{{display:block}}.sub{{font-size:{34 if portrait else 35}px;line-height:1.45;letter-spacing:-.8px;margin:24px 0 0;max-width:760px;font-weight:450}}.line{{width:96px;height:7px;background:#b6823c;margin-bottom:30px}}.provenance{{position:absolute;left:{112 if portrait else 128}px;top:{1390 if portrait else 944}px;max-width:{840 if portrait else 1664}px;font-size:28px;line-height:1.4;color:#48615f;z-index:5;margin:0}}.hero{{position:absolute;overflow:hidden;border-radius:22px;z-index:2;background:#fff;box-shadow:0 25px 60px rgba(16,46,51,.12)}}.hero img{{width:100%;height:100%;display:block;object-fit:contain}}.photo-wrap{{position:absolute;left:0;right:0;top:{650 if portrait else 0}px;bottom:0;overflow:hidden}}.photo-wrap img{{width:100%;height:100%;object-fit:cover;object-position:70% center}}.photo .copy{{width:{850 if portrait else 720}px}}.photo .provenance{{top:{585 if portrait else 905}px}}.photo.landscape .photo-wrap{{left:840px}}.photo.landscape .copy{{top:250px}}.photo.landscape h1{{font-size:88px}}.screen .hero{{left:{112 if portrait else 885}px;top:{580 if portrait else 170}px;width:{856 if portrait else 915}px;height:{760 if portrait else 700}px}}.screen .hero img{{object-fit:contain}}.screen.portrait .hero.pos-detail{{left:292px;width:496px;height:820px;top:540px}}.screen.portrait .hero.kds-detail{{left:205px;width:670px;height:820px;top:540px;background:transparent;box-shadow:none}}.screen.portrait .hero.admin-detail{{height:700px;top:580px}}.phone .hero{{left:{315 if portrait else 1110}px;top:{520 if portrait else 105}px;width:{450 if portrait else 440}px;height:{900 if portrait else 880}px;border:10px solid #173f3c;border-radius:48px}}.phone .hero img{{object-fit:cover;object-position:top}}.phone .provenance{{top:{1465 if portrait else 985}px}}.kiosk .hero{{left:{320 if portrait else 1100}px;top:{540 if portrait else 105}px;width:{440 if portrait else 440}px;height:{800 if portrait else 800}px;border:12px solid #173f3c;border-radius:28px}}.kiosk .hero img{{object-fit:cover;object-position:top}}.kiosk .provenance{{top:{1400 if portrait else 960}px}}.brand-logo{{position:absolute;left:{220 if portrait else 1120}px;top:{265 if portrait else 220}px;width:{640 if portrait else 580}px;height:auto;z-index:2}}.brand .copy{{top:{750 if portrait else 400}px;left:{112 if portrait else 128}px}}.brand .sub{{max-width:{780 if portrait else 680}px}}.brand .provenance{{top:{1190 if portrait else 920}px}}.brand-list{{position:absolute;left:{112 if portrait else 128}px;top:{1030 if portrait else 680}px;font-size:32px;line-height:1.8;color:#164e49;font-weight:650;max-width:800px}}.brand-list span{{display:inline-block;margin-right:26px}}.closing .brand-logo{{width:{600 if portrait else 560}px;left:{240 if portrait else 128}px;top:{215 if portrait else 160}px}}.closing .copy{{left:{112 if portrait else 850}px;top:{620 if portrait else 185}px;width:{856 if portrait else 940}px}}.closing h1{{font-size:{79 if portrait else 84}px}}.closing .sub{{font-size:32px;max-width:800px}}.cta{{display:inline-flex;align-items:center;justify-content:center;background:#164e49;color:white;font-weight:750;font-size:{34 if portrait else 34}px;padding:26px 34px;border-radius:14px;margin-top:34px;min-height:100px;white-space:nowrap}}.contact{{font-size:{35 if portrait else 36}px;font-weight:600;margin-top:30px;color:#164e49}}.closing .provenance{{top:{1225 if portrait else 905}px;font-size:26px}}.music-credit{{position:absolute;left:{112 if portrait else 128}px;top:{1300 if portrait else 960}px;font-size:26px;line-height:1.5;color:#48615f;max-width:850px}}.ribbon{{position:absolute;left:0;bottom:0;width:100%;height:{330 if portrait else 36}px;background:#164e49}}'''

scenedir=ROOT/'compositions';scenedir.mkdir(exist_ok=True);hosts=[]
for scene_index,s in enumerate(cfg['scenes']):
    sid=s['id'];kind=s['kind'];D=s['duration'];classes=f'{kind} {args.format}'
    visual='';special=''
    if kind=='photo':visual='<div class="photo-wrap" data-layout-allow-overflow>'+image(s['asset'],'photograph',sid+'-photo')+'</div>'
    elif kind in ('brand','closing'):visual=image('assets/logo/jamanvaar.png','brand-logo',sid+'-logo')
    else:
        asset=s['asset'];special=''
        if portrait and sid=='pos':asset='assets/product-recordings/pos-cart.png';special='pos-detail'
        if portrait and sid=='kds':asset='assets/product-recordings/kds-ticket.png';special='kds-detail'
        if sid=='admin':special='admin-detail'
        visual=f'<div class="hero {special}" id="{sid}-stage" data-layout-allow-overlap>'+image(asset,'screen-image',sid+'-screen')
        if s.get('asset2'):visual+=image(s['asset2'],'screen-b',sid+'-screen-b')
        visual+='</div>'
    if sid=='kds':
        visual+='<div class="kitchen-cut" id="kds-kitchen">'+image('assets/restaurant-footage/kitchen.jpg','kitchen-photo','kds-kitchen-photo')+'</div>'
    title=esc(s['title']);copy=f'<div class="copy" id="{sid}-copy"><div class="line" id="{sid}-line"></div><h1 id="{sid}-title" data-var-text="headline">{esc(s["title"])}</h1><p class="sub" id="{sid}-sub" data-var-text="subtitle">{esc(s["subtitle"])}</p>'
    if kind=='closing':copy+=f'<div class="cta" id="closing-cta" data-var-text="cta">{esc(cfg["cta"])}</div><p class="contact" id="closing-contact" data-var-text="contact">{esc(cfg["contact"])}</p>'
    copy+='</div>'
    if kind=='brand':visual+='<div class="brand-list" id="brand-range"><span>POS</span><span>QR Ordering</span><span>Kiosk</span><span>KDS</span><span>Management</span></div>'
    if kind=='closing':visual+='<div class="ribbon"></div><p class="music-credit">Music: Inspired — Kevin MacLeod · CC BY 4.0</p>'
    animations=[]
    if sid!='opening':animations.append(f"tl.fromTo('#{sid}-world',{{opacity:0}},{{opacity:1,duration:.25,ease:'power1.inOut'}},0);")
    # Start with a readable first frame. Later elements land and hold without drifting text.
    if sid!='opening':animations.append(f"tl.fromTo('#{sid}-copy',{{x:-38,opacity:0}},{{x:0,opacity:1,duration:.6,ease:'power3.out'}},.12);")
    else:animations.append("tl.fromTo('#opening-line',{scaleX:.1},{scaleX:1,duration:.7,ease:'power3.out'},0);")
    if kind=='photo':animations.append(f"tl.fromTo('#{sid}-photo',{{scale:1}},{{scale:1.035,duration:{D},ease:'none'}},0);")
    elif kind in ('brand','closing'):animations.append(f"tl.fromTo('#{sid}-logo',{{scale:.93,y:24,opacity:0}},{{scale:1,y:0,opacity:1,duration:.85,ease:'power4.out'}},.05);")
    else:animations.append(f"tl.fromTo('#{sid}-stage',{{y:65,opacity:0}},{{y:0,opacity:1,duration:.75,ease:'power4.out'}},.25);")
    if sid=='kds':animations.append("tl.fromTo('#kds-kitchen',{opacity:1},{opacity:0,duration:.4},2.3);")
    if kind=='kiosk':
        animations.append(f"tl.fromTo('#{sid}-screen-b',{{opacity:0}},{{opacity:1,duration:.3}},2.7);")
    if kind=='closing':animations.append("tl.fromTo('#closing-cta',{y:18,opacity:0},{y:0,opacity:1,duration:.5,ease:'power3.out'},1.2);")
    style=base+f'.kitchen-cut{{position:absolute;left:{112 if portrait else 885}px;top:{580 if portrait else 170}px;width:{856 if portrait else 915}px;height:{760 if portrait else 700}px;overflow:hidden;border-radius:22px;z-index:4}}.kitchen-cut img{{width:100%;height:100%;object-fit:cover;object-position:70% center}}'+('.screen-b{position:absolute;inset:0;opacity:0}' if kind=='kiosk' else '')
    variables=[{'id':'headline','type':'string','label':'Headline','default':s['title']},{'id':'subtitle','type':'string','label':'Supporting line','default':s['subtitle']}]
    if kind=='closing':variables.extend([{'id':'cta','type':'string','label':'Call to action','default':cfg['cta']},{'id':'contact','type':'string','label':'Email','default':cfg['contact']}])
    scene=f'''<template><style>{style}</style><div id="root" data-composition-id="{sid}" data-composition-variables='{esc(json.dumps(variables))}' data-width="{W}" data-height="{H}" data-layout-allow-overlap><div id="{sid}-world" class="{classes}" style="position:absolute;inset:0" data-hold="Readable product screenshot and narration"><div class="ground"></div>{visual}{copy}<p class="provenance">{esc(s['label'])}</p></div></div><script>const tl=gsap.timeline({{paused:true}});{''.join(animations)}window.__timelines['{sid}']=tl;</script></template>'''
    (scenedir/(sid+'.html')).write_text(scene,encoding='utf-8')
    hosts.append(f'<div id="{sid}" class="clip" style="z-index:{scene_index+1}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{s["start"]}" data-duration="{D+(0.35 if sid!='closing' else 0)}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}" data-layout-allow-overlap data-layout-allow-overflow></div>')

rootvars=[{'id':'cta','type':'string','label':'Call to action','default':cfg['cta']},{'id':'contact','type':'string','label':'Contact email','default':cfg['contact']}]
doc=f'''<!doctype html><html lang="en" data-resolution="{args.format}" data-composition-variables='{esc(json.dumps(rootvars))}'><head><meta charset="UTF-8"/><meta name="viewport" content="width={W},height={H}"/><title>Jamanvaar | Restaurant technology</title><script src="assets/gsap.min.js"></script><style>*{{box-sizing:border-box;margin:0}}html,body{{width:{W}px;height:{H}px;overflow:hidden}}#root{{position:relative;width:{W}px;height:{H}px}}.clip{{position:absolute;inset:0;width:100%;height:100%}}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="50" data-width="{W}" data-height="{H}">{''.join(hosts)}<audio id="ad-mix" class="clip" src="assets/voiceover/mix.wav" data-start="0" data-duration="50" data-volume="1" data-track-index="2"></audio></div><script>window.__timelines=window.__timelines||{{}};window.__timelines.main=gsap.timeline({{paused:true}});</script></body></html>'''
(ROOT/'index.html').write_text(doc,encoding='utf-8')
(ROOT/'config/active-format.json').write_text(json.dumps({'format':args.format,'width':W,'height':H,'fps':30,'duration':50},indent=2),encoding='utf-8')

def timestamp(t):
    ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
subtitles=[]
for i,(s,v) in enumerate(zip(cfg['scenes'],voice),1):subtitles.append(f'{i}\n{timestamp(v["start"])} --> {timestamp(v["start"]+v["duration"])}\n{s["narration"]}\n')
(ROOT/'output/jamanvaar-ad.en.srt').write_text('\n'.join(subtitles),encoding='utf-8')
(ROOT/'STORYBOARD.md').write_text('# Jamanvaar advertisement\n\n'+ '\n'.join(f'- **{s["start"]}-{s["start"]+s["duration"]} seconds — {s["id"]}:** {s["title"].replace(chr(10)," ")} | {s["label"]}' for s in cfg['scenes'])+'\n',encoding='utf-8')
print(f'Generated {len(hosts)} editable scenes, {W}x{H}, 50 seconds, mixed narration/music and SRT.')
