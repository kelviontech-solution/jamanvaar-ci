"""Free online Indian English speech, then a licensed instrumental bed. No paid APIs."""
import asyncio,json,sys,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.tools'))
import edge_tts

def duration(file):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(file)],text=True).strip())

async def main():
    cfg=json.loads((ROOT/'config/video_config.json').read_text(encoding='utf-8'))
    metadata=[]
    for scene in cfg['scenes']:
        dest=ROOT/f"assets/voiceover/{scene['id']}.mp3"
        if '--refresh' in sys.argv or not dest.exists() or dest.stat().st_size==0:
            speech=edge_tts.Communicate(scene['narration'],cfg['voice'],rate='+8%')
            await speech.save(str(dest))
        seconds=duration(dest)
        allowed=scene['duration']-.35
        rate=max(1,seconds/allowed)
        wav=dest.with_suffix('.wav')
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(dest),'-af',f'atempo={rate:.6f},loudnorm=I=-16:TP=-2:LRA=7,afade=t=out:st={max(0,seconds/rate-.1):.3f}:d=0.1','-ar','48000',str(wav)],check=True)
        metadata.append({'id':scene['id'],'start':scene['start']+.15,'duration':duration(wav),'file':str(wav.relative_to(ROOT)).replace('\\','/'),'provider':'Microsoft Edge online speech, free endpoint','voice':cfg['voice'],'speedAdjustment':rate})
        print(scene['id'],round(seconds,2),'->',round(duration(wav),2),flush=True)
    (ROOT/'output/voice-metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    # Licensed instrumental; preserve the original and prepare a 50-second excerpt.
    track=ROOT/'assets/music/Inspired-Kevin-MacLeod.mp3'
    subprocess.run(['ffmpeg','-y','-v','error','-ss','24','-i',str(track),'-t','50','-af','loudnorm=I=-22:TP=-3:LRA=8,afade=t=in:d=0.7,afade=t=out:st=48:d=2','-ar','48000',str(ROOT/'assets/music/bed.wav')],check=True)
    narration='\n\n'.join(f"{s['start']:02d}-{s['start']+s['duration']:02d}s: {s['narration']}" for s in cfg['scenes'])
    (ROOT/'assets/voiceover/NARRATION.md').write_text('# Narration\n\n'+narration+'\n',encoding='utf-8')

asyncio.run(main())
