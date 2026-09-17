"""Validate exported semantic identity, mesh reuse, bounds, and coordinate conversion."""
import json
import math
import struct
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
                                ("expert_detail", 1)]:
        assert counts[component] == expected, (component, counts[component])
    close(world(ids["coordinate_sentinel"]), [1,2,3])
    close(world(ids["cam_test"]), [4,5,6])
    sentinel_mesh = gltf["meshes"][n("coordinate_sentinel")["mesh"]]
    accessor = gltf["accessors"][sentinel_mesh["primitives"][0]["attributes"]["POSITION"]]
    close([b-a for a,b in zip(accessor["min"], accessor["max"])], [.2,.4,.6])
    layers = [n(f"layer_{i}") for i in range(spec["num_layers"])]
    assert len({layer["mesh"] for layer in layers}) == 1, "Layer meshes should share data"
    for i, layer in enumerate(layers):
        assert layer["extras"]["layer"] == i
        assert parents[ids[f"layer_{i}"]] == ids["stack"]
        close(world(ids[f"layer_{i}"]), [0,0,(i-15.5)*.32])
    assert len({n(f"expert_{i}")["mesh"] for i in range(spec["experts"])}) == 1
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
    for identifier in ["residual_attention", "residual_moe", "add1", "add2",
                       "gate", "up", "silu", "multiply", "down"]:
        assert identifier in ids
    anchors = {}
    for identifier, index in ids.items():
        node = nodes[index]
        if node["extras"]["component"] == "camera_anchor":
            extras = node["extras"]
            anchors[node["name"]] = {"position": world(index),
                                     "target": [extras[f"target_{axis}"] for axis in "xyz"]}
    assert len(anchors) == 10
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
