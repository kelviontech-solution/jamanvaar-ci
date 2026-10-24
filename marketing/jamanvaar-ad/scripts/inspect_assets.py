"""Inventory source media with dimensions, duration, hashes and honest provenance."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
files=[]
for p in sorted((ROOT/'assets').rglob('*')):
    if not p.is_file():continue
    rel=p.relative_to(ROOT).as_posix()
    row={'path':rel,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
    if '/logo/' in rel:row.update(source='Official repository asset',original='cloud/super-admin-web/public/assets/branding/jamanvaar-logo.png',modified=False)
    elif '/product-recordings/' in rel:row.update(source='Playwright capture of real repository components with fictional local data',authenticationVerified=False,backendVerified=False)
    elif '/restaurant-footage/' in rel:row.update(source='Built-in image_gen',type='AI-generated illustrative photograph, animated in composition',realCustomer=False)
    elif '/voiceover/' in rel:row.update(source='Free Edge online TTS; en-IN-PrabhatNeural; mixed locally' if p.suffix!='.md' else 'Configurable narration script')
    elif '/music/' in rel:row.update(source='Inspired - Kevin MacLeod',license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/',attribution='See assets/music/ATTRIBUTION.txt; on-screen credit included')
    elif p.name=='Jakarta.ttf':row.update(source='Google Fonts: Plus Jakarta Sans',license='SIL Open Font License 1.1',licenseFile='assets/fonts/OFL.txt')
    elif p.name=='gsap.min.js':row.update(source='GSAP 3.14.2 via jsDelivr; local copy for reproducibility')
    if p.suffix.lower() in ['.png','.jpg','.webp','.mp4','.webm','.mp3','.wav']:
        proc=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_name,width,height,sample_rate,channels:format=duration','-of','json',str(p)],capture_output=True,text=True)
        if proc.returncode==0:row['probe']=json.loads(proc.stdout)
    files.append(row)
manifest={'project':'Jamanvaar advertisement','assets':files,'missing':['No runnable Vartalaap / WhatsApp ordering app or authentic chat recording found','No physical printer, live payments, kitchen integration or customer phone delivery verified by this capture','No verified sales phone number or public marketing website supplied; omitted'],'generatedImagePrompts':[
{'asset':'assets/restaurant-footage/restaurant.png','prompt':'Premium believable contemporary Indian restaurant in Ahmedabad during daytime service. Indian owner in ivory shirt observes waiter serving guests. Cream stone, sage upholstery, brass pendants, plants, natural skin texture, 35mm, horizontal 16:9; no logos, text, fake interfaces or watermarks.'},
{'asset':'assets/restaurant-footage/phone.png','prompt':'Indian couple at sunlit contemporary cafe, Indian woman in emerald blouse using phone facing away from camera, paneer tikka and copper servingware, cream and teal, natural light, 50mm hospitality photography, horizontal 16:9; no interface, logo, text, QR or watermarks.'},
{'asset':'assets/restaurant-footage/kitchen.png','prompt':'Indian chef finishing paneer dishes in clean contemporary restaurant kitchen, warm natural light, stainless steel, cream and sage, another chef in background, blank monitor on left, realistic premium hospitality photo, horizontal 16:9; no invented interface, text, logo or watermark.'}
]}
(ROOT/'config/media-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(f'Inventoried {len(files)} assets.')
