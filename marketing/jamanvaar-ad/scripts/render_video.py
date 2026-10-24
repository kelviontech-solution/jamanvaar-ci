"""Rebuild/check/render one editable composition. Requires Node, Chrome and FFmpeg."""
import argparse,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--format',choices=['portrait','landscape'],default='portrait');p.add_argument('--quality',choices=['draft','delivery'],default='delivery');a=p.parse_args()
env={**os.environ,'HYPERFRAMES_NO_TELEMETRY':'1'}
def run(args,**kwargs):subprocess.run(args,cwd=ROOT,env=env,check=True,**kwargs)
run([sys.executable,'scripts/build_timeline.py','--format',a.format])
cli=['cmd','/d','/c','npx','--yes','hyperframes@0.8.185'] if os.name=='nt' else ['npx','--yes','hyperframes@0.8.185']
with (ROOT/f'output/check-{a.format}.json').open('w',encoding='utf-8') as f:run(cli+['check','--json'],stdout=f)
run(cli+['snapshot','--review'])
run(cli+['preview','--background','--no-open'])
name='vertical' if a.format=='portrait' else 'landscape'
master=f'output/jamanvaar-{name}-master.mp4';dest=f'output/jamanvaar-{name}.mp4'
run(cli+['render','--quality',a.quality,'--fps','30','--workers','2','--output',master])
run([sys.executable,'scripts/finalize_video.py',master,dest])
w,h=(1080,1920) if a.format=='portrait' else (1920,1080)
run([sys.executable,'scripts/validate_video.py',dest,'--width',str(w),'--height',str(h)])
if a.format=='portrait':
    preview='output/jamanvaar-preview-540p.mp4'
    run(['ffmpeg','-y','-v','error','-i',dest,'-vf','scale=540:960','-c:v','libx264','-crf','24','-preset','fast','-c:a','aac','-b:a','128k','-movflags','+faststart',preview])
    run([sys.executable,'scripts/validate_video.py',preview,'--width','540','--height','960'])
