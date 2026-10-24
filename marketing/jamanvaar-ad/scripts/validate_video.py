"""Check actual final MP4 metadata, full decoding, black frames and audio levels."""
import argparse,json,re,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('video');parser.add_argument('--width',type=int,required=True);parser.add_argument('--height',type=int,required=True);a=parser.parse_args();p=Path(a.video)
assert p.exists() and p.stat().st_size>10000,'Missing or empty output'
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)],text=True))
v=next(s for s in probe['streams'] if s['codec_type']=='video');audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'])==(a.width,a.height)
assert v['codec_name']=='h264' and audio['codec_name']=='aac'
assert v['r_frame_rate']=='30/1'
assert 49.9<=float(probe['format']['duration'])<=50.2
decoded=subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],capture_output=True,text=True)
assert decoded.returncode==0 and not decoded.stderr.strip(),decoded.stderr
black=subprocess.run(['ffmpeg','-v','info','-i',str(p),'-vf','blackdetect=d=0.05:pix_th=0.02:pic_th=0.98','-an','-f','null','-'],capture_output=True,text=True)
black_events=[line for line in black.stderr.splitlines() if 'black_start:' in line]
assert not black_events,black_events
levels=subprocess.run(['ffmpeg','-hide_banner','-i',str(p),'-af','volumedetect','-vn','-f','null','-'],capture_output=True,text=True)
peak=re.search(r'max_volume: ([\-\d.]+) dB',levels.stderr);mean=re.search(r'mean_volume: ([\-\d.]+) dB',levels.stderr)
assert peak and float(peak.group(1))<0,'Audio clipping / no peak measurement'
loudness=subprocess.run(['ffmpeg','-hide_banner','-i',str(p),'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-vn','-f','null','-'],capture_output=True,text=True)
match=re.search(r'\{\s*"input_i".*?\}',loudness.stderr,re.S);measured=json.loads(match.group(0)) if match else {}
report={'file':str(p.resolve()),'bytes':p.stat().st_size,'duration':float(probe['format']['duration']),'width':v['width'],'height':v['height'],'fps':v['r_frame_rate'],'videoCodec':v['codec_name'],'pixelFormat':v['pix_fmt'],'audioCodec':audio['codec_name'],'audioSampleRate':audio['sample_rate'],'audioChannels':audio['channels'],'peakDb':float(peak.group(1)),'meanDb':float(mean.group(1)),'loudness':measured,'fullDecodePassed':True,'blackFrameEvents':black_events,'audioMeasuredNotListened':True}
p.with_suffix('.validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
