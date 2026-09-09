"""PDF production and TLS email transport. Input arrives on stdin, never CLI args."""
import sys,json,ssl,smtplib
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from email.message import EmailMessage
from email.utils import make_msgid
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4,landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle

def build_pdf(d):
    out=d['output'];meta=d['meta']
    if d['kind']=='blueprint':
        plan=d['plan'];w,h=landscape(A4);c=canvas.Canvas(out,pagesize=(w,h));c.setTitle('SILTAdesign - Concept floor plan')
        c.setFont('Helvetica-Bold',18);c.drawString(36,h-40,'SILTAdesign | Concept floor plan')
        c.setFont('Helvetica',9);c.drawString(36,h-58,f"Scene revision {meta['revision']} | Section at {plan['cutHeight']:g} m | Units: meters")
        xmin,ymin,xmax,ymax=plan['bounds'];scale=min((w-110)/max(xmax-xmin,.1),(h-190)/max(ymax-ymin,.1))
        left=(w-(xmax-xmin)*scale)/2;bottom=112+(h-190-(ymax-ymin)*scale)/2
        def xy(p):return left+(p[0]-xmin)*scale,bottom+(p[1]-ymin)*scale
        c.setLineWidth(.65);c.setStrokeColor(colors.black)
        for a,b in plan['lines']:c.line(*xy(a),*xy(b))
        for label in plan['labels']+plan['doors']:
            x,y=xy((label['x'],label['y']));text=label['text'];c.setFont('Helvetica',8);tw=c.stringWidth(text,'Helvetica',8)
            c.setFillColor(colors.white);c.rect(x-tw/2-2,y-2,tw+4,11,fill=1,stroke=0);c.setFillColor(colors.black);c.drawCentredString(x,y,text)
        c.setFont('Helvetica',8);c.drawString(36,83,f"Model extent: {xmax-xmin:.2f} x {ymax-ymin:.2f} m. Door markers: {len(plan['doors'])}.")
        c.drawString(36,68,'Black lines are intersections with modeled geometry. Unmodeled partitions and openings are not invented.')
        c.drawString(36,53,'Room names are model annotations.' if plan.get('labelSource')=='room annotations' else 'Labels identify modeled buildings; internal room names were not annotated. Only named door elements are marked.')
        c.drawString(36,38,'CONCEPT ONLY - Not a permit drawing, dimensioned construction plan, or engineering validation.')
        c.save()
    else:
        from cost_report import build_cost_report
        build_cost_report(out, d['report'], meta)
    return {'created':True}

def send_email(d):
    cfg=d['smtp'];m=EmailMessage();m['From']=cfg['user'];m['To']=d['recipient'];m['Subject']=d['subject'];m['Message-ID']=make_msgid(domain=cfg['user'].split('@')[-1])
    m.set_content('Attached is your SILTAdesign concept document. It is not a construction approval or a supplier quote.');m.add_attachment(Path(d['attachment']).read_bytes(),maintype='application',subtype='pdf',filename=Path(d['attachment']).name)
    context=ssl.create_default_context()
    client=smtplib.SMTP_SSL(cfg['host'],cfg['port'],context=context,timeout=25) if cfg['port']==465 else smtplib.SMTP(cfg['host'],cfg['port'],timeout=25)
    with client as smtp:
        if cfg['port']!=465:smtp.ehlo();smtp.starttls(context=context);smtp.ehlo()
        password=cfg['password'].replace(' ','') if cfg['host']=='smtp.gmail.com' else cfg['password']
        smtp.login(cfg['user'],password);refused=smtp.send_message(m)
        if refused:raise RuntimeError('The recipient was rejected by the email provider.')
    return {'accepted':True,'messageId':m['Message-ID']}

if __name__=='__main__':
    d={}
    try:
        d=json.load(sys.stdin);result=send_email(d) if d.get('operation')=='email' else build_pdf(d);print(json.dumps(result))
    except Exception as e:
        # Do not echo SMTP credentials, recipient details or provider responses.
        print(json.dumps({'error':('Email provider did not confirm acceptance. Check sender settings; delivery status may be uncertain.' if d.get('operation')=='email' else 'PDF creation failed: '+type(e).__name__)}));sys.exit(1)
