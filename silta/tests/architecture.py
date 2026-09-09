# Authored geometry fixture for integration testing, never loaded on product startup.
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.7
    return m
plaster=material('Warm mineral plaster',(.76,.67,.53));roofmat=material('Clay roof',(.35,.16,.1));frame=material('Oak',(.22,.14,.08));glass=material('Glazing',(.13,.26,.28));stone=material('Courtyard stone',(.61,.61,.54))
def box(name,loc,size,mat,kind='detail',parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);o['kind']=kind
    if parent:
        world=o.matrix_world.copy();o.parent=parent;o.matrix_world=world
    return o
house=box('TEST — courtyard house slab',(0,0,.15),(12,9,.3),stone,'building');house['homes']=2;house['floors']=2;house['use']='housing'
box('Rear wall',(0,4.35,3.2),(12,.3,6.4),plaster,parent=house)
for x in [-5.85,5.85]:box('Side wall',(x,0,3.2),(.3,9,6.4),plaster,parent=house)
box('Intermediate floor',(0,0,3.25),(11.7,8.7,.25),stone,parent=house)
# Segmented facade has actual openings at each storey.
for floor in range(2):
    z=floor*3.2
    for x in [-5.5,-3.3,-1.1,1.1,3.3,5.5]:box('Facade pier',(x,-4.35,z+1.6),(.6,.32,3.2),plaster,parent=house)
    for x in [-4.4,-2.2,0,2.2,4.4]:
        box('Sill wall',(x,-4.35,z+.4),(1.6,.32,.8),plaster,parent=house)
        box('Lintel',(x,-4.35,z+2.95),(1.6,.32,.5),plaster,parent=house)
        box('Window',(x,-4.28,z+1.7),(1.5,.06,1.8),glass,parent=house)
        for sx in [-.79,.79]:box('Window jamb',(x+sx,-4.55,z+1.7),(.07,.12,1.85),frame,parent=house)
        box('Window sill',(x,-4.56,z+.77),(1.75,.22,.09),frame,parent=house)
verts=[(-6.4,-4.9,6.4),(6.4,-4.9,6.4),(6.4,4.9,6.4),(-6.4,4.9,6.4),(-6.4,0,9),(6.4,0,9)]
mesh=bpy.data.meshes.new('Pitched roof mesh');mesh.from_pydata(verts,[],[(0,1,5,4),(4,5,2,3),(0,4,3),(1,2,5),(0,3,2,1)]);mesh.update();o=bpy.data.objects.new('Clay pitched roof',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(roofmat);o.parent=house;o.matrix_parent_inverse=house.matrix_world.inverted()
box('Courtyard',(0,-8,-.12),(19,9,.2),stone,'ground')
box('TEST — clinic access',(0,-7,.03),(2.8,5,.06),stone,'path')
