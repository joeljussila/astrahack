"""One Blender transaction. Only validated output is published by the parent server."""
import bpy, sys, json, math, hashlib, uuid, traceback
from pathlib import Path
from mathutils import Vector
from xml.sax.saxutils import escape
job=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text(encoding='utf-8'))
out=Path(job['output'])
if job['source']:
    bpy.ops.wm.open_mainfile(filepath=job['source'], load_ui=False, use_scripts=False)
else:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

if job['mode']=='edit':
    # The complete bpy API is available. Code is generated for this local design session.
    try:
        exec(compile(job['code'], '<silta-design-edit>', 'exec'), {'bpy':bpy,'math':math,'Vector':Vector})
    except Exception as error:
        # Keep full local diagnostics; give the agent the actual exception rather
        # than the beginning of Blender's traceback (which omits the cause).
        (out/'error.log').write_text(traceback.format_exc(),encoding='utf-8')
        frames=traceback.extract_tb(error.__traceback__)
        frame=next((f for f in reversed(frames) if f.filename=='<silta-design-edit>'),None)
        line=getattr(error,'lineno',None) or (frame.lineno if frame else None)
        lines=job['code'].splitlines()
        detail={'type':type(error).__name__,'message':str(error)[:500],'line':line,'source':lines[line-1][:200] if line and line<=len(lines) else ''}
        (out/'error.json').write_text(json.dumps(detail),encoding='utf-8')
        print('SILTA_EDIT_ERROR '+json.dumps(detail),file=sys.stderr,flush=True)
        raise SystemExit(1)
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
meshes=[]
seen=set()
for o in bpy.context.scene.objects:
    if o.type not in {'MESH','CURVE','FONT','SURFACE','META'}: continue
    if o.hide_render: continue
    sid=str(o.get('silt_id',''))
    if not sid or sid in seen: sid=str(uuid.uuid4());o['silt_id']=sid
    seen.add(sid)
    evaluated=o.evaluated_get(deps)
    mesh=evaluated.to_mesh()
    if not mesh: continue
    verts=[evaluated.matrix_world@v.co for v in mesh.vertices]
    if not verts: evaluated.to_mesh_clear();continue
    mesh.calc_loop_triangles()
    tris=[list(t.vertices) for t in mesh.loop_triangles]
    materials=[list(m.diffuse_color) for m in o.data.materials if m] if hasattr(o.data,'materials') else []
    lo=[min(v[i] for v in verts) for i in range(3)];hi=[max(v[i] for v in verts) for i in range(3)]
    digest=hashlib.sha256(json.dumps({'vertices':[[round(c,5) for c in v] for v in verts],'triangles':tris,'materials':materials},sort_keys=True).encode()).hexdigest()
    meshes.append({'obj':o,'verts':verts,'tris':tris,'lo':lo,'hi':hi,'hash':digest})
    evaluated.to_mesh_clear()
if sum(len(m['tris']) for m in meshes)>500000: raise ValueError('Keep the interactive scene below 500,000 triangles.')
if len(meshes)>3000: raise ValueError('Keep the interactive scene below 3,000 mesh objects.')

def bounds(items):
    return ([min(m['lo'][i] for m in items) for i in range(3)],[max(m['hi'][i] for m in items) for i in range(3)])

