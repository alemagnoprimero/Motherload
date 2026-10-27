"""Render original mesh assets with Blender; called by scripts/build-assets.mjs."""
import argparse
import json
import math
import os
from pathlib import Path
import random
import sys
import bpy
from mathutils import Vector

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
from mesh_tools import default_materials, material, box, cylinder, sphere, cone, finish
from rig_models import build_rig

ROOT = SOURCE.parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--only')
parser.add_argument('--samples', type=int, default=64)
parser.add_argument('--output', default=str(ROOT / '.cache/asset-renders'))
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
OUT = Path(args.output)
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'assets/models').mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def setup(width, height, target=(0, 0, .9), scale=4.5, direction=(4, -10, 5)):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    # Debian's Blender build can omit OpenImageDenoise. Low-resolution studio
    # bakes use deterministic CPU samples and do not depend on that optional lib.
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 40
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = min(8, os.cpu_count() or 4)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.36, .44, .55, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .36
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .45
    for name, location, energy, color, size in [
        ('Large warm key', (-4, -6, 8), 1150, (1, .82, .61), 5),
        ('Cool rim softbox', (5, 3, 6), 1400, (.38, .69, 1), 4),
        ('Front fill', (2, -5, 2.5), 350, (.62, .89, 1), 4),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.color = color
        data.shape = 'DISK'
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        aim(obj, target)
    camera = bpy.data.cameras.new('Orthographic asset camera')
    camera.type = 'ORTHO'
    camera.ortho_scale = scale
    obj = bpy.data.objects.new('Orthographic asset camera', camera)
    scene.collection.objects.link(obj)
    obj.location = Vector(target) + Vector(direction)
    aim(obj, target)
    scene.camera = obj
    return obj


def fit_camera(camera, meshes, padding=1.08, bottom_align=False):
    bpy.context.view_layer.update()
    right = camera.rotation_euler.to_quaternion() @ Vector((1, 0, 0))
    up = camera.rotation_euler.to_quaternion() @ Vector((0, 1, 0))
    positions = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    xs = [point.dot(right) for point in positions]
    ys = [point.dot(up) for point in positions]
    aspect = bpy.context.scene.render.resolution_x / bpy.context.scene.render.resolution_y
    # Blender's orthographic scale is the horizontal span for these landscape
    # camera frames; vertical span is scale/aspect. Keep every mesh in frame.
    scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * aspect) * padding
    camera.data.ortho_scale = scale
    desired_x = (max(xs) + min(xs)) / 2
    desired_y = (max(ys) + min(ys)) / 2
    if bottom_align:
        vertical_span = scale / aspect
        desired_y = min(ys) + vertical_span / 2 - vertical_span * .025
    current_x = camera.location.dot(right)
    current_y = camera.location.dot(up)
    camera.location += right * (desired_x - current_x) + up * (desired_y - current_y)


ORE_COLORS = {
    3: ('Ironium', (.42, .30, .22), .83),
    9: ('Bronzium', (.66, .28, .10), .8),
    10: ('Silverium', (.76, .85, .93), .95),
    4: ('Goldium', (1, .6, .10), .85),
    11: ('Platinium', (.56, .57, .8), .91),
    12: ('Einsteinium', (.23, .68, .41), .45),
    5: ('Emerald', (.025, .68, .35), .48),
    13: ('Ruby', (.83, .04, .18), .52),
    6: ('Diamond', (.43, .81, 1), .65),
    14: ('Amazonite', (.045, .93, .77), .5),
}


