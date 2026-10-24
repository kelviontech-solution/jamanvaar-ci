"""Add social-friendly faststart and required attribution, preserving picture/audio."""
import argparse,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');a=p.parse_args()
subprocess.run(['ffmpeg','-y','-v','error','-i',a.source,'-map','0:v:0','-map','0:a:0','-c','copy','-movflags','+faststart','-metadata','title=Jamanvaar | Smarter Restaurant Technology','-metadata','artist=Jamanvaar by KelvionTech','-metadata','comment=Music: Inspired by Kevin MacLeod (incompetech.com). CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ . Excerpt, fades and narration mix. Illustrative AI imagery and actual product components with fictional local demo data.','-metadata','description=POS, QR Ordering, Kiosk, Kitchen Display and Restaurant Management. Book your personalised demo: kelviontech@gmail.com',a.output],check=True)
print(Path(a.output).resolve())
