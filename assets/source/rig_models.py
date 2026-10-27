"""Original mining crawler geometry and mechanical sprite poses."""
import math
import bpy
from mesh_tools import box, cylinder, sphere, pipe, cone, text


def build_rig(state, frame, m):
    phase = frame * math.pi / 2
    # Two enclosed tracked pods, each with a separate visible wheel train.
    box('Chassis lower frame', (0, 0, .48), (2.15, 1.35, .42), m['dark'], .14)
    for y in [-.68, .68]:
        box('Track loop', (0, y, .29), (2.45, .32, .57), m['rubber'], .25)
        box('Track guard', (0, y, .58), (2.4, .36, .13), m['steel'], .04)
        for x in [-.87, -.43, 0, .43, .87]:
            cylinder('Road wheel', (x, y + (-.18 if y < 0 else .18), .29), .205, .055, m['steel'], 'Y')
            cylinder('Wheel hub', (x, y + (-.215 if y < 0 else .215), .29), .075, .065, m['white'], 'Y', 12)
        for i in range(13):
            x = -1.08 + ((i * .18 + (frame * .045 if state == 'drive' else 0)) % 2.34)
            box('Top tread cleat', (x, y, .59), (.1, .34, .045), m['dark'], .006)
            box('Lower tread cleat', (x, y, .035), (.1, .34, .045), m['steel'], .006)
    box('Pressure hull', (0, 0, 1.01), (2.16, 1.28, .95), m['yellow'], .23)
    box('Rear heat exchanger', (-.99, .1, 1.14), (.33, 1.03, .66), m['steel'], .07)
    for z in [.94, 1.08, 1.22, 1.36]:
        box('Radiator louver', (-1.175, -.08, z), (.05, .85, .045), m['dark'], .01)
    # Raised armored glass cabin gives the crawler a recognizable silhouette.
    box('Cabin frame', (.16, -.12, 1.66), (1.34, .97, .82), m['dark'], .18)
    box('Cockpit blue glazing', (.16, -.65, 1.72), (1.09, .07, .57), m['glass'], .12)
    box('Cabin roof armor', (.16, -.1, 2.08), (1.46, 1.04, .17), m['white'], .07)
    box('Window divider', (.23, -.7, 1.72), (.045, .06, .64), m['steel'], .009)
    box('Cockpit reflection', (-.2, -.702, 1.85), (.35, .018, .04), m['cyan'], .012)
    box('Side viewport', (.86, -.07, 1.69), (.05, .62, .43), m['glass'], .055)
    box('Front body inset', (.05, -.673, 1.07), (1.5, .055, .36), m['steel'], .06)
    box('Armored access hatch', (-.32, -.718, 1.07), (.5, .035, .29), m['white'], .04)
    for x in [-.53, -.11]:
        for z in [.98, 1.17]:
            cylinder('Hatch bolt', (x, -.745, z), .025, .02, m['dark'], 'Y', 8)
    text('Rig serial', '07', (.38, -.735, 1.09), .22, m['yellow'])
    for x in [-.95, .95]:
        box('Headlamp housing', (x, -.7, .83), (.3, .12, .19), m['dark'], .045)
        box('Headlamp lens', (x, -.78, .84), (.22, .055, .09), m['cyan'], .025)
    cylinder('Antenna mount', (-.62, .1, 2.19), .08, .12, m['steel'])
    cylinder('Whip antenna', (-.62, .1, 2.47), .018, .5, m['steel'], vertices=12)
    sphere('Antenna tip', (-.62, .1, 2.74), (.04, .04, .04), m['red'])
    # Every pose contains the drill mounting; cutting extends its spindle.
    if state == 'side':
        cylinder('Side swivel', (1.03, -.08, 1.03), .28, .22, m['steel'], 'X')
        cylinder('Side drill collar', (1.3, -.08, 1.03), .23, .4, m['yellow'], 'X')
        cone('Tungsten side auger', (1.86, -.08, 1.03), .31, .018, .88, m['steel'], 'X')
        for i in range(3):
            theta = phase + i * math.pi * 2 / 3
            points = []
            for j in range(25):
                t = j / 24
                angle = theta + t * math.pi * 4
                r = .3 * (1 - t) + .02
                points.append((1.42 + t * .86, -.08 + r * math.cos(angle), 1.03 + r * math.sin(angle)))
            pipe('Spiral cutting flute', points, .035, m['white'])
    else:
        cylinder('Down drill collar', (.38, -.12, .35), .24, .33, m['steel'])
        extension = 1.22 if state == 'down' else .29
        cone('Downward auger', (.38, -.12, .14 - extension / 2), .018, .29, extension, m['steel'])
        for i in range(3):
            points = []
            for j in range(25):
                t = j / 24
                angle = phase + i * math.pi * 2 / 3 + t * math.pi * 4
                r = .28 * (1 - t) + .02
                points.append((.38 + r * math.cos(angle), -.12 + r * math.sin(angle), .14 - t * extension))
            pipe('Spiral cutting flute', points, .026, m['white'])
    if state == 'flight':
        for x in [-1.12, 1.12]:
            cylinder('Thruster nacelle', (x, .25, .9), .24, .6, m['steel'])
            cylinder('Thruster rim', (x, .25, .59), .25, .12, m['white'])
            cone('Ion exhaust', (x, .25, .22), .04, .17, .68 + .12 * math.sin(phase), m['cyan'])
        cylinder('Rotor mast', (.08, .15, 2.28), .065, .33, m['steel'])
        for angle in [phase * .55, phase * .55 + math.pi / 2]:
            blade = box('Rotor blade', (.08, .15, 2.47), (2.85, .105, .045), m['steel'], .02)
            blade.rotation_euler.z = angle
        cylinder('Rotor hub', (.08, .15, 2.5), .14, .12, m['yellow'])
    if state == 'damaged':
        box('Scorched front panel', (.55, -.73, 1.04), (.65, .045, .32), m['dark'], .03)
        pipe('Broken warning cable', [(.7, -.76, 1.1), (.9, -.8, .86), (.76, -.8, .7)], .025, m['orange'])
        for x in [-.9, .92]:
            sphere('Emergency signal', (x, -.8, .83), (.06, .03, .05), m['red'])
    return [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
