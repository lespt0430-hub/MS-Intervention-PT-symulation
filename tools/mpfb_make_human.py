# mpfb_make_human.py — MakeHuman(MPFB2)으로 환자 인체를 만들어 .glb 로 내보낸다
#
#   blender --background --online-mode --python tools/mpfb_make_human.py -- \
#       --out assets/pilot/p1.glb --age 45 --sex F [--weight 0.5] [--height 0.5]
#
# 왜 MakeHuman인가
#   1) 산출물이 CC0 라 공개 저장소(GitHub Pages)에 그대로 올릴 수 있다.
#      기성 캐릭터(Mixamo 등)는 재배포 조건이 걸려 있어 이 저장소에 못 넣는다.
#   2) 나이·성별·체중·키를 수치로 준다. 60대 어깨질환 환자와 20대 ACL 환자가
#      실제로 다른 체형으로 보이는 것이 이 교육자료에서는 내용의 일부다.
#   3) 내장 뼈대에 mixamo 규격(rig.mixamo.json)이 있다. 뼈 이름이
#      mixamorigHips… 로 나오므로 자세 코드를 환자 12명에 그대로 돌려쓸 수 있고,
#      나중에 Mixamo 애니메이션을 붙일 수도 있다.
#
# 나이 대응 (MakeHuman 규격)
#   슬라이더 0.0 = 1세, 0.1875 = 10세, 0.5 = 25세, 1.0 = 90세

import bpy
import bmesh
import math
import sys
from mathutils.bvhtree import BVHTree
import os
import importlib
import argparse

MOD = "bl_ext.blender_org.mpfb"


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, help="내보낼 .glb 경로")
    p.add_argument("--age", type=float, default=45.0, help="나이(년)")
    p.add_argument("--sex", default="F", choices=["F", "M"], help="성별")
    p.add_argument("--weight", type=float, default=0.5, help="체중 0~1 (0.5 보통)")
    p.add_argument("--muscle", type=float, default=0.5, help="근육 0~1")
    p.add_argument("--height", type=float, default=0.5, help="키 슬라이더 0~1")
    p.add_argument("--height-m", type=float, default=0.0,
                   help="목표 키(m). 주면 생성 뒤 이 키에 정확히 맞춘다")
    p.add_argument("--rig", default="mixamo", help="뼈대 이름 (mixamo/game_engine/default)")
    p.add_argument("--asian", type=float, default=1.0, help="동아시아 비율 0~1")
    p.add_argument("--garment", default="gown", choices=["gown", "scrub", "none"],
                   help="입힐 옷 (gown=환자복 / scrub=치료사 스크럽 상하의 / none=없음)")
    p.add_argument("--bald", action="store_true", help="머리카락을 만들지 않는다")
    p.add_argument("--hairstyle", default="short", choices=sorted(HAIR_STYLES.keys()),
                   help="머리모양 (short/crop/bob/bun/pony)")
    p.add_argument("--skin", default="f1c8a8", help="피부색 16진수 (환자 데이터의 colors.skin)")
    p.add_argument("--hair", default="2b2b2b", help="머리색 16진수 (환자 데이터의 colors.hair)")
    p.add_argument("--eye", default="3a2a1f", help="홍채색 16진수")
    p.add_argument("--noface", action="store_true", help="얼굴 텍스처를 만들지 않는다(민얼굴)")
    return p.parse_args(argv)


def age_to_slider(years):
    """나이(년) → MakeHuman 슬라이더 값. 25세 이상은 25~90 구간을 선형으로 편다."""
    years = max(1.0, min(90.0, float(years)))
    if years >= 25.0:
        return 0.5 + (years - 25.0) / 65.0 * 0.5
    if years >= 10.0:
        return 0.1875 + (years - 10.0) / 15.0 * (0.5 - 0.1875)
    return years / 10.0 * 0.1875


def hex_to_linear(h):
    """'f1c8a8' → 블렌더용 선형 RGBA.

    환자 데이터의 색은 웹(three.js) 기준 sRGB 16진수다. 블렌더 Principled 의
    Base Color 는 선형값을 받으므로, 그대로 넣으면 화면에서 눈에 띄게 밝고
    물 빠진 색이 된다. 감마를 풀어서 넘긴다.
    """
    h = str(h).lstrip("#").strip()
    if len(h) != 6:
        h = "f1c8a8"
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def select_verts(obj, keep_selected):
    """정점 선택을 정확히 keep_selected(정점 인덱스 집합)로 맞춘다.

    오브젝트 모드에서 vertices[].select 만 바꾸면 안 된다. 면·간선의 선택이
    그대로 남아 있다가, 편집 모드로 들어가는 순간 면 선택이 정점으로 다시
    퍼져(flush) 결국 전부 선택된다. 실제로 이걸 놓쳐서 목선만 지우려던 것이
    옷을 통째로 지웠다(tris 0). 면·간선까지 같이 꺼야 한다.
    """
    for p in obj.data.polygons:
        p.select = False
    for e in obj.data.edges:
        e.select = False
    for v in obj.data.vertices:
        v.select = v.index in keep_selected


def hex_to_srgb(h):
    """'f1c8a8' → 0~1 sRGB 값. 텍스처에 써 넣을 때 쓴다.

    재질 색(Base Color)에는 선형값을 넣어야 하지만, 텍스처 픽셀은 sRGB 로
    저장해야 한다. 여기를 헷갈려 선형값을 써 넣었더니 glTF 가 그 PNG 를
    sRGB 로 읽어서 감마가 두 번 걸려 얼굴만 거뭇하게 나왔다.
    """
    h = str(h).lstrip("#").strip()
    if len(h) != 6:
        h = "f1c8a8"
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def _mask_clusters(path, split=False):
    """MPFB 의 부위 마스크(흑백 jpg)를 읽어 흰 영역의 사각 범위를 돌려준다.

    MPFB 는 base 메시의 UV 공간에 눈꺼풀·입술 같은 부위를 칠해 둔 마스크를
    들고 있다. 이걸 쓰면 "눈이 UV 어디에 있는가"를 눈대중이 아니라 데이터로
    알 수 있다. 얼굴을 그리려면 그 좌표가 필요하다.

    split=True 면 위아래로 두 덩어리(양쪽 눈)로 나눠 각각의 범위를 준다.
    """
    import numpy as np
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    buf = np.empty(w * h * img.channels, dtype=np.float32)
    img.pixels.foreach_get(buf)
    a = buf.reshape(h, w, img.channels)[:, :, 0]
    ys, xs = np.nonzero(a > 0.5)
    if len(xs) == 0:
        return []
    def box(sel):
        return {
            "u0": xs[sel].min() / w, "u1": xs[sel].max() / w,
            "v0": ys[sel].min() / h, "v1": ys[sel].max() / h,
        }
    if not split:
        return [box(slice(None))]
    mid = (ys.min() + ys.max()) / 2.0
    lo, hi = ys < mid, ys >= mid
    out = []
    for sel in (lo, hi):
        if sel.sum():
            out.append(box(sel))
    return out


