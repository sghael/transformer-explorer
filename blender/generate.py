"""Generate the original schematic asset with Blender 4.5 LTS.

Run: blender --background --factory-startup --python blender/generate.py
Coordinates passed to helpers use the browser's X-right, Y-up, Z-depth frame.
The standard glTF exporter reverses our (x, -z, y) Blender conversion.
"""
import json
from collections import Counter
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "shared/model-spec.json").read_text())
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


def mesh_shape(size, profile):
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

    if profile == "normalization_frame":
        x, y, z = size
        bar = min(y, z) * .11
        for sign in [-1, 1]:
            cuboid((x, bar, z), (0, sign * (y-bar)/2, 0))
            cuboid((x, y-2*bar, bar), (0, 0, sign * (z-bar)/2))
        radius = min(x, bar) * .16
    else:
        cuboid(size)
        radius = min(.12, min(size) * .16)
    mesh = bpy.data.meshes.new(f"{profile}_{len(MESHES)}")
    mesh.from_pydata(vertices, [], faces)
    if profile != "slab":
        topology = bmesh.new()
        topology.from_mesh(mesh)
        bmesh.ops.bevel(topology, geom=list(topology.edges), offset=radius,
                        segments=3, affect="EDGES", clamp_overlap=True)
        topology.to_mesh(mesh)
        topology.free()
    mesh.update()
    return mesh


def box(identifier, component, parent, pos, size, color="slate", **extras):
    operations = {"expert", "moe_router", "weighted_merge", "input", "output",
                  "silu", "elementwise_multiply"}
    profile = ("normalization_frame" if component == "rms_norm" else
               "rounded_operation" if component in operations else "slab")
    key = (tuple(size), color, profile)
    if key not in MESHES:
        mesh = mesh_shape(size, profile)
        mesh.materials.append(MATERIALS[color])
        MESHES[key] = mesh
    return node(identifier, component, parent, pos, mesh=MESHES[key], **extras)


