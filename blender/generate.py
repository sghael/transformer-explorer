"""Generate the original schematic asset with Blender 4.5 LTS.

Run: blender --background --factory-startup --python blender/generate.py
Coordinates passed to helpers use the browser's X-right, Y-up, Z-depth frame.
The standard glTF exporter reverses our (x, -z, y) Blender conversion.
"""
import json
from collections import Counter
from pathlib import Path
from math import cos, sin, tau

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "shared/model-spec.json").read_text())
LAYOUT = json.loads((ROOT / "shared/layout.json").read_text())
assert LAYOUT["schema_version"] == 2
A = SPEC["architecture"]
assert SPEC["schema_version"] == 1
assert A["attention_heads"] == A["kv_heads"] * 4
assert A["hidden_size"] == A["attention_heads"] * A["head_dim"]

PALETTE = {
    "slate": (0.19, 0.29, 0.37, 1), "teal": (0.12, 0.66, 0.59, 1),
    "blue": (0.20, 0.48, 0.82, 1), "amber": (0.92, 0.60, 0.22, 1),
    "purple": (0.60, 0.41, 0.82, 1), "white": (0.78, 0.84, 0.85, 1),
    "path": (0.29, 0.39, 0.44, 1),
}
MATERIALS = {}
MESHES = {}


def convert(p):
    return (p[0], -p[2], p[1])


def browser(p):
    return [round(p[0], 6), round(p[2], 6), round(-p[1], 6)]


def camera_anchors():
    """World-space anchor pose per view camera in layout.json."""
    anchors = {}
    for camera in LAYOUT["cameras"].values():
        scale = LAYOUT["focus_scale"] if camera["frame"] == "layer" else 1
        anchors[camera["anchor"]] = tuple(tuple(v*scale for v in camera[key]) for key in ("position", "target"))
    return anchors