def build_face_texture(skin_hex, eye_hex="3a2a1f", size=2048):
    """피부 텍스처 한 장을 만들어 눈과 입술을 그려 넣는다.

    민얼굴이 지금 가장 눈에 걸린다. MakeHuman 기본 메시에는 안구가 없어서
    (눈알은 원래 별도 에셋이다) 눈구멍이 그늘로만 남아 시신처럼 보인다.

    안구를 따로 붙이면 위치를 조금만 틀려도 훨씬 이상해지고 드로우콜도 는다.
    UV 마스크가 눈·입 위치를 알려 주므로, 텍스처에 그려 넣으면 삼각형도
    드로우콜도 그대로 두고 얼굴만 또렷해진다.
    """
    import numpy as np
    tex_dir = os.path.join(
        bpy.utils.user_resource("EXTENSIONS"), "blender_org", "mpfb", "data", "textures")
    eyes = _mask_clusters(os.path.join(tex_dir, "mpfb_eyelids.jpg"), split=True)
    lips = _mask_clusters(os.path.join(tex_dir, "mpfb_lips.jpg"))
    if not eyes:
        print("FACE_TEX_SKIP 눈 마스크를 읽지 못함")
        return None

    skin = hex_to_srgb(skin_hex)
    img = bpy.data.images.new("PT_FaceTex", width=size, height=size, alpha=False)
    px = np.empty((size, size, 4), dtype=np.float32)
    px[:, :, 0], px[:, :, 1], px[:, :, 2] = skin
    px[:, :, 3] = 1.0

    yy, xx = np.mgrid[0:size, 0:size]

    def disc(cx_px, cy_px, rx_px, ry_px):
        """픽셀 단위 타원. UV 비율이 아니라 픽셀로 다뤄야 동그란 홍채를 그릴 수 있다."""
        return (((xx - cx_px) / max(rx_px, 1e-6)) ** 2
                + ((yy - cy_px) / max(ry_px, 1e-6)) ** 2) <= 1.0

    # 눈 그리기.
    #
    # 두 번 실패하고 알아낸 것 두 가지가 이 코드에 반영돼 있다.
    #
    # 1) 눈꺼풀 UV 아일랜드는 90° 돌아가 있다. 마스크를 재 보면 가로 31px,
    #    세로 51px 인데, 이 '세로'가 실제 얼굴에서는 눈의 가로(눈꼬리~눈머리)다.
    #    처음에 축을 반대로 잡아서 눈이 세로로 가늘게 감긴 것처럼 그려졌다.
    # 2) 1024 텍스처에서 눈은 15x25px 밖에 안 된다. 흰자·홍채·동공을 구분해
    #    그릴 자리가 없어서 뭉갠 얼룩이 됐다. 2048 로 올려 31x51px 을 확보했다.
    #
    # 그래서 u 방향이 눈의 높이, v 방향이 눈의 너비다.
    iris = hex_to_srgb(eye_hex)
    sclera = (0.93, 0.91, 0.89)
    lash = (0.06, 0.05, 0.05)
    for e in eyes:
        cx = (e["u0"] + e["u1"]) / 2 * size      # 눈의 높이 축
        cy = (e["v0"] + e["v1"]) / 2 * size      # 눈의 너비 축
        rh = (e["u1"] - e["u0"]) / 2 * size      # 눈 높이의 절반(px)
        rw = (e["v1"] - e["v0"]) / 2 * size      # 눈 너비의 절반(px)

        # 눈알 자체는 지오메트리(build_eyes)가 맡는다. 여기서는 속눈썹 선과
        # 눈구멍 그늘만 칠한다 — 구가 살에 파묻힌 것처럼 자연스럽게 앉고,
        # 구와 눈꺼풀 사이에 틈이 비쳐도 그늘로 보인다.
        m = disc(cx, cy, rh * 1.02, rw * 1.02)
        px[m, 0], px[m, 1], px[m, 2] = lash
        m = disc(cx, cy, rh * 0.80, rw * 0.92)
        px[m, 0] = skin[0] * 0.38
        px[m, 1] = skin[1] * 0.34
        px[m, 2] = skin[2] * 0.33

    for l in lips:
        cx = (l["u0"] + l["u1"]) / 2 * size
        cy = (l["v0"] + l["v1"]) / 2 * size
        rh = (l["u1"] - l["u0"]) / 2 * size
        rw = (l["v1"] - l["v0"]) / 2 * size
        # 마스크를 꽉 채우면 입이 얼굴 반을 차지한다. 안쪽만 옅게 물들인다.
        m = disc(cx, cy, rh * 0.70, rw * 0.70)
        px[m, 0] = min(1.0, skin[0] * 1.00)
        px[m, 1] = skin[1] * 0.72
        px[m, 2] = skin[2] * 0.70
        # 입술 사이 선 — 이게 있어야 입을 다물고 있는 것으로 보인다
        m = disc(cx, cy, rh * 0.12, rw * 0.66)
        px[m, 0] = skin[0] * 0.52
        px[m, 1] = skin[1] * 0.40
        px[m, 2] = skin[2] * 0.40

    img.pixels.foreach_set(px.reshape(-1))
    img.pack()
    print("FACE_TEX 눈", len(eyes), "입", len(lips))
    return img


def find_eye_sockets(basemesh):
    """눈꺼풀 UV 마스크에 걸리는 정점을 찾아 좌우 눈의 중심과 크기를 잰다.

    좌표를 눈대중으로 잡으면 체형·나이마다 어긋난다. 마스크는 UV 공간에
    '여기가 눈꺼풀'이라고 표시해 두었으므로, 각 정점의 UV 를 마스크에 찍어
    보면 그 정점이 눈꺼풀인지 알 수 있다. 그 정점들의 무게중심이 곧 눈이다.

    반환: [{"c": Vector, "r": float}, ...] (좌우 2개)
    """
    import numpy as np
    from mathutils import Vector
    tex = os.path.join(bpy.utils.user_resource("EXTENSIONS"),
                       "blender_org", "mpfb", "data", "textures", "mpfb_eyelids.jpg")
    if not os.path.exists(tex):
        print("EYE_SKIP 마스크 없음")
        return []
    img = bpy.data.images.load(tex, check_existing=True)
    w, h = img.size
    buf = np.empty(w * h * img.channels, dtype=np.float32)
    img.pixels.foreach_get(buf)
    mask = buf.reshape(h, w, img.channels)[:, :, 0] > 0.5

    me = basemesh.data
    uvs = me.uv_layers.active
    if uvs is None:
        print("EYE_SKIP UV 없음")
        return []
    marked = set()
    for loop in me.loops:
        u, v = uvs.data[loop.index].uv
        x = int(u * w) % w
        y = int(v * h) % h
        if mask[y, x]:
            marked.add(loop.vertex_index)
    if len(marked) < 8:
        print("EYE_SKIP 걸린 정점", len(marked))
        return []

    left = [me.vertices[i].co for i in marked if me.vertices[i].co.x > 0]
    right = [me.vertices[i].co for i in marked if me.vertices[i].co.x <= 0]
    out = []
    for group in (left, right):
        if len(group) < 4:
            continue
        c = Vector((sum(p.x for p in group) / len(group),
                    sum(p.y for p in group) / len(group),
                    sum(p.z for p in group) / len(group)))
        # 눈 크기 — 정점들이 퍼진 범위에서 잡는다
        ext = max(max(p.x for p in group) - min(p.x for p in group),
                  max(p.z for p in group) - min(p.z for p in group))
        r = max(0.004, ext * 0.42)
        # 중심을 머리 안쪽(+Y)으로 밀어 넣는다.
        #
        # 정점 무게중심은 피부 표면이다. 거기에 구를 놓으면 절반이 얼굴 밖으로
        # 튀어나와 개구리 눈이 된다. 실제 안구는 눈구멍 안에 들어앉아 앞쪽
        # 일부만 드러나므로, 반지름의 70% 쯤 뒤로 물려야 그 모양이 나온다.
        c.y += r * 0.72
        out.append({"c": c, "r": r})
    print("EYE_SOCKETS", len(out), "정점", len(marked))
    return out


