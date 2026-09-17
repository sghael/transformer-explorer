"""Validate exported semantic identity, mesh reuse, bounds, and coordinate conversion."""
import json
import math
import struct
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = json.loads((ROOT / "shared/layout.json").read_text())
assert LAYOUT["schema_version"] == 1


def close(actual, expected):
    assert len(actual) == len(expected)
    assert all(math.isclose(a, b, abs_tol=1e-5) for a, b in zip(actual, expected)), (actual, expected)


def validate(path):
    blob = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", blob)
    assert (magic, version, length) == (b"glTF", 2, len(blob))
    json_length, chunk_type = struct.unpack_from("<I4s", blob, 12)
    assert chunk_type == b"JSON"
    gltf = json.loads(blob[20:20+json_length])
    nodes = gltf["nodes"]
    required = {"schema_version", "id", "component", "layer", "lod", "interactive", "description_key"}
    ids = {}
    parents = {}
    for i, node in enumerate(nodes):
        extras = node.get("extras", {})
        assert required <= extras.keys(), node.get("name")
        assert extras["schema_version"] == 1
        assert isinstance(extras["interactive"], bool)
        assert extras["lod"] in [0, 1, 2]
        assert -1 <= extras["layer"] < 32
        assert extras["id"] not in ids, extras["id"]
        ids[extras["id"]] = i
        close(node.get("scale", [1,1,1]), [1,1,1])
        close(node.get("rotation", [0,0,0,1]), [0,0,0,1])
        assert "matrix" not in node, "Unexpected baked transform"
        for child in node.get("children", []):
            assert child not in parents, "Multiple parents"
            parents[child] = i

    def n(identifier):
        return nodes[ids[identifier]]

    def world(index):
        local = nodes[index].get("translation", [0,0,0])
        if index not in parents:
            return local
        above = world(parents[index])
        return [a+b for a,b in zip(local, above)]

    spec = json.loads((ROOT / "shared/model-spec.json").read_text())["architecture"]
    counts = Counter(node["extras"]["component"] for node in nodes)
    for component, expected in [("decoder_layer", spec["num_layers"]),
                                ("query_head", spec["attention_heads"]),
                                ("gqa_group", spec["kv_heads"]),
                                ("k_head", spec["kv_heads"]), ("v_head", spec["kv_heads"]),
                                ("cache_sheet", spec["kv_heads"]*2),
                                ("expert", spec["experts"]), ("focus_layer", 1),
                                ("expert_detail", spec["experts"])]:
        assert counts[component] == expected, (component, counts[component])
    close(world(ids["coordinate_sentinel"]), [1,2,3])
    close(world(ids["cam_test"]), [4,5,6])
    sentinel_mesh = gltf["meshes"][n("coordinate_sentinel")["mesh"]]
    accessor = gltf["accessors"][sentinel_mesh["primitives"][0]["attributes"]["POSITION"]]
    close([b-a for a,b in zip(accessor["min"], accessor["max"])], [.2,.4,.6])
    pitch = LAYOUT["layer_pitch"]
    layer_dimensions = LAYOUT["layer_dimensions"]
    half_x = layer_dimensions[0]/2
    first_x = -(spec["num_layers"]-1)/2*pitch
    last_x = -first_x
    layers = [n(f"layer_{i}") for i in range(spec["num_layers"])]
    assert len({layer["mesh"] for layer in layers}) == 1, "Layer meshes should share data"
    for i, layer in enumerate(layers):
        assert layer["extras"]["layer"] == i
        assert parents[ids[f"layer_{i}"]] == ids["stack"]
        close(world(ids[f"layer_{i}"]), [first_x+i*pitch,0,0])
    assert len({n(f"expert_{i}")["mesh"] for i in range(spec["experts"])}) == 1
    def mesh_bounds(identifier):
        mesh = gltf["meshes"][n(identifier)["mesh"]]
        accessor = gltf["accessors"][mesh["primitives"][0]["attributes"]["POSITION"]]
        return accessor["min"], accessor["max"]

    def values(accessor_index):
        accessor = gltf["accessors"][accessor_index]
        view = gltf["bufferViews"][accessor["bufferView"]]
        code = {5123: "H", 5125: "I", 5126: "f"}[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC3": 3}[accessor["type"]]
        fmt = "<" + code * width
        stride = view.get("byteStride", struct.calcsize(fmt))
        offset = 20 + json_length + 8 + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return [struct.unpack_from(fmt, blob, offset + i*stride) for i in range(accessor["count"])]

    for identifier, dimensions in [("layer_0", layer_dimensions), ("expert_0", [1.5,1,.6])]:
        lower, upper = mesh_bounds(identifier)
        close([b-a for a,b in zip(lower, upper)], dimensions)
        assert n(identifier)["extras"]["geometry_profile"] == "skeletal_frame"
        primitive = gltf["meshes"][n(identifier)["mesh"]]["primitives"][0]
        positions = values(primitive["attributes"]["POSITION"])
        indices = [value[0] for value in values(primitive["indices"])]
        bar = .0015 if identifier == "layer_0" else .025
        assert math.isclose(n(identifier)["extras"]["frame_bar_thickness"], bar, abs_tol=1e-8)
        for start in range(0, len(indices), 3):
            centroid = [sum(positions[j][axis] for j in indices[start:start+3])/3 for axis in range(3)]
            # Every triangle stays at an edge: no polygon closes a face opening.
            assert sum(abs(centroid[axis]) >= dimensions[axis]/2-bar-1e-5 for axis in range(3)) >= 2

    interior_components = {"gate": "gate_projection", "up": "up_projection", "silu": "silu",
                           "multiply": "elementwise_multiply", "down": "down_projection"}
    for component in interior_components.values():
        assert counts[component] == spec["experts"]
    for e in range(spec["experts"]):
        detail = f"expert_detail_{e}"
        close(world(ids[detail]), [4.82,-.3,(e-3.5)*1.1])
        assert parents[ids[detail]] == ids["focus"]
        shell_position = world(ids[f"expert_{e}"])
        shell_low, shell_high = mesh_bounds(f"expert_{e}")
        for identifier, index in ids.items():
            ancestor = index
            while ancestor in parents and ancestor != ids[detail]:
                ancestor = parents[ancestor]
            if ancestor != ids[detail]:
                continue
            assert nodes[index]["extras"]["expert"] == e
            if "mesh" in nodes[index]:
                low, high = mesh_bounds(identifier)
                position = world(index)
                for axis in range(3):
                    assert low[axis]+position[axis] >= shell_low[axis]+shell_position[axis]-1e-5
                    assert high[axis]+position[axis] <= shell_high[axis]+shell_position[axis]+1e-5
        for identifier, component in interior_components.items():
            child = f"{identifier}_{e}"
            assert n(child)["extras"]["component"] == component
            assert parents[ids[child]] == ids[detail]
        close(n(f"gate_{e}").get("translation"), [-.3,.3,-.15])
        for name in ["gate", "up"]:
            assert parents[ids[f"expert_{name}_path_{e}"]] == ids[detail]
    for identifier in interior_components:
        assert len({n(f"{identifier}_{e}")["mesh"] for e in range(spec["experts"])}) == 1
    for g in range(spec["kv_heads"]):
        for h in range(4):
            qid = f"q_{g*4+h}"
            assert n(qid)["extras"]["group"] == g
            assert n(qid)["extras"]["head"] == g*4+h
            assert parents[ids[qid]] == ids[f"group_{g}"]
        for letter in ["k", "v"]:
            assert n(f"{letter}_{g}")["extras"]["group"] == g
            assert parents[ids[f"{letter}_{g}"]] == ids[f"group_{g}"]
            assert n(f"cache_{letter}_{g}")["extras"]["cache_kind"] == letter
            sheet = f"cache_{letter}_{g}"
            close(n(sheet)["translation"], [-.36 if letter == "k" else .56, -.16, 0])
            lower, upper = mesh_bounds(sheet)
            close([b-a for a,b in zip(lower, upper)], [.72,.792,.026])
        # The orthogonal post-RoPE write path meets the K sheet's upper-right edge.
        group_position = world(ids[f"group_{g}"])
        points = [(.08,1.9,.48),(.4,1.9,.48),(.4,-1.964,.48),(0,-1.964,.48),(0,-1.964,0)]
        for segment, (a,b) in enumerate(zip(points, points[1:])):
            child = f"cache_link_{g}_segment_{segment}"
            close(world(ids[child]), [group_position[axis]+(a[axis]+b[axis])/2 for axis in range(3)])
            lower, upper = mesh_bounds(child)
            delta = [abs(y-x) for x,y in zip(a,b)]
            assert sum(value > 1e-6 for value in delta) == 1
            close([y-x for x,y in zip(lower,upper)], [value or .018 for value in delta])
        sheet_position = world(ids[f"cache_k_{g}"])
        _, upper = mesh_bounds(f"cache_k_{g}")
        close([sheet_position[0]+upper[0], sheet_position[1]+upper[1], sheet_position[2]],
              [group_position[0],group_position[1]-1.964,group_position[2]])
    for identifier in ["residual_attention", "residual_moe", "add1", "add2",
                       "attention_output"]:
        assert identifier in ids
    for identifier, points in [
        ("residual_attention", [(-9,0,0),(-9,0,-5.4),(-2,0,-5.4),(-2,0,0)]),
        ("residual_moe", [(-1,0,0),(-1,0,5.4),(10,0,5.4),(10,0,0)]),
    ]:
        for segment, (a, b) in enumerate(zip(points, points[1:])):
            delta = [abs(y-x) for x,y in zip(a,b)]
            assert sum(value > 1e-6 for value in delta) == 1
            assert a[1] == b[1] == 0
            child = f"{identifier}_segment_{segment}"
            close(world(ids[child]), [(x+y)/2 for x,y in zip(a,b)])
            lower, upper = mesh_bounds(child)
            close([y-x for x,y in zip(lower,upper)], [value or .055 for value in delta])
    def check_graph_path(identifier, points, thickness=.055, parent="model", plane_y=0):
        assert parents[ids[identifier]] == ids[parent]
        assert len(n(identifier)["children"]) == len(points)-1
        for segment, (a,b) in enumerate(zip(points, points[1:])):
            delta = [abs(y-x) for x,y in zip(a,b)]
            assert sum(value > 1e-6 for value in delta) == 1
            if plane_y is not None:
                assert a[1] == b[1] == plane_y
            child = f"{identifier}_segment_{segment}"
            assert parents[ids[child]] == ids[identifier]
            parent_position = world(ids[parent])
            close(world(ids[child]), [parent_position[i]+(a[i]+b[i])/2 for i in range(3)])
            lower, upper = mesh_bounds(child)
            close([y-x for x,y in zip(lower,upper)], [value or thickness for value in delta])

    def macro_face(identifier, side):
        layout = LAYOUT["macro_nodes"][identifier]
        return layout["x"] + side*layout["size"][0]/2
    for identifier, layout in LAYOUT["macro_nodes"].items():
        close(world(ids[identifier]), [layout["x"],0,0])
        lower, upper = mesh_bounds(identifier)
        close([b-a for a,b in zip(lower,upper)],layout["size"])
    graph = [
        ("overview_input", [(macro_face("input",1),0,0),(macro_face("embedding",-1),0,0)]),
        ("overview_embed", [(macro_face("embedding",1),0,0),(first_x-half_x,0,0)]),
        ("overview_final", [(last_x+half_x,0,0),(macro_face("final_norm",-1),0,0)]),
        ("overview_norm", [(macro_face("final_norm",1),0,0),(macro_face("lm_head",-1),0,0)]),
        ("overview_output", [(macro_face("lm_head",1),0,0),(macro_face("output",-1),0,0)]),
    ]
    for identifier, points in graph:
        assert points[0][0] < points[1][0]
        assert all(point[1] == point[2] == 0 for point in points)
        check_graph_path(identifier, points)
    feedback = [(macro_face("output",1),0,0),(17,0,0),(17,0,LAYOUT["feedback_z"]),
                (-16,0,LAYOUT["feedback_z"]),(-16,0,0),(macro_face("input",-1),0,0)]
    check_graph_path("generation_feedback", feedback, thickness=.025)

    def face(identifier, axis, side):
        low, high = mesh_bounds(identifier)
        position = world(ids[identifier])
        position = list(position)
        position[axis] += (low if side == "min" else high)[axis]
        return position

    # Verify every overview edge meets the actual exported stage bounds.
    endpoint_pairs = [
        (graph[0][1][0], face("input", 0, "max")),
        (graph[0][1][-1], face("embedding", 0, "min")),
        (graph[1][1][0], face("embedding", 0, "max")),
        (graph[1][1][-1], face("layer_0", 0, "min")),
        (graph[2][1][0], face(f"layer_{spec['num_layers']-1}", 0, "max")),
        (graph[2][1][-1], face("final_norm", 0, "min")),
        (graph[3][1][0], face("final_norm", 0, "max")),
        (graph[3][1][-1], face("lm_head", 0, "min")),
        (graph[4][1][0], face("lm_head", 0, "max")),
        (graph[4][1][-1], face("output", 0, "min")),
        (feedback[0], face("output", 0, "max")),
        (feedback[-1], face("input", 0, "min")),
    ]
    for endpoint, actual_face in endpoint_pairs:
        close(endpoint, actual_face)
    for i in range(spec["num_layers"]):
        summary = f"layer_summary_{i}"
        assert n(summary)["extras"]["component"] == "collapsed_layer_flow"
        check_graph_path(summary, [(-half_x,0,0),(half_x,0,0)], thickness=.0015, parent=f"layer_{i}")
        if i < spec["num_layers"]-1:
            gap = f"stack_gap_{i}"
            assert n(gap)["extras"]["component"] == "layer_link"
            check_graph_path(gap, [face(f"layer_{i}", 0, "max"), face(f"layer_{i+1}", 0, "min")], thickness=.0015, parent="stack")
    for identifier in ["norm1", "norm2", "final_norm"]:
        assert n(identifier)["extras"]["geometry_profile"] == "normalization_disk"
        dimensions = LAYOUT["macro_nodes"]["final_norm"]["size"] if identifier == "final_norm" else [.22,.5,.5]
        lower, upper = mesh_bounds(identifier)
        close([b-a for a,b in zip(lower,upper)], dimensions)
        primitive = gltf["meshes"][n(identifier)["mesh"]]["primitives"][0]
        positions = values(primitive["attributes"]["POSITION"])
        indices = [value[0] for value in values(primitive["indices"])]
        # Solid capped disks have circular side vertices and center-filled end faces.
        for x,y,z in positions:
            assert math.isclose(abs(x),dimensions[0]/2,abs_tol=1e-6)
            radius = math.hypot(y,z)
            assert radius < 1e-6 or math.isclose(radius,dimensions[1]/2,abs_tol=1e-6)
        for sign in [-1,1]:
            assert any(abs(positions[index][0]-sign*dimensions[0]/2)<1e-6 and
                       math.hypot(*positions[index][1:])<1e-6 for index in indices)

    assert "stack_sequence" not in ids and "overview_flow" not in ids
    check_graph_path("focus_input", [(-11,0,0),(-9,0,0)], .025, "focus")
    check_graph_path("focus_output", [(10.24,0,0),(11,0,0)], .025, "focus")
    stages = [(-9,-8.11),(-7.89,-7),(-2.675,-2.24),(-1.76,-.11),(.11,1.75),(8.25,9.76)]
    assert len(n("residual_stream")["children"]) == len(stages)
    for i, (start,end) in enumerate(stages):
        check_graph_path(f"residual_stage_{i}", [(start,0,0),(end,0,0)], .025, "residual_stream")
    for endpoint, identifier, side in [
        (-8.11,"norm1","min"),(-7.89,"norm1","max"),
        (-2.675,"attention_output","max"),(-2.24,"add1_horizontal","min"),
        (-1.76,"add1_horizontal","max"),(-.11,"norm2","min"),
        (.11,"norm2","max"),(1.75,"router","min"),(8.25,"merge","max"),
        (9.76,"add2_horizontal","min"),(10.24,"add2_horizontal","max"),
    ]:
        close([endpoint,0,0], face(identifier,0,side))
    assert counts["attention_weighted_sum"] == spec["kv_heads"]
    for g in range(spec["kv_heads"]):
        parent = f"group_{g}"
        assert n(f"score_{g}")["extras"]["dimensions"] == "4 heads × 8 queries × 8 keys; one head shown"
        assert n(f"weighted_sum_{g}")["extras"]["dimensions"] == "4 heads × 128 channels; one head shown"
        zg = (g-3.5)*1.2
        group_position = world(ids[parent])
        def local_face(identifier, axis, side):
            return [a-b for a,b in zip(face(identifier,axis,side),group_position)]
        def attention_path(identifier, points):
            check_graph_path(identifier, points, .025, parent, plane_y=None)
            assert n(identifier)["extras"]["group"] == g
        check_graph_path(f"attention_input_{g}", [(-7,0,0),(-7,0,zg)], .025, "focus")
        attention_path(f"group_input_{g}", [(-2,0,0),(-2,-.35,0)])
        for h in range(4):
            head = g*4+h
            zj = (h-1.5)*.21
            attention_path(f"q_input_{head}", [(-2,-.35,0),(-.9,-.35,0),(-.9,-.35,zj),(-.9,.325,zj)])
            attention_path(f"q_output_{head}", [(-.9,1.675,zj),(-.9,1.9,zj),(1.65,1.9,zj),(1.65,1.9,0)])
            close([-.9,.325,zj], local_face(f"q_{head}",1,"min"))
            close([-.9,1.675,zj], local_face(f"q_{head}",1,"max"))
            assert f"q_shared_{g}_{h}" not in ids
        for letter, x in [("k",0),("v",.85)]:
            attention_path(f"{letter}_input_{g}", [(-2,-.35,0),(x,-.35,0),(x,-.35,.48),(x,-.175,.48)])
            close([x,-.175,.48],local_face(f"{letter}_{g}",1,"min"))
        attention_path(f"k_output_{g}", [(0,1.175,.48),(0,1.9,.48),(1.65,1.9,.48),(1.65,1.9,0)])
        close([0,1.175,.48],local_face(f"k_{g}",1,"max"))
        close([1.65,1.9,0],local_face(f"score_{g}",1,"max"))
        attention_path(f"score_to_sum_{g}", [(1.65,1,0),(1.65,.675,0)])
        close([1.65,1,0],local_face(f"score_{g}",1,"min"))
        close([1.65,.675,0],local_face(f"weighted_sum_{g}",1,"max"))
        attention_path(f"v_to_sum_{g}", [(1.15,.5,.48),(1.65,.5,.48),(1.65,.5,.175)])
        close([1.15,.5,.48],local_face(f"v_{g}",0,"max"))
        close([1.65,.5,.175],local_face(f"weighted_sum_{g}",2,"max"))
        attention_path(f"sum_to_output_{g}", [(1.65,.325,0),(1.65,0,0),(1.7,0,0),(1.7,0,-zg),(2.075,0,-zg)])
        close([1.65,.325,0],local_face(f"weighted_sum_{g}",1,"min"))
        close([2.075,0,-zg],local_face("attention_output",0,"min"))
        assert f"shared_kv_bus_{g}" not in ids
    rotations = [node for node in nodes if node["extras"]["component"] == "rotary_position_operation"]
    assert len(rotations) == spec["attention_heads"] + spec["kv_heads"]
    for g in range(spec["kv_heads"]):
        for kind, head, position in [("q",g*4+h,[-.9,1.9,(h-1.5)*.21]) for h in range(4)] + [("k",g,[0,1.9,.48])]:
            identifier = f"rope_{kind}_{head}"
            assert parents[ids[identifier]] == ids[f"group_{g}"]
            extras = n(identifier)["extras"]
            assert extras["group"] == g and extras["head"] == head and extras["rotary_kind"] == kind
            assert extras["geometry_profile"] == "rounded_operation"
            close(n(identifier)["translation"],position)
            lower, upper = mesh_bounds(identifier)
            close([b-a for a,b in zip(lower,upper)],[.16,.16,.10])
    assert all(node["extras"]["rotary_kind"] in ["q","k"] for node in rotations)
    for e in range(spec["experts"]):
        detail = f"expert_detail_{e}"
        ports = f"expert_input_{e}"
        assert parents[ids[ports]] == ids[detail]
        assert len(n(ports)["children"]) == 2
        detail_position = world(ids[detail])
        def expert_local_face(identifier, side):
            return [a-b for a,b in zip(face(identifier,0,side), detail_position)]
        for branch,z in [("gate",-.15),("up",.15)]:
            check_graph_path(f"expert_input_{branch}_{e}", [(-.57,.3,0),(-.50,.3,0),(-.50,.3,z),(-.42,.3,z)], .00825, ports, plane_y=.3)
            close([-.42,.3,z], expert_local_face(f"{branch}_{e}","min"))
        close([-.57,.3,0], expert_local_face(f"expert_{e}","min"))
        check_graph_path(f"expert_output_{e}", [(.66,.3,0),(.93,.3,0)], .00825, detail, plane_y=.3)
        close([.66,.3,0], expert_local_face(f"down_{e}","max"))
        close([.93,.3,0], expert_local_face(f"expert_{e}","max"))
    for g in range(spec["kv_heads"]):
        parent = f"group_{g}"
        group_position = world(ids[parent])
        edges = [
            (f"cache_v_write_{g}", "v", "write", [(1.15,.5,.48),(1.15,-1.964,.48),(.56,-1.964,.48),(.56,-1.964,0)],
             (f"v_{g}",0,"max"), (f"cache_v_{g}",1,"max")),
            (f"cache_k_read_{g}", "k", "read", [(0,-2.36,0),(.15,-2.36,0),(.15,2.1,0),(1.65,2.1,0),(1.65,1.9,0)],
             (f"cache_k_{g}",0,"max"), (f"score_{g}",1,"max")),
            (f"cache_v_read_{g}", "v", "read", [(.92,-2.36,0),(1.25,-2.36,0),(1.25,.5,0),(1.475,.5,0)],
             (f"cache_v_{g}",0,"max"), (f"weighted_sum_{g}",0,"min")),
        ]
        for identifier, kind, operation, points, source, target in edges:
            check_graph_path(identifier, points, .018, parent, plane_y=None)
            extras = n(identifier)["extras"]
            assert extras["cache_kind"] == kind and extras["cache_operation"] == operation
            assert extras["group"] == g and extras["description"]
            assert extras["source_id"] == source[0] and extras["target_id"] == target[0]
            for endpoint, port in [(points[0],source),(points[-1],target)]:
                close([a+b for a,b in zip(endpoint,group_position)], face(*port))
            if operation == "read":
                assert all(point[2] == 0 for point in points)
        extras = n(f"cache_link_{g}")["extras"]
        assert extras["cache_kind"] == "k" and extras["cache_operation"] == "write"
        assert extras["post_rope"] is True and extras["source_id"] == f"rope_k_{g}"
        assert extras["target_id"] == f"cache_k_{g}"
        close([a+b for a,b in zip((.08,1.9,.48),group_position)],face(f"rope_k_{g}",0,"max"))
    assert "residual_stage_6" not in ids, "Output connection must not be duplicated"
    close([11*LAYOUT["focus_scale"]], [half_x])
    for identifier,index in ids.items():
        ancestor = index
        while ancestor in parents and ancestor != ids["focus"]:
            ancestor = parents[ancestor]
        if ancestor != ids["focus"] or "mesh" not in nodes[index]:
            continue
        lower,upper = mesh_bounds(identifier)
        position = world(index)
        for axis in range(3):
            assert (lower[axis]+position[axis])*LAYOUT["focus_scale"] >= -layer_dimensions[axis]/2-1e-5, identifier
            assert (upper[axis]+position[axis])*LAYOUT["focus_scale"] <= layer_dimensions[axis]/2+1e-5, identifier
    anchors = {}
    for identifier, index in ids.items():
        node = nodes[index]
        if node["extras"]["component"] == "camera_anchor":
            extras = node["extras"]
            anchors[node["name"]] = {"position": world(index),
                                     "target": [extras[f"target_{axis}"] for axis in "xyz"]}
    assert len(anchors) == 10
    for name,position,target in [("CAM_OVERVIEW",[0,12,25],[0,0,0]),
                                  ("CAM_INPUT",[-13.5,3,6],[-13.5,0,0]),
                                  ("CAM_LM_HEAD",[14,3,6],[14,0,0])]:
        close(anchors[name]["position"], position)
        close(anchors[name]["target"], target)
    scene_report_path = ROOT / "artifacts/scene-report.json"
    if scene_report_path.exists():
        scene_report = json.loads(scene_report_path.read_text())
        assert scene_report["node_count"] == len(nodes)
        for obj in scene_report["objects"]:
            identifier = obj["extras"]["id"]
            close(world(ids[identifier]), obj["world_position"])
            assert n(identifier)["extras"] == obj["extras"]
            if obj["bounds"]:
                mesh = gltf["meshes"][n(identifier)["mesh"]]
                accessor = gltf["accessors"][mesh["primitives"][0]["attributes"]["POSITION"]]
                position = world(ids[identifier])
                close([a+b for a,b in zip(accessor["min"], position)], obj["bounds"]["min"])
                close([a+b for a,b in zip(accessor["max"], position)], obj["bounds"]["max"])
    triangles = sum(gltf["accessors"][primitive["indices"]]["count"] // 3
                    for node in nodes if "mesh" in node
                    for primitive in gltf["meshes"][node["mesh"]]["primitives"])
    assert len(blob) < 10_000_000
    result = dict(passed=True, asset_bytes=len(blob), nodes=len(nodes),
                  meshes=len(gltf["meshes"]), triangles=triangles, components=dict(counts),
                  coordinate_sentinel="position and asymmetric dimensions verified",
                  scene_report="all world positions, bounds, and extras match" if scene_report_path.exists() else "absent",
                  anchors=anchors)
    return result


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web/public/models/transformer.glb"
    result = validate(path)
    (ROOT / "artifacts").mkdir(exist_ok=True)
    (ROOT / "artifacts/export-validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