def node(identifier, component, parent=None, pos=(0, 0, 0), lod=1,
         interactive=True, name=None, layer=-1, mesh=None, **extras):
    obj = bpy.data.objects.new(name or identifier, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = convert(pos)
    metadata = dict(schema_version=1, id=identifier, component=component,
                    layer=layer, lod=lod, interactive=interactive,
                    description_key=component)
    metadata.update(extras)
    for key, value in metadata.items():
        obj[key] = value
    return obj


def mesh_shape(size, profile, frame_bar=None):
    """Keep the specified outer bounds while distinguishing operations from sheets."""
    vertices, faces = [], []

    def cuboid(dimensions, center=(0, 0, 0)):
        x, y, z = [v / 2 for v in dimensions]
        offset = len(vertices)
        for point in [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
                      (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)]:
            vertices.append(convert(tuple(a+b for a,b in zip(point, center))))
        for face in [(0,3,2,1), (4,5,6,7), (0,1,5,4), (1,2,6,5),
                     (2,3,7,6), (3,0,4,7)]:
            faces.append(tuple(i + offset for i in face))

    if profile == "normalization_disk":
        # A solid disk normalizes an activation vector; open frames contain subgraphs.
        x, y, z = size
        assert y == z
        segments = 32
        for side in [-1, 1]:
            for i in range(segments):
                angle = tau * i / segments
                vertices.append(convert((side*x/2, y/2*cos(angle), z/2*sin(angle))))
        vertices.extend([convert((-x/2,0,0)), convert((x/2,0,0))])
        for i in range(segments):
            nxt = (i+1) % segments
            faces.extend([(i,nxt,nxt+segments,i+segments),
                          (2*segments,nxt,i), (2*segments+1,i+segments,nxt+segments)])
    elif profile == "skeletal_frame":
        # Twelve narrow edge bars leave every face open for physical navigation.
        assert frame_bar is not None
        bar = frame_bar
        for axis in range(3):
            others = [i for i in range(3) if i != axis]
            for a in [-1, 1]:
                for b in [-1, 1]:
                    dimensions = [bar, bar, bar]
                    dimensions[axis] = size[axis]
                    center = [0, 0, 0]
                    center[others[0]] = a * (size[others[0]] - bar) / 2
                    center[others[1]] = b * (size[others[1]] - bar) / 2
                    cuboid(dimensions, center)
        radius = bar * .12
    else:
        cuboid(size)
        radius = min(.12, min(size) * .16)
    mesh = bpy.data.meshes.new(f"{profile}_{len(MESHES)}")
    mesh.from_pydata(vertices, [], faces)
    if profile not in {"slab", "skeletal_frame", "normalization_disk"}:
        topology = bmesh.new()
        topology.from_mesh(mesh)
        bmesh.ops.bevel(topology, geom=list(topology.edges), offset=radius,
                        segments=3, affect="EDGES", clamp_overlap=True)
        topology.to_mesh(mesh)
        topology.free()
    if profile == "normalization_disk":
        for polygon in mesh.polygons:
            polygon.use_smooth = len(polygon.vertices) == 4
    mesh.update()
    return mesh


def box(identifier, component, parent, pos, size, color="slate", **extras):
    operations = {"expert", "moe_router", "weighted_merge", "input", "output",
                  "silu", "elementwise_multiply", "rms_norm", "attention_weighted_sum", "rotary_position_operation"}
    profile = ("normalization_disk" if component == "rms_norm" else
               "skeletal_frame" if component in {"decoder_layer", "expert"} else
               "rounded_operation" if component in operations else "slab")
    # Equivalent path lengths can differ by floating-point subtraction noise.
    size = tuple(round(value, 6) for value in size)
    frame_bar = .0015 if component == "decoder_layer" else .025 if component == "expert" else None
    if frame_bar is not None:
        extras["frame_bar_thickness"] = frame_bar
    key = (size, color, profile, frame_bar)
    if key not in MESHES:
        mesh = mesh_shape(size, profile, frame_bar)
        mesh.materials.append(MATERIALS[color])
        MESHES[key] = mesh
    return node(identifier, component, parent, pos, mesh=MESHES[key],
                geometry_profile=profile, **extras)


def path(identifier, parent, points, color="path", component="connection",
         thickness=.055, **extras):
    points = [point for i, point in enumerate(points)
              if i == 0 or any(abs(a-b) > 1e-6 for a,b in zip(point, points[i-1]))]
    root = node(identifier, component, parent, interactive=False, **extras)
    for i, (a, b) in enumerate(zip(points, points[1:])):
        delta = Vector(b) - Vector(a)
        axis = max(range(3), key=lambda n: abs(delta[n]))
        assert sum(abs(delta[n]) > 1e-6 for n in range(3)) == 1
        size = [thickness, thickness, thickness]
        size[axis] = abs(delta[axis])
        center = [(a[n] + b[n]) / 2 for n in range(3)]
        box(f"{identifier}_segment_{i}", component, root, center, size, color,
            interactive=False, **extras)
    return root


def addition(identifier, parent, x):
    obj = node(identifier, "residual_add", parent, (x, 0, 0))
    box(identifier + "_horizontal", "residual_add", obj, (0,0,0),
        (.48,.12,.22), "white")
    box(identifier + "_vertical", "residual_add", obj, (0,0,0),
        (.12,.48,.22), "white")


def generate():
    MATERIALS.clear()
    MESHES.clear()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials):
        for item in list(collection):
            collection.remove(item)
    for key, rgba in PALETTE.items():
        material = bpy.data.materials.new(key)
        material.diffuse_color = rgba
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = .8
        bsdf.inputs["Metallic"].default_value = 0.0
        MATERIALS[key] = material

    root = node("model", "model", name="MODEL_ROOT", interactive=False, lod=0,
                asset_version="1.0.0", illustrative=True)
    stack = node("stack", "layer_stack", root, name="LAYER_STACK", lod=0)
    dimensions = LAYOUT["layer_dimensions"]
    half_x = dimensions[0] / 2
    box("representative_layer", "decoder_layer", stack, (0,0,0),
        dimensions, "slate", layer=-1, lod=0, representative=True)
    for identifier, color, component in [
        ("input", "white", "input"), ("embedding", "teal", "embedding"),
        ("final_norm", "amber", "rms_norm"), ("lm_head", "blue", "lm_head"),
        ("output", "white", "output"),
    ]:
        layout = LAYOUT["macro_nodes"][identifier]
        box(identifier, component, root, (layout["x"],0,0), layout["size"], color, lod=0)
    def macro_face(identifier, side):
        layout = LAYOUT["macro_nodes"][identifier]
        return layout["x"] + side * layout["size"][0]/2
    for identifier, start, end in [
        ("overview_input", macro_face("input",1), macro_face("embedding",-1)),
        ("overview_embed", macro_face("embedding",1), -half_x),
        ("overview_final", half_x, macro_face("final_norm",-1)),
        ("overview_norm", macro_face("final_norm",1), macro_face("lm_head",-1)),
        ("overview_output", macro_face("lm_head",1), macro_face("output",-1)),
    ]:
        assert start < end
        path(identifier, root, [(start,0,0),(end,0,0)], lod=0)
    feedback_right = macro_face("output",1) + .5
    feedback_left = macro_face("input",-1) - .45
    path("generation_feedback", root,
         [(macro_face("output",1),0,0),(feedback_right,0,0),(feedback_right,0,LAYOUT["feedback_z"]),
          (feedback_left,0,LAYOUT["feedback_z"]),(feedback_left,0,0),(macro_face("input",-1),0,0)],
         thickness=.025, lod=0)

    focus = node("focus", "focus_layer", root, name="FOCUS_LAYER", interactive=False)
    path("focus_input", focus, [(-11,0,0),(-9,0,0)], thickness=.025)
    path("focus_output", focus, [(10.24,0,0),(11,0,0)], thickness=.025)
    stream = node("residual_stream", "connection", focus, interactive=False)
    for i, (start, end) in enumerate([(-9,-8.11),(-7.89,-7),(-2.675,-2.24),
                                     (-1.76,-.11),(.11,1.75),(8.25,9.76)]):
        path(f"residual_stage_{i}", stream, [(start,0,0),(end,0,0)], thickness=.025)
    for identifier, x in [("norm1", -8), ("norm2", 0)]:
        box(identifier, "rms_norm", focus, (x,0,0), (.22,.5,.5), "amber")
    addition("add1", focus, -2)
    addition("add2", focus, 10)
    path("residual_attention", focus, [(-9,0,0),(-9,0,-5.4),(-2,0,-5.4),(-2,0,0)],
         "amber", component="residual_bypass")
    path("residual_moe", focus, [(-1,0,0),(-1,0,5.4),(10,0,5.4),(10,0,0)],
         "amber", component="residual_bypass")

    attention = node("attention", "attention", focus, (-5,0,0), name="ATTENTION_ROOT")
    for g in range(A["kv_heads"]):
        zg = (g-3.5)*1.2
        path(f"attention_input_{g}", focus, [(-7,0,0),(-7,0,zg)],
             thickness=.025, group=g)
        group = node(f"group_{g}", "gqa_group", attention, (0,0,(g-3.5)*1.2),
                     lod=2, group=g)
        path(f"group_input_{g}", group, [(-2,0,0),(-2,-.35,0)],
             thickness=.025, group=g)
        for h in range(4):
            box(f"q_{g*4+h}", "query_head", group, (-.9,1,(h-1.5)*.21),
                (.65,1.35,.065), "blue", lod=2, group=g, head=g*4+h,
                dimensions=f"{A['hidden_size']} × {A['head_dim']}")
            zj = (h-1.5)*.21
            path(f"q_input_{g*4+h}", group,
                 [(-2,-.35,0),(-.9,-.35,0),(-.9,-.35,zj),(-.9,.325,zj)],
                 thickness=.025, group=g)
            box(f"rope_q_{g*4+h}", "rotary_position_operation", group, (-.9,1.9,zj),
                (.16,.16,.10), "amber", lod=2, group=g, head=g*4+h, rotary_kind="q",
                dimensions="128 channels; paired 2D rotations", description="Rotates runtime Q using token position")
            path(f"q_output_{g*4+h}", group,
                 [(-.9,1.675,zj),(-.9,1.9,zj),(1.65,1.9,zj),(1.65,1.9,0)],
                 thickness=.025, group=g)
        for letter, x, color in [("k", 0, "teal"), ("v", .85, "purple")]:
            box(f"{letter}_{g}", f"{letter}_head", group, (x,.5,.48),
                (.60,1.35,.07), color, lod=2, group=g, head=g,
                dimensions=f"{A['hidden_size']} × {A['head_dim']}")
            path(f"{letter}_input_{g}", group,
                 [(-2,-.35,0),(x,-.35,0),(x,-.35,.48),(x,-.175,.48)],
                 thickness=.025, group=g)
        box(f"rope_k_{g}", "rotary_position_operation", group, (0,1.9,.48),
            (.16,.16,.10), "amber", lod=2, group=g, head=g, rotary_kind="k",
            dimensions="128 channels; paired 2D rotations", description="Rotates runtime K using token position")
        path(f"k_output_{g}", group,
             [(0,1.175,.48),(0,1.9,.48),(1.65,1.9,.48),(1.65,1.9,0)],
             thickness=.025, group=g)
        box(f"score_{g}", "attention_scores", group, (1.65,1.45,0),
            (.9,.9,.055), "slate", lod=2, group=g, dimensions="4 heads × 8 queries × 8 keys; one head shown")
        box(f"weighted_sum_{g}", "attention_weighted_sum", group, (1.65,.5,0),
            (.35,.35,.35), "white", lod=2, group=g,
            dimensions="4 heads × 128 channels; one head shown",
            description="Per-head causal attention weighted sums with shared V")
        path(f"score_to_sum_{g}", group, [(1.65,1,0),(1.65,.675,0)],
             thickness=.025, group=g)
        path(f"v_to_sum_{g}", group, [(1.15,.5,.48),(1.65,.5,.48),(1.65,.5,.175)],
             thickness=.025, group=g)
        path(f"sum_to_output_{g}", group,
             [(1.65,.325,0),(1.65,0,0),(1.7,0,0),(1.7,0,-zg),(2.075,0,-zg)],
             thickness=.025, group=g)
        cache = node(f"cache_{g}", "kv_cache", group, (0,-2.2,0), lod=2,
                     group=g, name=f"KV_CACHE_{g}")
        for letter, x, color in [("k", -.36, "teal"), ("v", .56, "purple")]:
            box(f"cache_{letter}_{g}", "cache_sheet", cache, (x,-.16,0),
                (.72,.792,.026), color, lod=2, group=g,
                dimensions="8 token rows × 128 head channels", cache_kind=letter)
        path(f"cache_link_{g}", group, [(.08,1.9,.48),(.4,1.9,.48),(.4,-1.964,.48),(0,-1.964,.48),(0,-1.964,0)],
             "teal", thickness=.018, group=g, cache_kind="k", cache_operation="write",
             post_rope=True, source_id=f"rope_k_{g}", target_id=f"cache_k_{g}",
             description="Write the current token key after RoPE into the K cache")
        path(f"cache_v_write_{g}", group,
             [(1.15,.5,.48),(1.15,-1.964,.48),(.56,-1.964,.48),(.56,-1.964,0)],
             "purple", thickness=.018, group=g, cache_kind="v", cache_operation="write",
             source_id=f"v_{g}", target_id=f"cache_v_{g}",
             description="Write the current token value into the V cache")
        path(f"cache_k_read_{g}", group,
             [(0,-2.36,0),(.15,-2.36,0),(.15,2.1,0),(1.65,2.1,0),(1.65,1.9,0)],
             "teal", thickness=.018, group=g, cache_kind="k", cache_operation="read",
             source_id=f"cache_k_{g}", target_id=f"score_{g}",
             description="Read retained keys to compute per-head causal attention scores")
        path(f"cache_v_read_{g}", group,
             [(.92,-2.36,0),(1.25,-2.36,0),(1.25,.5,0),(1.475,.5,0)],
             "purple", thickness=.018, group=g, cache_kind="v", cache_operation="read",
             source_id=f"cache_v_{g}", target_id=f"weighted_sum_{g}",
             description="Read retained values for per-head attention weighted sums")
    box("attention_output", "attention_output", attention, (2.2,0,0),
        (.25,1.6,1.6), "blue", dimensions="4096 × 4096")
    box("router", "moe_router", focus, (2,0,0), (.5,1.8,1.8), "amber", name="MOE_ROUTER")
    bank = node("experts", "expert_bank", focus)
    for e in range(A["experts"]):
        box(f"expert_{e}", "expert", bank, (5,0,(e-3.5)*1.1),
            (1.5,1.0,.60), "purple", expert=e)
    box("merge", "weighted_merge", focus, (8,0,0), (.5,1.8,1.8), "teal")
    for e in range(A["experts"]):
        expert = node(f"expert_detail_{e}", "expert_detail", focus,
                      (4.82,-.3,(e-3.5)*1.1), lod=2, expert=e)
        ports = node(f"expert_input_{e}", "connection", expert, interactive=False, expert=e)
        for branch, z in [("gate",-.15),("up",.15)]:
            path(f"expert_input_{branch}_{e}", ports,
                 [(-.57,.3,0),(-.50,.3,0),(-.50,.3,z),(-.42,.3,z)],
                 thickness=.00825, expert=e)
        path(f"expert_output_{e}", expert, [(.66,.3,0),(.93,.3,0)],
             thickness=.00825, expert=e)
        for identifier, component, pos, size, color, dims in [
            ("gate", "gate_projection", (-1,1,-.5), (.8,1.2,.10), "purple", "4096 → 14336"),
            ("up", "up_projection", (-1,1,.5), (.8,1.2,.10), "blue", "4096 → 14336"),
            ("silu", "silu", (0,1,-.5), (.4,.4,.3), "amber", "SiLU(gate)"),
            ("multiply", "elementwise_multiply", (.8,1,0), (.4,.4,.3), "white", "14336 channels"),
            ("down", "down_projection", (1.8,1,0), (.8,1.2,.1), "teal", "14336 → 4096"),
        ]:
            box(f"{identifier}_{e}", component, expert,
                tuple(v*.3 for v in pos), tuple(v*.3 for v in size),
                color, lod=2, dimensions=dims, expert=e)
        for name, points, color in [
            ("gate", [(-1,1,-.5),(.8,1,-.5),(.8,1,0),(1.8,1,0)], "purple"),
            ("up", [(-1,1,.5),(.8,1,.5),(.8,1,0)], "blue"),
        ]:
            path(f"expert_{name}_path_{e}", expert,
                 [tuple(v*.3 for v in point) for point in points], color,
                 thickness=.055*.3, expert=e)

    # View framing lives in layout.json; each anchor is a view's base pose,
    # before the viewer adds group/expert depth or narrow-viewport fit.
    for name, (pos, target) in {**camera_anchors(), "CAM_TEST": ((4,5,6),(1,2,3))}.items():
        node(name.lower(), "camera_anchor", root, pos, name=name,
             interactive=False, lod=0, target_x=target[0], target_y=target[1], target_z=target[2])
    box("coordinate_sentinel", "diagnostic", root, (1,2,3), (.2,.4,.6), "white",
        interactive=False, lod=0, name="COORDINATE_SENTINEL")
    bpy.context.view_layer.update()
    return root