def build_eyes(basemesh, armature, iris_hex="3a2a1f"):
    """안구를 실제 지오메트리로 넣는다.

    처음에는 텍스처에 눈을 그렸다. 그런데 눈꺼풀 부분은 UV 가 심하게 늘어나
    있어서, 텍스처에 동그라미를 그려도 얼굴에서는 쐐기처럼 펴진다 — 눈동자가
    한쪽으로 몰린 사시가 됐다. UV 왜곡을 텍스처로 상쇄하는 건 사람마다 다르고
    맞추기도 어렵다. 구를 놓으면 어느 각도에서 봐도 동그랗다.

    흰자 구와 홍채 구를 각각 하나의 오브젝트로 합쳐 드로우콜 2개만 쓴다.
    머리뼈에 100% 가중치로 묶어 머리를 돌리면 같이 돈다.
    """
    sockets = find_eye_sockets(basemesh)
    if not sockets:
        return []
    head = next((vg.name for vg in basemesh.vertex_groups if vg.name.endswith("Head")), None)
    if head is None:
        print("EYE_SKIP Head 정점군 없음")
        return []

    made = []
    for part, tint, rf, push in (
            ("Sclera", (0.86, 0.85, 0.84, 1.0), 1.00, 0.00),
            # 홍채는 흰자보다 작은 구를 앞으로 밀어 앞면만 살짝 드러나게 한다
            ("Iris", hex_to_linear(iris_hex), 0.46, 0.60)):
        pieces = []
        for s in sockets:
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=16, ring_count=10, radius=s["r"] * rf, location=s["c"])
            o = bpy.context.active_object
            # 얼굴은 -Y 를 향한다. 홍채를 그쪽으로 밀어야 앞으로 나온다.
            o.location.y -= s["r"] * push
            pieces.append(o)
        bpy.ops.object.select_all(action="DESELECT")
        for o in pieces:
            o.select_set(True)
        bpy.context.view_layer.objects.active = pieces[0]
        if len(pieces) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = "Eye" + part
        bpy.ops.object.shade_smooth()

        mat = bpy.data.materials.new("Eye" + part + "_MAT")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = tint
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 0.25
        obj.data.materials.clear()
        obj.data.materials.append(mat)

        # 머리뼈에 통째로 묶는다
        vg = obj.vertex_groups.new(name=head)
        vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
        obj.parent = armature
        md = obj.modifiers.new("Armature", "ARMATURE")
        md.object = armature
        made.append(obj)

    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made)
    print("EYES tris", tris, "메시", len(made))
    return made


