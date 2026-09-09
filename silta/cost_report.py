"""Reusable SILTAdesign concept-estimate template, independent of cost generation."""
from datetime import date
from math import floor
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

INK = colors.HexColor('#19342f')
GREEN = colors.HexColor('#547663')
MUTED = colors.HexColor('#687771')
PALE = colors.HexColor('#eef3ef')
LINE = colors.HexColor('#d4ded7')
WIDTH = A4[0] - 108

def rounded_euros(value):
    # Same positive half-up rule as Math.round in the spoken estimate.
    return '\u20ac' + f'{floor(value / 1000 + .5) * 1000:,.0f}'

def allowance(low, high):
    if 0 < high < 500:
        return '< \u20ac1,000'
    a, b = rounded_euros(low), rounded_euros(high)
    return a if a == b else f'{a} - {b}'

def build_cost_report(out, report, meta):
    r = report
    styles = {
        'body': ParagraphStyle('body', fontName='Helvetica', fontSize=10, leading=14.5, textColor=INK, spaceAfter=6),
        'small': ParagraphStyle('small', fontName='Helvetica', fontSize=8.5, leading=12, textColor=MUTED, spaceAfter=5),
        'title': ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=30, leading=34, textColor=INK, spaceAfter=12),
        'section': ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=15, leading=20, textColor=INK, spaceBefore=15, spaceAfter=8, keepWithNext=True),
        'label': ParagraphStyle('label', fontName='Helvetica-Bold', fontSize=8, leading=12, textColor=GREEN, spaceAfter=8),
        'number': ParagraphStyle('number', fontName='Helvetica-Bold', fontSize=30, leading=36, textColor=colors.white),
        'white': ParagraphStyle('white', fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor('#dde9e0')),
        'cell': ParagraphStyle('cell', fontName='Helvetica', fontSize=9, leading=12, textColor=INK),
        'money': ParagraphStyle('money', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=INK, alignment=2),
    }
    def p(text, style='body'):
        clean = str(text).replace('\u2013', '-').replace('\u2014', '-').replace('\u2011', '-').replace('\u00d7', 'x')
        return Paragraph(escape(clean), styles[style])
    story = [p('CONCEPT STUDY / MATERIALS', 'label'), p('An early view of\nmaterial costs'.replace('\n', ' '), 'title'),
             p(f"{r['location']}  |  {r['area_m2']:g} m\u00b2  |  Scene revision {meta['revision']}", 'small'), Spacer(1, 12)]
    hero = Table([[p('ILLUSTRATIVE MATERIALS ALLOWANCE', 'white')],
                  [p(allowance(r['total_low'], r['total_high']), 'number')],
                  [p('EUR / rounded to the nearest 1,000 / excluding tax', 'white')]], colWidths=[WIDTH], hAlign='LEFT')
    hero.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), INK), ('LEFTPADDING', (0, 0), (-1, -1), 20),
        ('RIGHTPADDING', (0, 0), (-1, -1), 20), ('TOPPADDING', (0, 0), (-1, 0), 16),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 17), ('TOPPADDING', (0, 1), (-1, 1), 7), ('BOTTOMPADDING', (0, 1), (-1, 1), 7)]))
    story += [hero, Spacer(1, 15), p(r['scope']), p('Materials allowance by category', 'section')]
    rows = [[p('INCLUDED MATERIALS', 'label'), p('ALLOWANCE / EUR', 'label')]]
    for x in r['items']:
        rows.append([p(x['name'], 'cell'), p(allowance(x['low'], x['high']), 'money')])
    rows.append([p('TOTAL MATERIALS', 'label'), p(allowance(r['total_low'], r['total_high']), 'money')])
    table = Table(rows, colWidths=[WIDTH*.62, WIDTH*.38], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, PALE]), ('LINEBELOW', (0, 0), (-1, 0), .7, INK),
        ('LINEABOVE', (0, -1), (-1, -1), .8, INK), ('BACKGROUND', (0, -1), (-1, -1), PALE)]))
    story += [table, Spacer(1, 9), p('Each endpoint is rounded independently to the nearest EUR 1,000. Totals are calculated before rounding; displayed rows may not add exactly. Very small nonzero allowances are shown as < EUR 1,000.', 'small'),
              p('A concept allowance for the listed scope, not a supplier quotation or complete construction budget.', 'small'), PageBreak(),
              p('BASIS / ASSUMPTIONS', 'label'), p('What the estimate covers', 'title'),
              p(f"Area basis: {r['area_m2']:g} m\u00b2 - {r['area_basis']}."),
              p('Quantities and assumptions', 'section')]
    for i, x in enumerate(r['items'], 1):
        heading = p(f"{i:02d}  {x['name']} | {x['quantity']:g} {x['unit']}", 'label')
        story.append(KeepTogether([heading, p(x['basis'], 'small'), Spacer(1, 4)]))
    story += [p('Assumptions', 'section')]
    for text in r['assumptions']:
        story.append(p('- ' + text))
    exclusions = [p('Excluded from this allowance', 'section')]
    for text in r['exclusions']:
        exclusions.append(p('- ' + text))
    story.append(KeepTogether(exclusions))
    story += [p('Method and evidence', 'section'), p('Each category is calculated as its quantity multiplied by an assumed low and high unit rate, then summed before display rounding. These are rough planning assumptions, not measured procurement quantities. Model bounds are not net floor area. No live supplier quotations were obtained.', 'small')]
    for text in r.get('sources', []):
        story.append(p(text, 'small'))
    story += [p('Use this report to discuss scope and compare early options. A local quantity surveyor or supplier must verify quantities, specification, location and prices before a procurement decision.', 'small')]
    def page(c, doc):
        c.saveState()
        c.setFillColor(INK);c.setFont('Helvetica-Bold', 12);c.drawString(48, A4[1]-36, 'SILTA')
        c.setFont('Helvetica', 12);c.drawString(83, A4[1]-36, 'design')
        c.setFillColor(MUTED);c.setFont('Helvetica', 8);c.drawRightString(A4[0]-48, A4[1]-36, meta.get('date', date.today().isoformat()))
        c.setStrokeColor(LINE);c.line(48, A4[1]-47, A4[0]-48, A4[1]-47);c.line(48, 42, A4[0]-48, 42)
        c.setFont('Helvetica', 7.5);c.drawString(48, 28, 'SILTAdesign / Illustrative concept estimate / EUR')
        c.drawRightString(A4[0]-48, 28, f'{doc.page:02d}');c.restoreState()
    SimpleDocTemplate(out, pagesize=A4, leftMargin=48, rightMargin=48, topMargin=70, bottomMargin=58,
        title='SILTAdesign | Concept materials estimate', author='SILTAdesign').build(story, onFirstPage=page, onLaterPages=page)