def report():
    objects = []
    for obj in bpy.context.scene.objects:
        bounds = None
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            corners = [browser(obj.matrix_world @ Vector(c)) for c in obj.bound_box]
            bounds = {"min": [min(c[i] for c in corners) for i in range(3)],
                      "max": [max(c[i] for c in corners) for i in range(3)]}
        objects.append(dict(name=obj.name, parent=obj.parent.name if obj.parent else None,
                            local_position=browser(obj.location),
                            world_position=browser(obj.matrix_world.translation),
                            local_scale=list(obj.scale),
                            local_matrix=[list(row) for row in obj.matrix_local],
                            world_matrix=[list(row) for row in obj.matrix_world],
                            bounds=bounds, mesh=obj.data.name if obj.type == "MESH" else None,
                            triangles=len(obj.data.loop_triangles) if obj.type == "MESH" else 0,
                            extras={k: obj[k] for k in obj.keys()}))
    return dict(schema_version=1, blender_version=bpy.app.version_string,
                coordinate_frame="positions and bounds: browser; matrices: Blender",
                objects=objects, node_count=len(objects), shared_meshes=len(MESHES),
                triangles=sum(o["triangles"] for o in objects),
                components=dict(Counter(o["extras"]["component"] for o in objects)))


if __name__ == "__main__":
    generate()
    output = ROOT / "web/public/models/transformer.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_extras=True,
                              export_yup=True, export_cameras=False, export_lights=False)
    data = report()
    data["glb_bytes"] = output.stat().st_size
    (artifacts / "scene-report.json").write_text(json.dumps(data, indent=2) + "\n")
    bpy.ops.wm.save_as_mainfile(filepath=str(artifacts / "transformer.blend"))
    print(json.dumps({k:v for k,v in data.items() if k != "objects"}, indent=2))