def strip_helpers(obj):
    """옷 맞춤용 보조 지오메트리를 실제로 지운다.

    MPFB 는 헬퍼를 'Hide helpers' MASK 모디파이어로 가리기만 한다. 화면에서는
    안 보이지만 정점은 그대로 남아 있어서, glTF 로 내보내면 (모디파이어가
    적용되지 않으므로) 다리를 감싼 치마 모양 껍데기가 그대로 딸려 나온다.
    삼각형도 37k 중 10k가 이것이었다.

    정점군은 body / HelperGeometry / JointCubes 셋뿐이므로, body 만 남기고
    나머지를 지우면 된다.
    """
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if "body" not in obj.vertex_groups:
        print("STRIP_SKIP body 정점군 없음")
        return
    obj.vertex_groups.active_index = obj.vertex_groups["body"].index
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.vertex_group_select()
    bpy.ops.mesh.select_all(action="INVERT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for md in list(obj.modifiers):
        if md.type == "MASK":
            obj.modifiers.remove(md)
    print("STRIPPED tris", sum(len(p.vertices) - 2 for p in obj.data.polygons))


# 환자복·스크럽이 덮는 범위를 뼈 이름으로 정의한다.
#
# 좌표(z가 얼마 이상)로 자르면 사람마다 키·체형이 달라 매번 어긋나지만,
# 뼈대를 붙이고 나면 정점군이 뼈 이름으로 생기므로 "척추와 골반과 허벅지"라고
# 해부학적으로 지정할 수 있다. 나이·체형이 달라도 같은 코드가 그대로 맞는다.
GARMENT_REGIONS = {
    # 환자복 상의 — 어깨에서 골반까지, 반팔. 밑단은 cut_below 로 수평으로 끊는다.
    "gown_top": ["Spine", "Spine1", "Spine2", "Hips", "LeftArm", "RightArm"],
    # 환자복 바지 — 허리에서 발목까지. 통이 넓으면 다시 잠옷이 된다.
    "gown_pants": ["Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"],
    # 치료사 스크럽 — 상하의가 같은 남색이라 어깨부터 발목까지 이어진다.
    # 종아리(Leg)까지 넣어야 바지가 되고, 안 넣으면 반바지가 된다.
    "scrub": ["Spine", "Spine1", "Spine2", "LeftArm", "RightArm",
              "Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"],
}


def bake_shape_keys(obj):
    """지금 보이는 모양을 정점 좌표에 굽고 셰이프키를 없앤다.

    MakeHuman 의 나이·체중·키는 전부 셰이프키(모프)로 들어간다. 그래서 파이썬으로
    v.co 를 고쳐도 화면에는 아무 변화가 없다 — 보이는 것은 셰이프키가 섞인
    결과이고 v.co 는 그 아래 깔린 기본형일 뿐이다. 옷을 벌리거나 머리를 부풀리는
    변형을 하려면 먼저 이걸 구워서 없애야 한다.
    """
    if not obj.data.shape_keys:
        return
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        print("SHAPEKEYS_BAKED", obj.name)
    except TypeError:
        # apply_mix 를 모르는 옛 버전 — 섞인 결과를 새 키로 만든 뒤 나머지를 지운다
        bpy.ops.object.shape_key_add(from_mix=True)
        obj.active_shape_key_index = len(obj.data.shape_keys.key_blocks) - 1
        mixed = [v.co.copy() for v in obj.data.shape_keys.key_blocks[-1].data]
        bpy.ops.object.shape_key_remove(all=True)
        for v, co in zip(obj.data.vertices, mixed):
            v.co = co
        print("SHAPEKEYS_BAKED_FALLBACK", obj.name)


# 머리모양. 두피 껍질을 어디서 자르고 얼마나 부풀리느냐로 실루엣을 만든다.
#
#   line  — 헤어라인 기준 높이 (머리 높이 대비). 낮을수록 귀·뒤통수를 덮는다
#   front — 얼굴 쪽으로 갈수록 헤어라인이 올라가는 정도 (이마 노출)
#   thick — 두께(m). 두꺼울수록 머리숱이 많아 보인다
#   bun   — 뒤통수 묶음머리 크기 (머리 반지름 대비, 0이면 없음)
#   tail  — 묶음 아래로 늘어뜨린 길이 (머리 높이 대비, 0이면 없음)
#
# 열두 명이 전부 같은 머리를 쓰면 나이·체형이 달라도 한 사람으로 보인다.
# 실제로 그렇게 나와서 (test/shots/h8-운동치료실.png) 모양을 나눴다.
HAIR_STYLES = {
    "short": dict(line=0.42, front=0.30, thick=0.011, bun=0.0, tail=0.0),
    "crop":  dict(line=0.52, front=0.20, thick=0.006, bun=0.0, tail=0.0),   # 짧은 스포츠머리
    "bob":   dict(line=0.28, front=0.34, thick=0.020, bun=0.0, tail=0.0),   # 귀를 덮는 단발
    "bun":   dict(line=0.38, front=0.30, thick=0.013, bun=0.42, tail=0.0),  # 뒤로 묶어 올림
    "pony":  dict(line=0.34, front=0.32, thick=0.015, bun=0.32, tail=0.55), # 낮게 묶어 늘어뜨림
}


def add_hair_bun(hair, bun, tail):
    """뒤통수에 묶은 머리를 붙인다.

    머리카락 메시에 통째로 합쳐 드로우콜을 늘리지 않는다. 합친 정점은 머리뼈에
    100% 로 묶어야 한다 — 안 그러면 자세를 바꿀 때 묶음머리만 제자리에 남는다.
    """
    vs = hair.data.vertices
    if not vs:
        return
    xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
    zmin, zmax = min(zs), max(zs)
    r = (max(xs) - min(xs)) / 2.0           # 머리 반지름
    # 얼굴은 -Y 를 본다. 뒤통수는 y 가 큰 쪽.
    back = max(ys)
    cx = (max(xs) + min(xs)) / 2.0
    cz = zmin + (zmax - zmin) * (0.62 if tail <= 0 else 0.40)
    rb = r * bun

    before = len(vs)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=9, radius=rb,
                                         location=(cx, back + rb * 0.55, cz))
    ball = bpy.context.active_object
    ball.scale = (0.95, 0.85, 0.95)
    made = [ball]

    if tail > 0.0:
        # 늘어뜨린 머리 — 아래로 갈수록 가늘어지는 원뿔대
        length = (zmax - zmin) * tail * 2.2
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=rb * 0.85, radius2=rb * 0.45,
                                        depth=length,
                                        location=(cx, back + rb * 0.5, cz - length / 2.0))
        made.append(bpy.context.active_object)

    bpy.ops.object.select_all(action="DESELECT")
    for o in made:
        o.select_set(True)
    hair.select_set(True)
    bpy.context.view_layer.objects.active = hair
    bpy.ops.object.join()
    bpy.ops.object.shade_smooth()

    head = next((vg for vg in hair.vertex_groups if vg.name.endswith("Head")), None)
    if head:
        added = [v.index for v in hair.data.vertices][before:]
        head.add(added, 1.0, "REPLACE")
    print("HAIR_BUN 정점", len(hair.data.vertices) - before)