if job['mode']=='plan':
    if not meshes: raise ValueError('Create architectural geometry before requesting a section drawing.')
    height=float(job['cutHeight'])
    if not math.isfinite(height) or abs(height)>1000: raise ValueError('Invalid section height.')
    lines=[]
    for m in meshes:
        if m['obj'].get('kind') in {'ground','tree'}: continue
        for tri in m['tris']:
            v=[m['verts'][i] for i in tri]; hits=[]
            for a,b in zip(v,v[1:]+v[:1]):
                da,db=a.z-height,b.z-height
                if da*db<0:
                    p=a+(b-a)*(da/(da-db));hits.append((p.x,p.y))
                elif abs(da)<1e-7:hits.append((a.x,a.y))
            unique=list(dict.fromkeys((round(x,5),round(y,5)) for x,y in hits))
            if len(unique)==2:lines.append(unique)
    if not lines: raise ValueError('No geometry crosses this section height. Model walls or choose another height.')
    pts=[p for line in lines for p in line];xmin=min(p[0] for p in pts);xmax=max(p[0] for p in pts);ymin=min(p[1] for p in pts);ymax=max(p[1] for p in pts)
    w=max(xmax-xmin,.1);h=max(ymax-ymin,.1);scale=min(960/w,600/h);pad=80
    def xy(p):return (pad+(p[0]-xmin)*scale,pad+(ymax-p[1])*scale)
    elements=[]
    for a,b in lines:
        x1,y1=xy(a);x2,y2=xy(b);elements.append(f'<path d="M{x1:.2f},{y1:.2f} L{x2:.2f},{y2:.2f}"/>')
    sw=w*scale+2*pad;sh=h*scale+2*pad+70
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{sw:.0f}" height="{sh:.0f}" viewBox="0 0 {sw:.0f} {sh:.0f}"><rect width="100%" height="100%" fill="#fafaf7"/><g font-family="Arial,sans-serif" fill="#26352e"><text x="40" y="30" font-size="18">SILTAdesign · Model section at {height:g} m</text><text x="40" y="50" font-size="11">Concept drawing from mesh intersections · not a construction document</text></g><g stroke="#273c33" stroke-width="1.3" fill="none">{''.join(elements)}</g><g font-family="Arial,sans-serif" font-size="12" fill="#48584d"><text x="{sw/2:.1f}" y="{h*scale+pad+25:.1f}" text-anchor="middle">{w:.2f} m section extent</text><text x="40" y="{sh-22:.1f}">Vertical extent on sheet: {h:.2f} m · drawing represents modeled geometry only</text></g></svg>'''
    (out/'plan.svg').write_text(svg,encoding='utf-8')
    labels=[{'text':str(o['room_label'])[:60],'x':o.matrix_world.translation.x,'y':o.matrix_world.translation.y} for o in bpy.context.scene.objects if o.get('room_label')]
    label_source='room annotations' if labels else 'building names'
    if not labels:
        labels=[{'text':m['obj'].name.replace(' timber form','')[:45],'x':(m['lo'][0]+m['hi'][0])/2,'y':(m['lo'][1]+m['hi'][1])/2} for m in meshes if m['obj'].get('kind')=='building']
    def is_door(m):
        name=m['obj'].name.lower()
        return (m['obj'].get('plan_role')=='door' or 'door' in name or 'entrance' in name) and not any(x in name for x in ['frame','jamb','lintel','handle','pull','step','deck','rail']) and m['hi'][2]-m['lo'][2]>.8
    doors=[{'text':'D'+str(i+1),'name':m['obj'].name,'x':(m['lo'][0]+m['hi'][0])/2,'y':(m['lo'][1]+m['hi'][1])/2} for i,m in enumerate([m for m in meshes if is_door(m)])]
    (out/'drawing.json').write_text(json.dumps({'lines':lines,'labels':labels,'labelSource':label_source,'doors':doors,'cutHeight':height,'bounds':[xmin,ymin,xmax,ymax]}),encoding='utf-8')
    (out/'result.json').write_text(json.dumps({'segments':len(lines)}))
else:
    objects=[]
    for m in meshes:
        o=m['obj'];lo,hi=m['lo'],m['hi'];mid=[(a+b)/2 for a,b in zip(lo,hi)];size=[b-a for a,b in zip(lo,hi)]
        children=[x['hash'] for x in meshes if x['obj'] in o.children_recursive]
        kind=o.get('kind','detail');kind=kind if kind in {'building','ground','path','tree','detail'} else 'detail'
        objects.append({'id':o['silt_id'],'name':o.name,'kind':kind,'position':[mid[0],mid[2],-mid[1]],'size':[size[0],size[2],size[1]],'rotation':0,'shape':'mesh','floors':max(0,int(o.get('floors',1 if kind=='building' else 0))),'homes':max(0,int(o.get('homes',0))),'use':str(o.get('use','other')),'fingerprint':hashlib.sha256((m['hash']+''.join(sorted(children))).encode()).hexdigest(),'protected':False})
    scene=bpy.context.scene
    # A predictable inspection camera, separate from the user's model cameras.
    cam=bpy.data.objects.get('_silta_inspection')
    if not cam:
        data=bpy.data.cameras.new('_silta_inspection');cam=bpy.data.objects.new('_silta_inspection',data);scene.collection.objects.link(cam)
    focus=[m for m in meshes if m['obj'].get('kind')!='ground'] or meshes
    if focus:
        lo,hi=bounds(focus);center=Vector([(a+b)/2 for a,b in zip(lo,hi)]);span=max(hi[i]-lo[i] for i in range(3));span=max(span,5)
    else:center=Vector((0,0,0));span=10
    cam.location=center+Vector((span*.95,-span*1.25,span*.9));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=span*1.65;scene.camera=cam
    scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH';scene.display.shading.background_type='WORLD';scene.world.color=(.85,.86,.83)
    scene.render.resolution_x=1000;scene.render.resolution_y=750;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'preview.png');scene.render.film_transparent=False
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'scene.blend'))
    bpy.ops.export_scene.gltf(filepath=str(out/'scene.glb'),export_format='GLB',export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
    bpy.ops.render.render(write_still=True)
    (out/'result.json').write_text(json.dumps({'objects':objects}),encoding='utf-8')
