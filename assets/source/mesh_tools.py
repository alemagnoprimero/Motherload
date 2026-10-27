"""Small reusable mesh helpers for the independently authored Frontier art kit."""
import math
import bpy
from mathutils import Vector


def material(name, color, metallic=0.0, roughness=0.5, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


def finish(obj, name, mat, bevel=0):
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
        modifier.affect = 'EDGES'
        modifier = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
        modifier.keep_sharp = True
    return obj


def box(name, loc, size, material, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material, bevel)


def cylinder(name, loc, radius, depth, material, axis='Z', vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    if axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    finish(obj, name, material, .02)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def sphere(name, loc, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(obj, name, material)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def text(name, body, loc, size, material):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.extrude = .004
    obj.data.materials.append(material)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def pipe(name, points, radius, material):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, xyz in zip(spline.points, points):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def cone(name, loc, radius1, radius2, depth, mat, axis='Z', vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc)
    obj = bpy.context.object
    if axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    return finish(obj, name, mat, .015)


def default_materials():
    return {
        'yellow': material('Saffron ceramic armor', (.93, .48, .075), .38, .3),
        'white': material('Ivory enamel', (.73, .77, .69), .28, .35),
        'steel': material('Brushed graphite alloy', (.17, .24, .29), .76, .29),
        'dark': material('Charcoal structural steel', (.035, .055, .071), .55, .42),
        'glass': material('Glacial blue cockpit glass', (.10, .65, .82), .7, .12, .12),
        'cyan': material('Cyan instrument lighting', (.15, .9, 1), .28, .24, 3),
        'orange': material('Coral warning enamel', (.94, .21, .055), .25, .36),
        'purple': material('Violet equipment housing', (.34, .22, .61), .35, .3),
        'red': material('Red hazard light', (.95, .055, .025), .2, .2, 2),
        'rubber': material('Carbon tread compound', (.018, .027, .031), .08, .7),
    }
