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

def draw_data_visual(draw, visual):
    """Render frozen numeric data only. Refuse layouts that would hide information."""
    if not isinstance(visual, dict): raise ValueError('INVALID_VISUAL')
    kind=visual.get('kind')
    unit=visual.get('unit','')
    if not isinstance(unit,str) or len(unit)>60:raise ValueError('INVALID_VISUAL_UNIT')
    if unit:draw.text((64,130),'Birim: '+unit,font=ImageFont.truetype(FONT,16),fill='#365865')
    if kind=='TABLE':
        columns,rows=visual.get('columns'),visual.get('rows')
        if not isinstance(columns,list) or not 2<=len(columns)<=5 or not isinstance(rows,list) or not 2<=len(rows)<=8: raise ValueError('INVALID_VISUAL_TABLE')
        if any(not isinstance(c,str) or len(c)>80 for c in columns) or any(not isinstance(r,list) or len(r)!=len(columns) or any(not isinstance(c,str) or len(c)>120 for c in r) for r in rows): raise ValueError('INVALID_VISUAL_TABLE')
        width=1152/len(columns)
        for size in [24,22,20,18,16,14]:
            font=ImageFont.truetype(FONT,size);header=ImageFont.truetype(BOLD,size)
            matrix=[[wrap(draw,c,header if i==0 else font,width-24) for c in row] for i,row in enumerate([columns]+rows)]
            heights=[max(len(c) for c in row)*(size+5)+20 for row in matrix]
            if sum(heights)<=456: break
        if sum(heights)>456: raise ValueError('VISUAL_TABLE_OVERFLOW')
        y=157
        for i,(row,height) in enumerate(zip(matrix,heights)):
            draw.rectangle((64,y,1216,y+height),fill='#173b48' if i==0 else '#eaf2f4' if i%2 else '#ffffff')
            for j,lines in enumerate(row):
                for k,line in enumerate(lines):draw.text((76+j*width,y+10+k*(size+5)),line,font=header if i==0 else font,fill='#ffffff' if i==0 else '#173b48')
            draw.line((64,y+height,1216,y+height),fill='#c9dadd',width=1);y+=height
    elif kind=='BAR_CHART':
        categories,values=visual.get('categories'),visual.get('values')
        if not isinstance(categories,list) or not 2<=len(categories)<=8 or not isinstance(values,list) or len(values)!=len(categories):raise ValueError('INVALID_VISUAL_CHART')
        if any(not isinstance(c,str) or len(c)>60 for c in categories) or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1e9 for v in values):raise ValueError('INVALID_VISUAL_CHART')
        font=ImageFont.truetype(FONT,17);bold=ImageFont.truetype(BOLD,18)
        raw=max(max(values),1)/4;unit=10**math.floor(math.log10(raw));maximum=next(n*unit*4 for n in [1,2,2.5,5,10] if n*unit>=raw)
        fmt=lambda v: format(v,',.2f').rstrip('0').rstrip('.').replace(',','_').replace('.',',').replace('_','.')
        step=1080/len(values);baseline=480
        for fraction in [0,.25,.5,.75,1]:
            y=baseline-fraction*280;draw.line((125,y,1216,y),fill='#c9dadd',width=1)
            draw.text((16,y-10),fmt(maximum*fraction),font=ImageFont.truetype(FONT,14),fill='#365865')
        for i,(category,value) in enumerate(zip(categories,values)):
            x=140+i*step;bar=step*.55;height=value/maximum*280
            if height:draw.rectangle((x,baseline-height,x+bar,baseline),fill='#18706d')
            draw.text((x+bar/2,baseline-height-25),fmt(value),anchor='mt',font=bold,fill='#173b48')
            lines=wrap(draw,category,font,step-12)
            if len(lines)*22>115:raise ValueError('VISUAL_LABEL_OVERFLOW')
            for k,line in enumerate(lines):draw.text((x+bar/2,baseline+15+k*22),line,anchor='mt',font=font,fill='#173b48')
    else:raise ValueError('INVALID_VISUAL_KIND')

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
            if scene.get('visual') is not None:
                draw_data_visual(draw,scene['visual'])
            else:
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
