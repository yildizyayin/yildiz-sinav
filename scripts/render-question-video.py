"""Render a frozen Turkish solution plan. No shell, remote URLs, or generated answers."""
import argparse, json, math, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def probe(path):
    result=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],check=True,capture_output=True,text=True)
    return json.loads(result.stdout)

def wrap(draw,text,font,width):
    lines=[]
    for paragraph in text.split('\n'):
        line=''
        for word in paragraph.split(' '):
            trial=(line+' '+word).strip()
            if draw.textlength(trial,font=font)<=width: line=trial;continue
            if line: lines.append(line);line=''
            # Long uninterrupted source text must wrap, never disappear off-frame.
            for char in word:
                if line and draw.textlength(line+char,font=font)>width: lines.append(line);line=''
                line+=char
        lines.append(line)
    return lines

def render(plan_path,output,audio=None):
    raw=Path(plan_path).read_bytes()
    if len(raw)>65536: raise ValueError('PLAN_TOO_LARGE')
    plan=json.loads(raw)
    if plan.get('version')!=1 or plan.get('width')!=1280 or plan.get('height')!=720 or plan.get('language')!='tr-TR': raise ValueError('INVALID_PLAN')
    scenes=plan.get('scenes')
    if not isinstance(scenes,list) or not 1<=len(scenes)<=12: raise ValueError('INVALID_SCENES')
    for scene in scenes:
        if not isinstance(scene.get('text'),str) or not scene['text'].strip() or len(scene['text'])>2000 or not isinstance(scene.get('title'),str) or len(scene['title'])>150: raise ValueError('INVALID_SCENE')
    audio_seconds=0
    if audio:
        metadata=probe(audio)
        if not any(s['codec_type']=='audio' for s in metadata['streams']): raise ValueError('AUDIO_STREAM_MISSING')
        audio_seconds=float(metadata['format']['duration'])
        if not math.isfinite(audio_seconds) or not 0<audio_seconds<=580: raise ValueError('AUDIO_DURATION_INVALID')
    with tempfile.TemporaryDirectory(prefix='anunex-video-') as td:
        folder=Path(td);frames=[]
        for i,scene in enumerate(scenes):
            image=Image.new('RGB',(1280,720),'#f5f8fa');draw=ImageDraw.Draw(image)
            draw.rectangle((0,0,1280,12),fill='#147d83')
            draw.text((64,38),'ANUNEX  /  ÇÖZÜM ATÖLYESİ',font=ImageFont.truetype(BOLD,20),fill='#17666c')
            draw.text((64,87),scene['title'],font=ImageFont.truetype(BOLD,34),fill='#173449')
            font=None;lines=[];line_height=0
            for size in [32,30,28,26,24,22]:
                font=ImageFont.truetype(FONT,size);lines=wrap(draw,scene['text'],font,1152);line_height=size+12
                if len(lines)*line_height<=456:break
            if len(lines)*line_height>456: raise ValueError('SCENE_TEXT_OVERFLOW')
            y=157
            for line in lines:draw.text((64,y),line,font=font,fill='#243e4d');y+=line_height
            footer='SENTETİK TEKNİK TEST · ÖĞRENCİ İÇERİĞİ DEĞİLDİR' if plan.get('synthetic') else 'Kaynak soru sürümü: '+str(plan.get('sourceRevision',''))+' · Yayın öncesi insan incelemesi gerekir'
            draw.text((64,660),footer,font=ImageFont.truetype(FONT,17),fill='#687e89')
            draw.text((1140,660),f'{i+1}/{len(scenes)}',font=ImageFont.truetype(BOLD,18),fill='#147d83')
            path=folder/f'frame-{i:02d}.png';image.save(path);frames.append(path)
        weights=[max(1,len(s.get('spokenText',s['text']))) for s in scenes]
        total=max(audio_seconds+1,len(scenes)*5, sum(weights)/14 if not audio else 0)
        if total>600:raise ValueError('VIDEO_TOO_LONG')
        durations=[max(4,total*w/sum(weights)) for w in weights];total=sum(durations)
        if total>600:raise ValueError('VIDEO_TOO_LONG')
        listing=folder/'frames.txt'
        listing.write_text(''.join(f"file '{p}'\nduration {d:.3f}\n" for p,d in zip(frames,durations))+f"file '{frames[-1]}'\n")
        command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing)]
        if audio: command+=['-i',str(Path(audio).resolve())]
        command+=['-vf','fps=25,format=yuv420p','-c:v','libx264','-preset','fast','-tune','stillimage','-movflags','+faststart']
        if audio: command+=['-c:a','aac','-af','apad','-b:a','128k']
        command+=['-t',f'{total:.3f}',str(Path(output).resolve())]
        subprocess.run(command,check=True,timeout=300,capture_output=True)
    metadata=probe(output);streams=metadata['streams'];video=next(s for s in streams if s['codec_type']=='video')
    actual=float(metadata['format']['duration']);has_audio=any(s['codec_type']=='audio' for s in streams)
    if video['width']!=1280 or video['height']!=720 or not 0<actual<=600 or bool(audio)!=has_audio:raise ValueError('RENDER_VALIDATION_FAILED')
    result={'width':1280,'height':720,'durationSeconds':actual,'hasAudio':has_audio,'bytes':Path(output).stat().st_size,'synthetic':bool(plan.get('synthetic'))}
    Path(str(output)+'.json').write_text(json.dumps(result));print(json.dumps(result));return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('plan');parser.add_argument('output');parser.add_argument('--audio');args=parser.parse_args();render(args.plan,args.output,args.audio)