def crystal(name, loc, radius, height, mat, sides=6):
    vertices = [(0, 0, -height / 2)]
    vertices += [(math.cos(i * math.tau / sides) * radius, math.sin(i * math.tau / sides) * radius, -height * .2) for i in range(sides)]
    vertices += [(math.cos(i * math.tau / sides) * radius * .8, math.sin(i * math.tau / sides) * radius * .8, height * .25) for i in range(sides)]
    vertices.append((0, 0, height / 2))
    faces = []
    for i in range(sides):
        j = (i + 1) % sides
        faces += [(0, j + 1, i + 1), (i + 1, j + 1, j + sides + 1, i + sides + 1), (i + sides + 1, j + sides + 1, 2 * sides + 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return obj


def build_ore(ore):
    name, color, metallic = ORE_COLORS[ore]
    mat = material(name + ' mineral surface', color, metallic, .22 if ore >= 5 else .32, .12 if ore in [5, 12, 13, 14] else 0)
    rng = random.Random(ore * 107)
    if ore in [3, 9, 10]:
        for i in range(7):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1 if ore == 3 else 2, radius=.36, location=(rng.uniform(-.5, .5), rng.uniform(-.22, .22), rng.uniform(-.42, .42)))
            obj = bpy.context.object
            obj.scale = (1.1, .65, .72 if ore != 10 else 1.4)
            finish(obj, name + ' metallic nugget', mat, .025 if ore != 3 else 0)
    elif ore in [4, 11]:
        for i, (x, z) in enumerate([(-.37, -.22), (.33, -.16), (.08, .38)]):
            obj = box(name + ' cuboid crystal', (x, 0, z), (.68, .43, .48), mat, .08 if ore == 4 else .035)
            obj.rotation_euler = (.1, -.2 + i * .18, .15)
    elif ore == 12:
        for i in range(6):
            angle = i * math.tau / 6
            crystal(name + ' radial crystal', (math.cos(angle) * .4, .06, math.sin(angle) * .4), .2, .48, mat, 5)
        sphere(name + ' luminous core', (0, -.16, 0), (.34, .23, .34), mat)
    elif ore == 6:
        crystal(name + ' octahedral jewel', (0, 0, 0), .7, 1.3, mat, 8)
    else:
        for i, (x, z, h) in enumerate([(-.38, -.1, .95), (.06, .16, 1.45), (.43, -.18, .75)]):
            obj = crystal(name + ' prismatic cluster', (x, 0, z), .26, h, mat, 6 if ore != 13 else 5)
            obj.rotation_euler.y = -.25 + i * .23
    return [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']


def export_model(filename, meshes):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'assets/models' / filename), export_format='GLB', use_selection=True, export_apply=True, export_materials='EXPORT')


frames = []
definitions = []
for state in ['idle', 'drive', 'flight', 'side', 'down', 'damaged']:
    for frame in range(1 if state in ['idle', 'damaged'] else 4):
        definitions.append((f'rig-{state}-{frame}', 'rig', state, frame, 160, 160))
for kind in ['exchange', 'fuel', 'repair', 'upgrades']:
    definitions.append((f'building-{kind}', 'building', kind, 0, 384, 256))
for ore in ORE_COLORS:
    definitions.append((f'ore-{ore}', 'ore', ore, 0, 96, 96))

for name, kind, variant, frame, width, height in definitions:
    if args.only and not name.startswith(args.only):
        continue
    clear_scene()
    m = default_materials()
    if kind == 'rig':
        meshes = build_rig(variant, frame, m)
        camera = setup(width, height, target=(0, 0, 1.0), scale=4.7, direction=(3, -10, 4.5))
        if variant == 'idle':
            export_model('prospector.glb', meshes)
    elif kind == 'building':
        from station_models import build_station
        meshes = build_station(variant, m)
        camera = setup(width, height, target=(0, 0, 1.1), direction=(5, -12, 6))
        fit_camera(camera, meshes, bottom_align=True)
        export_model(f'{variant}-station.glb', meshes)
    else:
        meshes = build_ore(variant)
        camera = setup(width, height, target=(0, 0, 0), direction=(1.5, -8, 2), scale=1.9)
        fit_camera(camera, meshes, padding=1.25)
        export_model(f'ore-{variant}.glb', meshes)
    bpy.context.scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)
    frames.append({'name': name, 'width': width, 'height': height, 'file': f'{name}.png'})
    print(f'FRONTIER_ASSET {name}', flush=True)

manifest_file = OUT / 'manifest.json'
if args.only and manifest_file.exists():
    previous = {frame['name']: frame for frame in json.loads(manifest_file.read_text())['frames']}
    previous.update({frame['name']: frame for frame in frames})
    frames = list(previous.values())
manifest_file.write_text(json.dumps({'frames': frames, 'blender': bpy.app.version_string, 'samples': args.samples}, indent=2))