def path(identifier, parent, points, color="path", component="connection", **extras):
    root = node(identifier, component, parent, interactive=False, **extras)
    for i, (a, b) in enumerate(zip(points, points[1:])):
        delta = Vector(b) - Vector(a)
        axis = max(range(3), key=lambda n: abs(delta[n]))
        assert sum(abs(delta[n]) > 1e-6 for n in range(3)) == 1
        size = [.055, .055, .055]
        size[axis] = abs(delta[axis])
        center = [(a[n] + b[n]) / 2 for n in range(3)]
        box(f"{identifier}_segment_{i}", component, root, center, size, color,
            interactive=False)
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
        bsdf.inputs["Roughness"].default_value = .55
        bsdf.inputs["Metallic"].default_value = .12
        MATERIALS[key] = material

    root = node("model", "model", name="MODEL_ROOT", interactive=False, lod=0,
                asset_version="1.0.0", illustrative=True)
    stack = node("stack", "layer_stack", root, name="LAYER_STACK", lod=0)
    for i in range(A["num_layers"]):
        box(f"layer_{i}", "decoder_layer", stack, (0,0,(i-15.5)*.32),
            (4,.12,.22), "slate", layer=i, lod=0)
    path("stack_sequence", stack, [(0,-.24,-4.96), (0,-.24,4.96)], lod=0)
    for identifier, x, size, color, component in [
        ("input", -8, (1.1,.7,1.8), "white", "input"),
        ("embedding", -5.5, (1.0,2.3,2.5), "teal", "embedding"),
        ("final_norm", 4.8, (.25,2.3,2.5), "amber", "rms_norm"),
        ("lm_head", 7, (1.0,2.8,3.2), "blue", "lm_head"),
        ("output", 9.5, (1.0,.7,1.8), "white", "output"),
    ]:
        box(identifier, component, root, (x,0,0), size, color, lod=0)
    path("overview_flow", root, [(-8,-1.7,0), (9.5,-1.7,0)], lod=0)

    focus = node("focus", "focus_layer", root, name="FOCUS_LAYER", interactive=False)
    path("residual_stream", focus, [(-9,0,0), (11,0,0)])
    for identifier, x in [("norm1", -8), ("norm2", 0)]:
        box(identifier, "rms_norm", focus, (x,0,0), (.22,1.8,1.6), "amber")
    addition("add1", focus, -2)
    addition("add2", focus, 10)
    path("residual_attention", focus, [(-9,0,0),(-9,3.3,0),(-2,3.3,0),(-2,0,0)],
         "amber", component="residual_bypass")
    path("residual_moe", focus, [(-1,0,0),(-1,3.3,0),(10,3.3,0),(10,0,0)],
         "amber", component="residual_bypass")

    attention = node("attention", "attention", focus, (-5,0,0), name="ATTENTION_ROOT")
    for g in range(A["kv_heads"]):
        group = node(f"group_{g}", "gqa_group", attention, (0,0,(g-3.5)*1.2),
                     lod=2, group=g)
        for h in range(4):
            box(f"q_{g*4+h}", "query_head", group, (-.9,1,(h-1.5)*.21),
                (.65,1.35,.065), "blue", lod=2, group=g, head=g*4+h,
                dimensions=f"{A['hidden_size']} × {A['head_dim']}")
            path(f"q_shared_{g}_{h}", group,
                 [(-.55,.25,(h-1.5)*.21),(-.2,.25,(h-1.5)*.21),(-.2,.25,.48)],
                 "teal", group=g)
        for letter, x, color in [("k", 0, "teal"), ("v", .85, "purple")]:
            box(f"{letter}_{g}", f"{letter}_head", group, (x,.5,.48),
                (.60,1.35,.07), color, lod=2, group=g, head=g,
                dimensions=f"{A['hidden_size']} × {A['head_dim']}")
        path(f"shared_kv_bus_{g}", group, [(-.2,.25,.48),(.85,.25,.48)],
             "teal", group=g)
        box(f"score_{g}", "attention_scores", group, (1.65,1.45,0),
            (.9,.9,.055), "slate", lod=2, group=g, dimensions="8 query tokens × 8 key tokens")
        cache = node(f"cache_{g}", "kv_cache", group, (0,-2.2,0), lod=2,
                     group=g, name=f"KV_CACHE_{g}")
        for letter, z, color in [("k", -.2, "teal"), ("v", .2, "purple")]:
            box(f"cache_{letter}_{g}", "cache_sheet", cache, (.3,0,z),
                (1.8,1.1,.065), color, lod=2, group=g,
                dimensions="8 token rows × 128 head channels", cache_kind=letter)
        path(f"cache_link_{g}", group, [(0,-.2,.48),(0,-1.6,.48)], "teal", group=g)
    box("attention_output", "attention_output", attention, (2.2,0,0),
        (.25,1.6,1.6), "blue", dimensions="4096 × 4096")
    box("router", "moe_router", focus, (2,0,0), (.5,1.8,1.8), "amber", name="MOE_ROUTER")
    bank = node("experts", "expert_bank", focus)
    for e in range(A["experts"]):
        box(f"expert_{e}", "expert", bank, (5,0,(e-3.5)*1.1),
            (1.5,1.0,.60), "purple", expert=e)
    box("merge", "weighted_merge", focus, (8,0,0), (.5,1.8,1.8), "teal")
    expert = node("expert_detail", "expert_detail", focus, (5,-3,0),
                  name="EXPERT_DETAIL", lod=2)
    for identifier, component, pos, size, color, dims in [
        ("gate", "gate_projection", (-1,1,-.5), (.8,1.2,.10), "purple", "4096 → 14336"),
        ("up", "up_projection", (-1,1,.5), (.8,1.2,.10), "blue", "4096 → 14336"),
        ("silu", "silu", (0,1,-.5), (.4,.4,.3), "amber", "SiLU(gate)"),
        ("multiply", "elementwise_multiply", (.8,1,0), (.4,.4,.3), "white", "14336 channels"),
        ("down", "down_projection", (1.8,1,0), (.8,1.2,.1), "teal", "14336 → 4096"),
    ]:
        box(identifier, component, expert, pos, size, color, lod=2, dimensions=dims)
    path("expert_gate_path", expert, [(-1,1,-.5),(.8,1,-.5),(.8,1,0),(1.8,1,0)], "purple")
    path("expert_up_path", expert, [(-1,1,.5),(.8,1,.5),(.8,1,0)], "blue")

    anchors = {
        "OVERVIEW": ((16,13,19),(0,0,0)),
        "LAYER": ((17,13,20),(1,0,0)),
        "ATTENTION": ((.8,6,10),(-5,0,0)),
        "CACHE": ((-1,2,8),(-4.7,-2.2,0)),
        "MOE": ((13,8,13),(5,0,0)),
        "EXPERT": ((10,3,8),(5,-2,0)),
        "INPUT": ((-1,6,10),(-6,0,0)),
        "LM_HEAD": ((15,7,10),(7,0,0)),
        "MATRIX": ((-3.35,1.45,9),(-3.35,1.45,0)),
        "TEST": ((4,5,6),(1,2,3)),
    }
    for name, (pos, target) in anchors.items():
        node(f"cam_{name.lower()}", "camera_anchor", root, pos, name=f"CAM_{name}",
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