def build_hair(basemesh, name="Hair", rgb=(0.10, 0.08, 0.07, 1.0), style="short"):
    """두피를 복제해 머리카락을 만든다.

    민머리가 지금 가장 눈에 걸리는 부분이다. MPFB 에는 머리카락 에셋이 없고,
    털을 심으면 웹에서 감당이 안 된다. 옷과 같은 수법으로 두피 껍질을 한 겹
    띄우면 단정하게 빗어 넘긴 짧은 머리로 읽힌다 — 드로우콜 1개, 삼각형 수백 개.

    앞머리 선은 뒤통수보다 높아야 이마가 드러난다. 앞뒤 위치(y)에 따라 자르는
    높이를 기울여서 그 선을 만든다.
    """
    sp = HAIR_STYLES.get(style) or HAIR_STYLES["short"]
    offset = sp["thick"]
    vg = next((v for v in basemesh.vertex_groups if v.name.endswith("Head")), None)
    if vg is None:
        print("HAIR_SKIP Head 정점군 없음")
        return None

    bpy.ops.object.select_all(action="DESELECT")
    basemesh.select_set(True)
    bpy.context.view_layer.objects.active = basemesh
    bpy.ops.object.duplicate()
    hair = bpy.context.view_layer.objects.active
    hair.name = name
    bake_shape_keys(hair)

    hair.vertex_groups.active_index = next(
        v.index for v in hair.vertex_groups if v.name.endswith("Head"))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.vertex_group_select()
    bpy.ops.mesh.select_all(action="INVERT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    # 머리 영역 안에서 헤어라인 위쪽만 남긴다
    vs = hair.data.vertices
    if not vs:
        return None
    zs = [v.co.z for v in vs]; ys = [v.co.y for v in vs]
    zmin, zmax = min(zs), max(zs)
    ymin, ymax = min(ys), max(ys)
    zh, yspan = zmax - zmin, max(1e-6, ymax - ymin)
    keep = []
    for v in vs:
        # MakeHuman 인체는 블렌더에서 -Y 를 바라본다. 그래서 y 가 작은 쪽이
        # 얼굴이다 (반대로 잡았더니 머리카락이 얼굴을 가면처럼 덮었다).
        front = (ymax - v.co.y) / yspan          # 0 = 뒤통수, 1 = 얼굴 쪽
        line = zmin + zh * (sp["line"] + sp["front"] * front)  # 앞으로 갈수록 헤어라인이 높다
        if v.co.z >= line:
            keep.append(v.index)
    if not keep:
        print("HAIR_SKIP 남는 정점 없음")
        return None
    keepset = set(keep)
    # 남길 것 말고 나머지를 선택해 지운다. 면 선택이 남아 되살아나지 않도록
    # select_verts 를 쓴다 (자세한 사정은 그 함수 설명 참고).
    select_verts(hair, {v.index for v in vs if v.index not in keepset})
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.transform.shrink_fatten(value=offset)
    bpy.ops.object.mode_set(mode="OBJECT")

    if sp["bun"] > 0.0:
        add_hair_bun(hair, sp["bun"], sp["tail"])

    mat = bpy.data.materials.new(name + "_MAT")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgb
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.45
    hair.data.materials.clear()
    hair.data.materials.append(mat)

    tris = sum(len(p.vertices) - 2 for p in hair.data.polygons)
    print("HAIR tris", tris)
    return hair


def drape_torso(cloth, blend=0.55, bands=26):
    """몸통을 감싼 부분을 통(원통) 쪽으로 눌러 준다.

    옷을 법선으로 밀어내기만 하면 가슴·배·허리 굴곡이 그대로 옷에 비쳐서,
    아무리 색을 넣어도 환자복이 아니라 몸에 딱 붙는 쫄쫄이로 보인다. 실제
    환자복 상의는 어깨에 걸려 통으로 떨어지고 가슴선을 드러내지 않는다.

    높이를 잘게 나눠 그 높이의 평균 반지름을 구하고, 각 정점을 그 평균 쪽으로
    당긴다. 밖으로 튀어나온 곳은 들어가고 들어간 곳은 나와서 단면이 둥글어진다.

    팔은 건드리지 않는다 — 소매까지 몸통 원통에 말려들면 팔이 몸에 붙어 버린다.
    그래서 정점이 어느 뼈에 매여 있는지로 몸통만 골라낸다.
    """
    rig = cloth.parent if (cloth.parent and cloth.parent.type == "ARMATURE") else None
    bone_names = set(rig.data.bones.keys()) if rig else set()
    TORSO = ("Spine", "Spine1", "Spine2", "Hips")

    def is_torso(v):
        best, bw = "", 0.0
        for g in v.groups:
            n = cloth.vertex_groups[g.group].name
            if bone_names and n not in bone_names:
                continue
            if g.weight > bw:
                best, bw = n, g.weight
        return best.endswith(TORSO)

    vs = [v for v in cloth.data.vertices if is_torso(v)]
    if len(vs) < 20:
        print("DRAPE_SKIP 몸통 정점", len(vs))
        return
    zs = [v.co.z for v in vs]
    zmin, zmax = min(zs), max(zs)
    span = max(1e-6, zmax - zmin)

    # 어깨·목둘레로 갈수록 힘을 뺀다.
    #
    # 맨 위까지 통으로 부풀리면 그 높이의 평균 반지름에 어깨 폭이 섞여 목둘레가
    # 어깨만큼 벌어진다 — 깃이 활짝 열려 옷 안쪽(어두운 뒷면)이 가슴에 비쳤다.
    # 그렇다고 어느 높이에서 뚝 끊으면 그 경계에서 톱니 같은 깃이 생긴다.
    # 두 번 다 겪었다. 서서히 0 으로 죽이는 게 답이다.
    z_full = zmin + span * 0.68        # 여기까지는 100% 통으로
    z_none = zmin + span * 0.88        # 여기부터는 몸에 맞춘 그대로

    def falloff(z):
        if z <= z_full:
            return 1.0
        if z >= z_none:
            return 0.0
        t = (z - z_full) / (z_none - z_full)
        return 1.0 - t * t * (3.0 - 2.0 * t)      # 부드럽게 (smoothstep)

    buckets = [[] for _ in range(bands)]
    for v in vs:
        i = min(bands - 1, int((v.co.z - zmin) / span * bands))
        buckets[i].append(v)

    cen = [None] * bands
    rad = [None] * bands
    for i, grp in enumerate(buckets):
        if len(grp) < 6:
            continue
        cx = sum(v.co.x for v in grp) / len(grp)
        cy = sum(v.co.y for v in grp) / len(grp)
        cen[i] = (cx, cy)
        rad[i] = sum(math.hypot(v.co.x - cx, v.co.y - cy) for v in grp) / len(grp)

    # 위에서 내려온 폭보다 좁아지지 않게 한다.
    #
    # 천은 가장 튀어나온 곳(가슴)에 걸쳐진 뒤 그 아래로는 몸을 따라 다시
    # 들어가지 않고 곧게 떨어진다. 이 한 줄이 없으면 아무리 원통으로 눌러도
    # 허리에서 다시 잘록해져 몸매가 드러난다.
    for i in range(bands - 2, -1, -1):
        if rad[i] is None or rad[i + 1] is None:
            continue
        rad[i] = max(rad[i], rad[i + 1] * 0.99)

    moved = 0
    for i, grp in enumerate(buckets):
        if cen[i] is None:
            continue
        cx, cy = cen[i]
        target = rad[i]
        for v in grp:
            r = math.hypot(v.co.x - cx, v.co.y - cy)
            if r < 1e-5:
                continue
            b = blend * falloff(v.co.z)
            if b <= 0.0:
                continue
            k = (target * b + r * (1.0 - b)) / r
            v.co.x = cx + (v.co.x - cx) * k
            v.co.y = cy + (v.co.y - cy) * k
            moved += 1
    print("DRAPE 정점", moved, "띠", bands)


def paint_stripes(cloth, mat, rgb, count=12, depth=0.45):
    """환자복 세로 줄무늬를 정점색으로 넣는다.

    단색으로 두면 옷이 아니라 '몸에 칠한 색'으로 보인다. 국내 병원 환자복의
    특징은 연한 하늘색 세로 줄무늬라, 그 줄만 들어가도 천으로 읽힌다.

    왜 텍스처가 아니라 정점색인가 — 이 옷은 몸 표면을 복제한 것이라 UV 가
    인체 텍스처의 것을 그대로 물려받는다. 그 UV 는 얼굴·손발이 제각각 놓인
    지도라, 거기에 줄무늬 그림을 얹으면 몸통에서 줄이 사방으로 휜다.
    몸통 축을 도는 각도로 칠하면 UV 와 상관없이 언제나 세로줄이 된다.

    줄을 딱 떨어지게 나누지 않고 사인파로 부드럽게 섞는다. 정점 간격이 2cm쯤이라
    선명한 줄은 어차피 표현이 안 되고 들쭉날쭉해지기만 한다.
    """
    me = cloth.data
    attr = me.color_attributes.get("Col") or me.color_attributes.new(
        name="Col", type="FLOAT_COLOR", domain="POINT")
    base = rgb
    for i, v in enumerate(me.vertices):
        a = math.atan2(v.co.x, v.co.y)              # 몸통 축을 도는 각도
        s = (0.5 + 0.5 * math.sin(a * count)) ** 3  # 세제곱 — 바탕은 넓게, 줄은 좁게
        f = 1.0 - depth * s
        # 줄은 어두워지기만 하는 게 아니라 푸른 기가 돈다 (실제 환자복이 그렇다)
        attr.data[i].color = (base[0] * f, base[1] * (f + depth * 0.25 * s),
                              base[2] * min(1.0, f + depth * 0.55 * s), 1.0)

    # 내보내기 규약 — glTF 는 재질이 정점색을 실제로 쓸 때만 COLOR_0 를 싣는다.
    # 색을 정점에 다 넣고 재질 바탕은 흰색으로 두어야 두 번 곱해지지 않는다.
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf:
        node = nt.nodes.new("ShaderNodeVertexColor")
        node.layer_name = "Col"
        node.location = (bsdf.location.x - 300, bsdf.location.y)
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    print("STRIPES 정점", len(me.vertices), "줄", count)


def build_garment(basemesh, region, name, rgb, offset=0.022, flare=0.0, stripes=False,
                  cut_below=None, smooth=5, drape=0.0, seal_all=False):
    """몸 표면을 복제해 옷을 만든다.

    복제본은 아마추어 모디파이어와 본 가중치를 그대로 물려받으므로, 옷이 몸을
    따라 움직이게 하려고 따로 리깅하거나 가중치를 칠할 필요가 없다. 표면을
    법선 방향으로 조금 밀어내면 몸에서 살짝 떠서 천으로 읽힌다.
    """
    bones = GARMENT_REGIONS[region]
    groups = [g for g in (b for b in bones) if any(vg.name.endswith(g) for vg in basemesh.vertex_groups)]
    if not groups:
        print("GARMENT_SKIP 정점군 없음", region)
        return None

    bpy.ops.object.select_all(action="DESELECT")
    basemesh.select_set(True)
    bpy.context.view_layer.objects.active = basemesh
    bpy.ops.object.duplicate()
    cloth = bpy.context.view_layer.objects.active
    cloth.name = name
    bake_shape_keys(cloth)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    matched = []
    for g in groups:
        vg = next((v for v in cloth.vertex_groups if v.name.endswith(g)), None)
        if vg is None:
            print("GARMENT_NO_VG", g)
            continue
        matched.append(vg.name)
        cloth.vertex_groups.active_index = vg.index
        bpy.ops.object.vertex_group_select()
    print("GARMENT_GROUPS", matched)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("GARMENT_SELECTED_VERTS", sum(1 for v in cloth.data.vertices if v.select))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="INVERT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.mesh.select_all(action="SELECT")
    # 몸의 굴곡을 눌러 편다.
    #
    # 몸 표면을 그대로 복제했으니 젖꼭지·배꼽·복근까지 옷에 그대로 비친다.
    # 천은 그런 잔굴곡을 타지 않고 큰 형태만 따라간다 — 몇 번 문질러서
    # 세부를 지우면 비로소 옷감으로 보인다.
    bpy.ops.mesh.vertices_smooth(factor=0.5, repeat=smooth)
    # 그런 다음 천이 몸에서 뜨도록 법선 방향으로 민다
    bpy.ops.transform.shrink_fatten(value=offset)
    bpy.ops.object.mode_set(mode="OBJECT")

    # 아래로 갈수록 벌린다.
    #
    # 몸 표면을 그대로 복제하면 다리에 착 붙어서, 아무리 색을 바꿔도 옷이 아니라
    # 몸에 칠한 색으로 보인다. 병원 환자복은 골반 아래가 퍼져 두 다리가 하나의
    # 통으로 보이는 게 특징이라, 그 실루엣을 만들어 줘야 비로소 옷으로 읽힌다.
    if flare > 0.0:
        verts = cloth.data.vertices
        zs = [v.co.z for v in verts]
        if zs:
            ztop, zbot = max(zs), min(zs)
            hip = zbot + (ztop - zbot) * 0.45   # 골반 높이 — 여기부터 퍼진다
            span = max(1e-6, hip - zbot)

            # 아래로 갈수록 바깥으로 벌린다.
            #
            # 한때 정점들을 몸통 축 중심의 타원에 투영해 두 다리를 하나의 통으로
            # 모아 보려 했다. 안쪽 정점은 밀려 나갔지만 바깥쪽 정점은 타원 안으로
            # 끌려 들어와, 오히려 다리에 더 달라붙는 결과가 나왔다. 옷의 토폴로지가
            # 두 다리를 따로 감싸고 있어서 그 사이의 틈은 어차피 메울 수 없다.
            # 단순히 바깥으로 미는 쪽이 실루엣이 낫다.
            for v in verts:
                if v.co.z >= hip:
                    continue
                t = min(1.0, (hip - v.co.z) / span)
                s = 1.0 + flare * t * t
                v.co.x *= s
                v.co.y *= s

    if drape > 0.0:
        drape_torso(cloth, blend=drape)
        # 띠 단위로 밀어냈으니 띠 경계에 계단이 남는다. 살짝 문질러 없앤다.
        bpy.context.view_layer.objects.active = cloth
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.vertices_smooth(factor=0.4, repeat=2)
        bpy.ops.object.mode_set(mode="OBJECT")

    # 밑단을 수평으로 끊는다 (상의 전용).
    #
    # 정점군만으로 자르면 밑단이 골반뼈 가중치 경계를 따라 들쭉날쭉하게 끝난다.
    # 환자복 상의는 허리 아래에서 일자로 떨어지므로 높이로 한 번 더 자른다.
    if cut_below is not None:
        low = {v.index for v in cloth.data.vertices if v.co.z < cut_below}
        if low and len(low) < len(cloth.data.vertices) * 0.9:
            select_verts(cloth, low)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.delete(type="VERT")
            bpy.ops.object.mode_set(mode="OBJECT")
            print("HEM_CUT 정점", len(low), "제거 (z <", round(cut_below, 3), ")")

    # 목선을 터 준다.
    #
    # 옷을 법선 방향으로 밀면 목 둘레도 같이 벌어져서, 목을 감싼 빳빳한 깃이
    # 생긴다. 환자복이든 스크럽이든 목에 그런 게 달려 있지 않다.
    #
    # 예전에는 맨 윗단(위 9%)에서 몸통 축에 가까운 정점을 반경으로 잘랐다.
    # 목둘레와 어깨 안쪽까지의 거리가 크게 다르지 않아서, 목이 남지 않게
    # 넉넉히 잡으면 어깨죽지까지 물렸다 — 치료사 스크럽 등판에 톱니 모양
    # 구멍이 뚫려 유니폼이 찢어진 것처럼 보이던 것이 이것이다.
    #
    # 목 정점군(Neck)의 가중치로 자르면 눈대중이 필요 없다. 목뼈가 절반 넘게
    # 지배하는 정점이 곧 목에 붙은 살이고, 옷은 거기서 끝나면 된다.
    neck_vg = next((v for v in cloth.vertex_groups if v.name.endswith("Neck")), None)
    if neck_vg:
        gi = neck_vg.index
        neck = {v.index for v in cloth.data.vertices
                if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
        if neck and len(neck) < len(cloth.data.vertices) * 0.3:
            select_verts(cloth, neck)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.delete(type="VERT")
            bpy.ops.object.mode_set(mode="OBJECT")
            print("NECKLINE 정점", len(neck), "제거")
        else:
            print("NECKLINE_SKIP", len(neck))

    # 터진 가장자리를 살에 붙인다.
    #
    # 이 옷은 몸 표면을 법선으로 offset 만큼 밀어낸 껍질이라, 잘린 가장자리마다
    # 몸과의 사이가 그만큼 벌어져 있다. 목둘레와 소맷단이 그 틈으로 시커멓게
    # 들여다보였다 — 멀리서 보면 어깨에 구멍이 난 것처럼 읽힌다.
    # 가장자리 한 줄만 도로 몸까지 끌어내리면 천이 살에 닿아 목선·소맷단이 된다.
    #
    # 밑단은 건드리지 않는다. 환자복 자락은 몸에서 떨어져 퍼져 있어야 하고,
    # 스크럽 바짓단도 발목에 붙이면 통이 사라진다.
    #
    # 붙일지 말지는 고리(가장자리 한 바퀴) 단위로 정한다. 정점 하나씩 뼈
    # 이름으로 골랐더니 같은 목둘레에서 어떤 정점은 붙고 어떤 정점은 남아
    # 깃이 톱니처럼 뾰족뾰족해졌다 (test/shots/gown-new-front.png).
    bm = bmesh.new()
    bm.from_mesh(cloth.data)
    edges = [(e.verts[0].index, e.verts[1].index) for e in bm.edges if len(e.link_faces) == 1]
    bm.free()

    # 이어진 가장자리끼리 묶는다 (합집합 찾기)
    up = {}

    def root(x):
        while up.get(x, x) != x:
            up[x] = up.get(up[x], up[x])
            x = up[x]
        return x

    for a, b in edges:
        up.setdefault(a, a)
        up.setdefault(b, b)
        ra, rb = root(a), root(b)
        if ra != rb:
            up[ra] = rb

    loops = {}
    for v in up:
        loops.setdefault(root(v), []).append(v)

    zs = [v.co.z for v in cloth.data.vertices]
    waist = min(zs) + (max(zs) - min(zs)) * 0.5    # 이 아래는 밑단으로 본다
    seal = set()
    for idxs in loops.values():
        mz = sum(cloth.data.vertices[i].co.z for i in idxs) / len(idxs)
        # seal_all — 상의처럼 밑단도 막아야 하는 옷.
        #
        # 밑단을 열어 두면 누워 있는 환자를 발치에서 봤을 때 그 구멍으로 옷
        # 안쪽(어두운 뒷면)이 가슴께에 시커먼 띠로 비친다. 바지·치맛자락은
        # 몸에서 떨어져 있어야 하니 그쪽은 계속 열어 둔다.
        if seal_all or mz > waist:
            seal.update(idxs)
    if seal:
        # 법선 방향으로 offset 만큼 끌어당기는 방법은 쓰지 않는다.
        #
        # 목둘레에서는 가장자리 법선이 사방으로 벌어져 있어서, 5cm 를 당기면
        # 정점들이 서로를 뚫고 지나가 깃이 톱니처럼 뻗쳤다
        # (test/shots/gown7.png). 몸에서 가장 가까운 점으로 바로 옮기면
        # 방향과 무관하게 언제나 살에 정확히 붙는다.
        deps = bpy.context.evaluated_depsgraph_get()
        bvh = BVHTree.FromObject(basemesh, deps)
        snapped = 0
        for i in seal:
            v = cloth.data.vertices[i]
            loc, nor, _idx, _d = bvh.find_nearest(v.co)
            if loc is None:
                continue
            v.co = loc + nor * 0.004      # 살에 4mm 띄워 얹는다
            snapped += 1
        print("SEAM_SNAP", snapped)
    print("SEAM 고리", len(loops), "붙인 정점", len(seal), "/ 가장자리", len(up))

    mat = bpy.data.materials.new(name + "_MAT")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgb
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.92
    cloth.data.materials.clear()
    cloth.data.materials.append(mat)
    if stripes:
        paint_stripes(cloth, mat, rgb)

    tris = sum(len(p.vertices) - 2 for p in cloth.data.polygons)
    print("GARMENT", name, region, "tris", tris)
    return cloth


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def simple_skin(obj, base_rgb=(0.86, 0.68, 0.56, 1.0), face_tex=None):
    """glTF 로 나갈 수 있는 단순 재질로 갈아끼운다.

    MPFB 기본 피부(ENHANCED_SSS)는 노드가 복잡해서 glTF 로 나가면 대부분 유실되고,
    남은 노드 때문에 내보내기가 느려지기만 한다. 웹에서는 Principled 한 장이면 된다.
    """
    mat = bpy.data.materials.new("PT_Skin")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_rgb
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.62
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
        if face_tex is not None:
            node = nodes.new("ShaderNodeTexImage")
            node.image = face_tex
            node.location = (-320, 200)
            # 픽셀을 sRGB 값으로 써 넣었으니 여기서도 sRGB 로 읽어야 한다.
            # Non-Color 로 두면 감마가 한 번 덜 풀려 피부가 거뭇해진다.
            node.image.colorspace_settings.name = "sRGB"
            links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def main():
    args = parse_args()
    bpy.ops.preferences.addon_enable(module=MOD)

    HumanService = importlib.import_module(MOD + ".services.humanservice").HumanService
    TargetService = importlib.import_module(MOD + ".services.targetservice").TargetService

    clear_scene()

    macro = TargetService.get_default_macro_info_dict()
    macro["gender"] = 1.0 if args.sex == "M" else 0.0
    macro["age"] = age_to_slider(args.age)
    macro["weight"] = args.weight
    macro["muscle"] = args.muscle
    macro["height"] = args.height
    asian = max(0.0, min(1.0, args.asian))
    rest = (1.0 - asian) / 2.0
    macro["race"] = {"asian": asian, "caucasian": rest, "african": rest}
    print("MACRO", macro)

    # scale=0.1 이라야 블렌더 1단위 = 1m 로 떨어진다 (MakeHuman 원본은 데시미터)
    # detailed_helpers 를 끄면 'helper-…' 뿐 아니라 'joint-…' 정점군까지 빠진다.
    # 그 관절 표식이 있어야 뼈대가 이 몸에 맞춰진다 (아래 add_builtin_rig 참고).
    # 헬퍼 지오메트리는 뼈대를 붙인 뒤 strip_helpers 로 지운다.
    basemesh = HumanService.create_human(
        mask_helpers=True, detailed_helpers=True, extra_vertex_groups=False,
        feet_on_ground=True, scale=0.1, macro_detail_dict=macro)

    bpy.context.view_layer.objects.active = basemesh
    basemesh.select_set(True)

    # 뼈대부터 붙이고 헬퍼는 그 다음에 지운다.
    #
    # 순서를 바꾸면 안 된다. MPFB 는 'joint-…' 정점군(관절 표식 큐브)의 위치를
    # 읽어 뼈를 놓는다. 그게 없으면 조용히 기본값 — 키 1.7m 짜리 표준 뼈대를
    # 그대로 붙인다. 키 1.44m 인 사람에게 1.7m 뼈대가 들어가 있어도 화면에는
    # 티가 안 난다. 기본 자세에서는 스키닝이 항등이라 몸이 그대로 그려지기
    # 때문이다. 그러나 뼈를 돌리는 순간 회전축이 몸 밖에 있어서, 팔이 천장으로
    # 솟고 어깨가 찢어졌다 (손뼈와 화면 속 손이 0.7m 어긋나 있었다).
    HumanService.add_builtin_rig(basemesh, args.rig, import_weights=True)
    print("RIG_ADDED", args.rig)

    strip_helpers(basemesh)

    face_tex = None if args.noface else build_face_texture(args.skin, eye_hex=args.eye)
    simple_skin(basemesh, hex_to_linear(args.skin), face_tex=face_tex)

    if args.garment == "gown":
        # 환자복 — 국내 병원의 연한 하늘색.
        #
        # b8cfe0 으로 잡았더니 감마를 푼 뒤 (0.48,0.62,0.75) 가 되어, 환자복이
        # 아니라 남색 잠수복처럼 어두워졌다. 눈으로 고른 16진수는 이미 sRGB
        # 라서 한 번 더 어두워진다는 걸 감안해 밝은 쪽으로 잡아야 한다.
        rgb = hex_to_linear("dce8f2")

        # 상의 + 바지 두 벌로 짓는다.
        #
        # 처음에는 어깨부터 허벅지까지 한 장으로 만들고 아래를 크게 벌렸다
        # (flare 0.78). 그랬더니 종 모양 원피스가 되어 환자복이 아니라 잠옷으로
        # 보였다. 실제 병원 환자복은 골반에서 한 번 끊기는 상하 두 벌이고,
        # 바지는 통이 좁게 일자로 떨어진다. 그 실루엣이라야 환자복으로 읽힌다.
        hip_z = None
        rig = basemesh.parent
        if rig and rig.type == "ARMATURE":
            hb = rig.data.bones.get("mixamorig:Hips")
            if hb:
                # 골반뼈보다 조금 아래에서 끊어야 허리선이 아니라 엉덩이를 덮는다
                hip_z = (rig.matrix_world @ hb.head_local).z - 0.07
        # 넉넉히 띄우고(offset) 몸 굴곡을 더 문질러 없앤다(smooth). 얇게 붙이면
        # 가슴·배 선이 그대로 비쳐 환자복이 아니라 쫄쫄이가 된다.
        build_garment(basemesh, "gown_top", "GarmentTop", rgb,
                      offset=0.050, flare=0.10, stripes=True, cut_below=hip_z,
                      smooth=9, drape=0.85, seal_all=True)
        bpy.context.view_layer.objects.active = basemesh
        # 바지는 상의보다 얇게 띄운다 — 상의 밑단이 바지 위로 덮여야 두 벌로 보인다
        build_garment(basemesh, "gown_pants", "GarmentPants", rgb,
                      offset=0.038, flare=0.10, stripes=True, smooth=8)
        bpy.context.view_layer.objects.active = basemesh
    elif args.garment != "none":
        # 치료사 스크럽 — game.js 의 buildTherapist 가 쓰던 남색(0x415d87)과 맞춘다.
        # 바지는 조금만 벌려야 통이 생기고, 많이 벌리면 치마가 된다.
        # 스크럽은 발목까지 통으로 내려와, 안 띄우면 잠수복처럼 붙어 보인다.
        build_garment(basemesh, args.garment, "Garment", hex_to_linear("415d87"),
                      offset=0.034, flare=0.12)
        bpy.context.view_layer.objects.active = basemesh

    if not args.bald:
        build_hair(basemesh, rgb=hex_to_linear(args.hair), style=args.hairstyle)
        bpy.context.view_layer.objects.active = basemesh

    tris = sum(len(p.vertices) - 2 for p in basemesh.data.polygons)
    print("MESH_TRIS", tris)
    print("HEIGHT_RAW_M", round(basemesh.dimensions.z, 3))

    # 목표 키 맞추기.
    #
    # 키 슬라이더로도 되지만 (0.5→1.49m, 0.7→1.77m) 원하는 키를 정확히 얻으려면
    # 슬라이더를 몇 번씩 다시 만들어 봐야 한다. 나이·체중은 이미 슬라이더로
    # 제대로 잡아 놓았으므로, 마지막 몇 %만 균일 배율로 맞춘다.
    #
    # 배율은 적용(apply)하지 않고 오브젝트 변환으로 둔다. glTF 는 이를 노드
    # 스케일로 그대로 내보내고, 아마추어에 스케일을 적용하면 본 길이·가중치가
    # 틀어질 수 있어서 건드리지 않는 편이 안전하다.
    if args.height_m > 0:
        cur = basemesh.dimensions.z
        if cur > 0:
            f = args.height_m / cur
            root = basemesh.parent or basemesh
            root.scale = (f, f, f)
            bpy.context.view_layer.update()
            print("HEIGHT_FIT", round(f, 4), "->", round(basemesh.dimensions.z, 3))

    # 본체의 셰이프키도 구운 뒤 내보낸다.
    #
    # MakeHuman 의 나이·체중·키는 전부 셰이프키다. 그대로 두면 glTF 가 이것을
    # 모프 타깃으로 싣는데, 삼각형 26,756개짜리 메시가 4.4MB 가 된다 (옷·머리는
    # 이미 구워서 각각 210KB·46KB 다). 런타임에 체형을 바꿀 일은 없으므로
    # 지금 모양만 굽고 버리면 된다.
    bake_shape_keys(basemesh)

    # 안구는 셰이프키를 구운 뒤에 놓는다. 굽기 전 좌표는 체형이 반영되지 않은
    # 기본형이라, 그걸 기준으로 놓으면 눈이 얼굴 밖에 뜬다.
    if not args.noface:
        build_eyes(basemesh, basemesh.parent, iris_hex=args.eye)

    # 뼈대가 이 몸에 맞게 놓였는지 확인한다.
    #
    # 관절 표식이 빠지면 MPFB 는 조용히 표준 뼈대를 쓰고, 기본 자세에서는
    # 아무 문제 없어 보인다. 어깨·골반이 키의 몇 %에 있는지 찍어 두면
    # 그 사고를 로그만 보고도 잡을 수 있다 (어깨 0.79 · 골반 0.54 가 정상).
    rig = basemesh.parent
    if rig and rig.type == "ARMATURE":
        h = basemesh.dimensions.z or 1.0
        frac = {}
        for n in ("RightArm", "Hips"):
            db = rig.data.bones.get("mixamorig:" + n)
            if db:
                frac[n] = round((rig.matrix_world @ db.head_local).z / h, 2)
        print("RIG_FIT 키", round(h, 3), "어깨", frac.get("RightArm"), "골반", frac.get("Hips"))

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", use_selection=True,
        export_apply=False, export_skins=True, export_animations=False,
        export_yup=True)
    print("EXPORTED", out, os.path.getsize(out))


main()
