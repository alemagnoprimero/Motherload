"""Original surface outpost models for the Motherload remake.

These compact industrial buildings are modeled in meters, with X horizontal,
negative Y facing the player, and Z up. No extracted game assets are used.
"""

import math

import bpy
import bmesh
from mathutils import Vector

from mesh_tools import box, cylinder, sphere, text, pipe


def _beam(name, start, end, width, material):
    a, b = Vector(start), Vector(end)
    obj = box(name, (a + b) * 0.5, (width, width, (b - a).length), material, bevel=width * 0.22)
    obj.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return obj


def _ring(name, location, major, minor, material, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=32,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def _mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.materials.append(material)
    data.update()
    mesh = bmesh.new()
    mesh.from_mesh(data)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.to_mesh(data)
    mesh.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bevel = obj.modifiers.new("Soft manufactured edges", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    obj.modifiers.new("Weighted panel normals", "WEIGHTED_NORMAL")
    return obj


def _sign(name, label, center, width, material, letters):
    x, y, z = center
    box(name + " frame", (x, y, z), (width, 0.13, 0.36), material, bevel=0.045)
    # mesh_tools.text faces negative Y and uses centered alignment.
    text(name + " lettering", label, (x, y - 0.076, z), 0.22, letters)


def _platform(name, materials, accent):
    m = materials
    box(name + " foundation", (0, 0, 0.075), (4.35, 2.18, 0.15), m["dark"], bevel=0.10)
    box(name + " deck", (0, 0, 0.175), (4.16, 2.03, 0.08), m["steel"], bevel=0.06)
    # Narrow deck joints, edge protection and modular anchor bolts.
    for x in (-1.25, 0, 1.25):
        box(name + " deck joint", (x, 0, 0.22), (0.016, 1.88, 0.012), m["dark"], bevel=0.003)
    for x in (-2.01, 2.01):
        for y in (-0.91, 0.91):
            cylinder(name + " anchor", (x, y, 0.235), 0.07, 0.04, m["steel"], vertices=8)
    for x in (-1.7, -1.4, -1.1, 1.1, 1.4, 1.7):
        stripe = box(name + " hazard stripe", (x, -0.98, 0.23), (0.14, 0.13, 0.014), accent, bevel=0.005)
        stripe.rotation_euler.z = -0.45
    for x in (-2.01, 2.01):
        box(name + " corner lamp", (x, -0.91, 0.31), (0.11, 0.08, 0.12), m["cyan"], bevel=0.025)


def _cabinet(name, center, size, materials, accent):
    x, y, z = center
    width, depth, height = size
    m = materials
    box(name + " chassis", center, size, m["dark"], bevel=0.06)
    box(name + " skin", (x, y - depth * 0.10, z + 0.025), (width - 0.10, depth, height - 0.07), m["white"], bevel=0.065)
    box(name + " panel", (x, y - depth * 0.52, z + height * 0.12), (width * 0.72, 0.045, height * 0.46), accent, bevel=0.03)
    for i in range(4):
        box(name + " vent", (x, y - depth * 0.55, z - height * 0.26 + i * 0.055), (width * 0.55, 0.025, 0.018), m["dark"], bevel=0.003)


def _exchange(m):
    _platform("Exchange", m, m["yellow"])
    # Heavy sorting hall on the right; an open receiving hopper distinguishes
    # the exchange silhouette from the other surface service buildings.
    box("Exchange sorting hall", (0.7, 0.26, 0.93), (2.38, 1.40, 1.42), m["white"], bevel=0.12)
    box("Exchange dark apron", (0.7, -0.48, 0.65), (2.18, 0.10, 0.72), m["dark"], bevel=0.04)
    box("Exchange canopy", (0.7, 0.19, 1.73), (2.62, 1.65, 0.19), m["steel"], bevel=0.08)
    box("Exchange roof ridge", (0.7, 0.31, 1.86), (1.96, 1.07, 0.11), m["yellow"], bevel=0.045)
    for x in (-0.40, 0.28, 0.96, 1.63):
        box("Exchange wall rib", (x, -0.50, 0.97), (0.065, 0.08, 1.30), m["steel"], bevel=0.015)
    _sign("Exchange sign", "ORE", (0.65, -0.64, 1.50), 1.76, m["dark"], m["yellow"])
    for x in (0.0, 0.62, 1.24):
        box("Exchange display glass", (x, -0.55, 1.13), (0.43, 0.035, 0.26), m["glass"], bevel=0.03)
        box("Exchange display glint", (x, -0.574, 1.22), (0.31, 0.012, 0.018), m["cyan"], bevel=0.005)
    # Wide upper hopper with sloping sides and a dark, open mouth.
    outer = [(-1.95, -0.39, 1.55), (-0.77, -0.39, 1.55), (-0.77, 0.71, 1.55), (-1.95, 0.71, 1.55)]
    throat = [(-1.64, -0.12, 0.79), (-1.07, -0.12, 0.79), (-1.07, 0.44, 0.79), (-1.64, 0.44, 0.79)]
    _mesh("Exchange receiving hopper", outer + throat, [(0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], m["yellow"])
    box("Exchange hopper interior", (-1.36, 0.16, 1.40), (0.92, 0.85, 0.055), m["dark"], bevel=0.025)
    for a, b in zip(outer, outer[1:] + outer[:1]):
        _beam("Exchange hopper rim", a, b, 0.08, m["steel"])
    for x in (-1.82, -0.89):
        for y in (-0.26, 0.60):
            _beam("Exchange hopper leg", (x, y, 0.22), (x, y, 1.33), 0.085, m["steel"])
    box("Exchange conveyor belt", (-1.34, -0.44, 0.55), (0.75, 1.15, 0.16), m["rubber"], bevel=0.06)
    for y in (-0.89, -0.65, -0.41, -0.17):
        cylinder("Exchange conveyor roller", (-1.34, y, 0.50), 0.10, 0.84, m["steel"], axis="X", vertices=16)
        box("Exchange belt rib", (-1.34, y, 0.64), (0.69, 0.045, 0.025), m["dark"], bevel=0.005)
    for x, y, z, scale in ((-1.5, -0.66, 0.72, 0.15), (-1.14, -0.36, 0.75, 0.18), (-1.48, -0.13, 0.76, 0.12)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=scale, location=(x, y, z))
        bpy.context.object.name = "Exchange sample ore"
        bpy.context.object.data.materials.append(m["orange"])
    # Short exhaust stack, intake and numbered loading bins.
    cylinder("Exchange chimney", (1.48, 0.53, 2.02), 0.16, 0.50, m["steel"])
    cylinder("Exchange chimney cap", (1.48, 0.53, 2.30), 0.23, 0.08, m["dark"])
    _cabinet("Exchange storage bin", (1.67, -0.80, 0.48), (0.48, 0.37, 0.51), m, m["yellow"])
    pipe("Exchange exterior duct", [(1.88, 0.48, 0.50), (1.96, 0.48, 0.50), (1.96, 0.48, 1.32), (1.83, 0.48, 1.32)], 0.07, m["steel"])


def _fuel(m):
    _platform("Fuel", m, m["orange"])
    box("Fuel tank raft", (0.20, 0.33, 0.36), (3.60, 1.20, 0.27), m["dark"], bevel=0.08)
    # Three pressurized upright tanks, collars and protective hoops.
    for index, x in enumerate((-1.02, 0.16, 1.34)):
        cylinder("Fuel pressure vessel", (x, 0.35, 1.16), 0.47, 1.35, m["white"], vertices=32)
        sphere("Fuel rounded crown", (x, 0.35, 1.84), (0.47, 0.47, 0.26), m["white"])
        cylinder("Fuel lower collar", (x, 0.35, 0.57), 0.495, 0.12, m["steel"])
        cylinder("Fuel upper collar", (x, 0.35, 1.68), 0.492, 0.11, m["orange"])
        box("Fuel tank number panel", (x, -0.128, 1.22), (0.51, 0.045, 0.38), m["orange"], bevel=0.04)
        text("Fuel vessel identifier", f"0{index + 1}", (x, -0.158, 1.15), 0.21, m["dark"])
        cylinder("Fuel top valve", (x, 0.35, 2.15), 0.075, 0.15, m["steel"], vertices=12)
        cylinder("Fuel valve wheel", (x, 0.35, 2.25), 0.16, 0.035, m["red"], vertices=12)
        pipe("Fuel tank outlet", [(x, -0.12, 0.76), (x, -0.36, 0.76), (x, -0.36, 0.38)], 0.058, m["steel"])
    pipe("Fuel distribution manifold", [(-1.60, -0.35, 0.38), (1.68, -0.35, 0.38)], 0.075, m["orange"])
    for x in (-1.73, 1.84):
        _beam("Fuel protective post", (x, -0.89, 0.22), (x, -0.89, 0.70), 0.105, m["yellow"])
        cylinder("Fuel post collar", (x, -0.89, 0.56), 0.075, 0.10, m["dark"], vertices=12)
    # Foreground dispenser with a luminous meter and a curved delivery hose.
    _cabinet("Fuel pump", (-0.35, -0.72, 0.76), (0.70, 0.49, 1.08), m, m["orange"])
    box("Fuel meter glass", (-0.35, -0.99, 1.05), (0.43, 0.028, 0.23), m["glass"], bevel=0.02)
    for x in (-0.46, -0.30, -0.14):
        box("Fuel meter digit", (x, -1.011, 1.05), (0.075, 0.014, 0.10), m["cyan"], bevel=0.009)
    pipe("Fuel hose", [(0.00, -0.72, 1.15), (0.34, -0.78, 1.07), (0.42, -0.81, 0.43), (0.65, -0.85, 0.37), (0.77, -0.88, 0.77)], 0.045, m["rubber"])
    _beam("Fuel delivery nozzle", (0.77, -0.88, 0.77), (0.88, -0.88, 0.96), 0.10, m["steel"])
    # Freestanding illuminated service sign preserves the tanks' clear shape.
    _beam("Fuel sign mast", (-1.77, 0.37, 0.22), (-1.77, 0.37, 2.35), 0.09, m["steel"])
    _sign("Fuel sign", "FUEL", (-1.32, 0.27, 2.36), 1.21, m["dark"], m["orange"])
    cylinder("Fuel beacon base", (1.89, 0.72, 0.40), 0.11, 0.34, m["steel"])
    cylinder("Fuel beacon", (1.89, 0.72, 0.63), 0.09, 0.16, m["orange"])


def _repair(m):
    _platform("Repair", m, m["cyan"])
    # Open front garage: a dark interior, side cabinets and a visible lifting
    # gantry give this asset a useful silhouette even at thumbnail size.
    box("Repair rear wall", (-0.32, 0.78, 1.10), (3.06, 0.23, 1.78), m["dark"], bevel=0.07)
    box("Repair back panel", (-0.32, 0.64, 1.12), (2.84, 0.055, 1.42), m["steel"], bevel=0.04)
    for x in (-1.80, 1.13):
        box("Repair garage pier", (x, 0.07, 1.15), (0.23, 1.55, 1.88), m["white"], bevel=0.055)
        box("Repair garage footing", (x, -0.51, 0.37), (0.37, 0.38, 0.30), m["dark"], bevel=0.045)
        box("Repair pier marker", (x, -0.735, 0.82), (0.13, 0.025, 0.36), m["cyan"], bevel=0.015)
    box("Repair canopy", (-0.33, 0.08, 2.15), (3.44, 1.87, 0.22), m["white"], bevel=0.09)
    box("Repair roof inset", (-0.33, 0.20, 2.29), (2.98, 1.28, 0.09), m["steel"], bevel=0.045)
    for x in (-1.45, -0.9, -0.35, 0.20, 0.75):
        box("Repair roof rib", (x, 0.20, 2.36), (0.065, 1.32, 0.045), m["dark"], bevel=0.01)
    _sign("Repair sign", "REPAIR", (-0.33, -0.90, 2.10), 2.39, m["dark"], m["cyan"])
    box("Repair overhead work light", (-0.33, -0.50, 1.99), (2.30, 0.10, 0.065), m["cyan"], bevel=0.02)
    # Twin lift rails with short jack pistons.
    for x in (-1.02, 0.28):
        box("Repair lift rail", (x, -0.03, 0.32), (0.29, 1.70, 0.17), m["yellow"], bevel=0.04)
        box("Repair lift tread", (x, -0.03, 0.42), (0.21, 1.49, 0.028), m["dark"], bevel=0.01)
        for y in (-0.51, 0.47):
            cylinder("Repair jack piston", (x, y, 0.48), 0.075, 0.21, m["steel"], vertices=16)
    _beam("Repair gantry rail", (-1.57, 0.31, 1.79), (0.90, 0.31, 1.79), 0.13, m["yellow"])
    box("Repair crane trolley", (0.12, 0.31, 1.77), (0.36, 0.30, 0.28), m["orange"], bevel=0.04)
    pipe("Repair hanging cable", [(0.12, 0.31, 1.64), (0.12, 0.31, 1.10)], 0.022, m["dark"])
    pipe("Repair crane hook", [(0.12, 0.31, 1.10), (0.03, 0.31, 1.01), (0.08, 0.31, 0.91), (0.21, 0.31, 0.91), (0.28, 0.31, 1.02)], 0.043, m["yellow"])
    # Toolboard and separate compressed-air equipment.
    for x in (-1.15, -0.86, -0.57):
        _beam("Repair hanging tool", (x, 0.58, 0.94), (x + 0.08, 0.58, 1.28), 0.047, m["yellow"])
        _ring("Repair tool head", (x + 0.08, 0.57, 1.31), 0.06, 0.019, m["steel"])
    _cabinet("Repair side toolbox", (1.66, 0.20, 0.80), (0.70, 0.95, 1.16), m, m["cyan"])
    for z in (0.50, 0.69, 0.88):
        box("Repair drawer handle", (1.66, -0.30, z), (0.32, 0.045, 0.035), m["steel"], bevel=0.01)
    cylinder("Repair compressor tank", (1.66, 0.34, 1.67), 0.24, 0.67, m["cyan"], axis="Y", vertices=24)
    cylinder("Repair pressure dial", (1.66, -0.04, 1.68), 0.12, 0.045, m["white"], axis="Y", vertices=24)
    pipe("Repair air hose", [(1.87, 0.13, 1.66), (2.00, 0.03, 1.43), (2.00, -0.42, 0.45), (1.80, -0.64, 0.30)], 0.034, m["orange"])


def _upgrades(m):
    _platform("Upgrade", m, m["purple"])
    box("Upgrade workshop foundation", (0.12, 0.15, 0.38), (3.77, 1.61, 0.32), m["dark"], bevel=0.08)
    box("Upgrade workshop body", (0.12, 0.25, 1.12), (3.47, 1.48, 1.29), m["white"], bevel=0.14)
    box("Upgrade dark facade", (0.12, -0.55, 1.05), (3.20, 0.15, 1.08), m["dark"], bevel=0.065)
    # Slanted segmented roof with visible structural end caps.
    vertices = [(-1.80, -0.63, 1.78), (2.02, -0.63, 1.78), (2.02, 0.96, 1.99), (-1.80, 0.96, 1.99),
                (-1.80, -0.63, 1.96), (2.02, -0.63, 1.96), (2.02, 0.96, 2.17), (-1.80, 0.96, 2.17)]
    _mesh("Upgrade sloping roof", vertices, [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], m["steel"])
    for x in (-1.37, -0.65, 0.07, 0.79, 1.51):
        _beam("Upgrade roof fin", (x, -0.60, 1.98), (x, 0.91, 2.19), 0.055, m["purple"])
    _sign("Upgrade sign", "UPGRADES", (0.12, -0.74, 1.67), 2.82, m["dark"], m["purple"])
    for x in (-1.20, 1.36):
        box("Upgrade facade window", (x, -0.649, 1.09), (0.59, 0.035, 0.60), m["glass"], bevel=0.045)
        for z in (0.90, 1.07, 1.24):
            box("Upgrade illuminated status strip", (x, -0.675, z), (0.41, 0.018, 0.035), m["cyan"], bevel=0.008)
    # The exposed assembly cradle contains an actual three-dimensional engine
    # core with machined concentric collars and a cyan emission chamber.
    box("Upgrade assembly cradle", (0.12, -0.79, 0.50), (1.09, 0.51, 0.30), m["steel"], bevel=0.07)
    cylinder("Upgrade engine core", (0.12, -0.69, 0.98), 0.34, 0.46, m["dark"], axis="Y", vertices=32)
    cylinder("Upgrade engine glow", (0.12, -0.95, 0.98), 0.24, 0.06, m["cyan"], axis="Y", vertices=32)
    _ring("Upgrade engine collar", (0.12, -1.00, 0.98), 0.31, 0.06, m["steel"])
    for angle in range(0, 360, 60):
        a = math.radians(angle)
        cylinder("Upgrade engine collar bolt", (0.12 + math.sin(a) * 0.31, -1.065, 0.98 + math.cos(a) * 0.31), 0.035, 0.035, m["yellow"], axis="Y", vertices=8)
    # A small rooftop communications dish, supported by a triangular mount.
    _beam("Upgrade antenna mast", (1.33, 0.44, 2.11), (1.33, 0.44, 2.48), 0.065, m["steel"])
    dish = sphere("Upgrade communications dish", (1.36, 0.40, 2.45), (0.32, 0.10, 0.22), m["white"])
    dish.rotation_euler.x = math.radians(-22)
    _beam("Upgrade antenna receiver", (1.36, 0.29, 2.44), (1.36, 0.06, 2.54), 0.035, m["purple"])
    _cabinet("Upgrade power module", (-1.61, -0.68, 0.52), (0.45, 0.43, 0.59), m, m["purple"])
    pipe("Upgrade power conduit", [(-1.80, -0.45, 0.56), (-1.97, -0.40, 0.56), (-1.97, 0.54, 0.56), (-1.66, 0.54, 0.99)], 0.06, m["steel"])


def build_station(kind, materials):
    """Build one station and return its newly created Blender objects."""
    factories = {"exchange": _exchange, "fuel": _fuel, "repair": _repair, "upgrades": _upgrades}
    if kind not in factories:
        raise ValueError(f"Unknown station: {kind}")
    existing = set(bpy.context.scene.objects)
    factories[kind](materials)
    created = [obj for obj in bpy.context.scene.objects if obj not in existing]
    # Text curves need conversion to remain part of exported GLB models.
    for obj in list(created):
        if obj.type == "FONT":
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target="MESH")
    return sorted(created, key=lambda obj: obj.name)
